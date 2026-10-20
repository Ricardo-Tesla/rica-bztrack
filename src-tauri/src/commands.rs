// Custom database commands that the JavaScript side cannot do safely on its own.
//
// The SQL plugin runs every `db.execute()` call on whichever pooled connection is
// free, so a `BEGIN ... COMMIT` sent from JavaScript is not reliable. These
// commands borrow the plugin's own connection pool and run the work on a single
// connection, so it is truly all-or-nothing.

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::sqlite::{SqliteConnectOptions, SqliteConnection};
use sqlx::{Connection, Pool, Row, Sqlite};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_sql::{DbInstances, DbPool};

pub const DB_URL: &str = "sqlite:rica_biztrack.db";
const DB_FILE: &str = "rica_biztrack.db";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TxStatement {
    sql: String,
    #[serde(default)]
    params: Vec<Value>,
    /// If set, the statement must change exactly this many rows, otherwise the
    /// whole transaction is cancelled (used for "only if enough stock" updates).
    expect_changes: Option<u64>,
    /// Message returned to the app when `expect_changes` is not met.
    error_message: Option<String>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TxResult {
    rows_affected: u64,
    last_insert_id: i64,
}

/// Get the SQLite pool that the SQL plugin opened for our database.
async fn get_pool(instances: &DbInstances) -> Result<Pool<Sqlite>, String> {
    let map = instances.0.read().await;
    #[allow(unreachable_patterns)]
    match map.get(DB_URL) {
        Some(DbPool::Sqlite(pool)) => Ok(pool.clone()),
        _ => Err("Database is not loaded yet".into()),
    }
}

fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    // Same folder the SQL plugin uses for "sqlite:rica_biztrack.db".
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(dir.join(DB_FILE))
}

fn unix_time() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Run several SQL statements as ONE transaction. If any statement fails, or
/// changes a different number of rows than `expectChanges`, nothing is saved.
///
/// A param written as `{ "$ref": n }` is replaced with the id of the row
/// inserted by statement number `n` (0-based) in this same call.
#[tauri::command]
pub async fn db_transaction(
    instances: State<'_, DbInstances>,
    statements: Vec<TxStatement>,
) -> Result<Vec<TxResult>, String> {
    let pool = get_pool(&instances).await?;
    run_statements(&pool, &statements).await
}

async fn run_statements(
    pool: &Pool<Sqlite>,
    statements: &[TxStatement],
) -> Result<Vec<TxResult>, String> {
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;
    let mut results: Vec<TxResult> = Vec::with_capacity(statements.len());

    for stmt in statements {
        let mut query = sqlx::query(&stmt.sql);

        for param in &stmt.params {
            // Resolve { "$ref": n } to an earlier statement's new row id
            let resolved = match param.get("$ref").and_then(Value::as_u64) {
                Some(idx) => {
                    let r = results
                        .get(idx as usize)
                        .ok_or_else(|| format!("Invalid $ref {idx}"))?;
                    Value::from(r.last_insert_id)
                }
                None => param.clone(),
            };

            query = match resolved {
                Value::Null => query.bind(None::<String>),
                Value::Bool(b) => query.bind(b),
                Value::Number(n) => match n.as_i64() {
                    Some(i) => query.bind(i),
                    None => query.bind(n.as_f64()),
                },
                Value::String(s) => query.bind(s),
                other => query.bind(other.to_string()),
            };
        }

        // Returning early drops `tx`, which rolls everything back.
        let done = query.execute(&mut *tx).await.map_err(|e| e.to_string())?;

        if let Some(expected) = stmt.expect_changes {
            if done.rows_affected() != expected {
                return Err(stmt
                    .error_message
                    .clone()
                    .unwrap_or_else(|| "Operation cancelled: data changed unexpectedly".into()));
            }
        }

        results.push(TxResult {
            rows_affected: done.rows_affected(),
            last_insert_id: done.last_insert_rowid(),
        });
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(results)
}

/// Write a consistent snapshot of the live database to `target` using
/// SQLite's `VACUUM INTO` (safe while the app is running, includes all recent
/// changes). Writes to a temporary file first so a failed backup never leaves
/// a half-written file behind.
async fn snapshot_to(pool: &Pool<Sqlite>, target: &Path) -> Result<(), String> {
    let partial = target.with_extension("db.partial");
    let _ = std::fs::remove_file(&partial);

    sqlx::query("VACUUM INTO ?")
        .bind(partial.to_string_lossy().to_string())
        .execute(pool)
        .await
        .map_err(|e| format!("Backup failed: {e}"))?;

    std::fs::rename(&partial, target).map_err(|e| {
        let _ = std::fs::remove_file(&partial);
        format!("Could not save backup file: {e}")
    })
}

#[tauri::command]
pub async fn backup_database(
    instances: State<'_, DbInstances>,
    destination: String,
) -> Result<String, String> {
    let pool = get_pool(&instances).await?;
    snapshot_to(&pool, Path::new(&destination)).await?;
    Ok(destination)
}

const AUTO_PREFIX: &str = "rica_biztrack_auto_";

/// Where automatic backups go when no folder is chosen:
/// Documents\Rica BizTrack Backups (or the app data folder if there is no Documents).
fn resolve_backup_folder(app: &AppHandle, folder: Option<String>) -> Result<PathBuf, String> {
    let dir = match folder.filter(|f| !f.trim().is_empty()) {
        Some(f) => PathBuf::from(f),
        None => match app.path().document_dir() {
            Ok(d) => d.join("Rica BizTrack Backups"),
            Err(_) => app
                .path()
                .app_data_dir()
                .map_err(|e| e.to_string())?
                .join("backups"),
        },
    };
    std::fs::create_dir_all(&dir).map_err(|e| format!("Could not create backup folder: {e}"))?;
    Ok(dir)
}

#[tauri::command]
pub fn default_backup_folder(app: AppHandle) -> Result<String, String> {
    Ok(resolve_backup_folder(&app, None)?.to_string_lossy().to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupFile {
    name: String,
    path: String,
    size: u64,
}

fn auto_backups_in(dir: &Path) -> Vec<PathBuf> {
    let mut files: Vec<PathBuf> = std::fs::read_dir(dir)
        .map(|entries| {
            entries
                .filter_map(|e| e.ok().map(|e| e.path()))
                .filter(|p| {
                    p.file_name()
                        .and_then(|n| n.to_str())
                        .map(|n| n.starts_with(AUTO_PREFIX) && n.ends_with(".db"))
                        .unwrap_or(false)
                })
                .collect()
        })
        .unwrap_or_default();
    // Names contain the date (YYYY-MM-DD), so sorting by name sorts by date
    files.sort();
    files.reverse();
    files
}

/// Daily automatic backup. `date` is today's LOCAL date (YYYY-MM-DD) from the app.
/// Does nothing if today's backup already exists. Keeps the newest `keep` files.
async fn auto_backup_into(pool: &Pool<Sqlite>, dir: &Path, date: &str, keep: usize) -> Result<String, String> {
    if date.len() != 10 || !date.chars().all(|c| c.is_ascii_digit() || c == '-') {
        return Err("Invalid date".into());
    }
    let target = dir.join(format!("{AUTO_PREFIX}{date}.db"));
    if !target.exists() {
        snapshot_to(pool, &target).await?;
    }
    for old in auto_backups_in(dir).into_iter().skip(keep.max(1)) {
        let _ = std::fs::remove_file(old);
    }
    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn auto_backup(
    app: AppHandle,
    instances: State<'_, DbInstances>,
    folder: Option<String>,
    date: String,
    keep: u32,
) -> Result<String, String> {
    let pool = get_pool(&instances).await?;
    let dir = resolve_backup_folder(&app, folder)?;
    auto_backup_into(&pool, &dir, &date, keep as usize).await
}

#[tauri::command]
pub fn list_auto_backups(app: AppHandle, folder: Option<String>) -> Result<Vec<BackupFile>, String> {
    let dir = resolve_backup_folder(&app, folder)?;
    Ok(auto_backups_in(&dir)
        .into_iter()
        .map(|p| BackupFile {
            name: p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
            size: std::fs::metadata(&p).map(|m| m.len()).unwrap_or(0),
            path: p.to_string_lossy().to_string(),
        })
        .collect())
}

/// Folder that holds the log file (shown in Settings → About for support)
#[tauri::command]
pub fn log_folder(app: AppHandle) -> Result<String, String> {
    app.path()
        .app_log_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

/// Check that a file is a healthy Rica BizTrack database.
async fn validate_backup(path: &Path) -> Result<(), String> {
    let invalid = "This file is not a valid Rica BizTrack backup.";
    let opts = SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(false);
    let mut conn = SqliteConnection::connect_with(&opts)
        .await
        .map_err(|_| invalid.to_string())?;

    let check: Result<(), String> = async {
        let row = sqlx::query("PRAGMA quick_check")
            .fetch_one(&mut conn)
            .await
            .map_err(|_| invalid.to_string())?;
        let status: String = row.try_get(0).map_err(|_| invalid.to_string())?;
        if status != "ok" {
            return Err("This backup file is damaged and cannot be restored.".into());
        }

        let row = sqlx::query(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table'
             AND name IN ('products', 'sales', 'sale_items', 'expenses', 'transactions')",
        )
        .fetch_one(&mut conn)
        .await
        .map_err(|_| invalid.to_string())?;
        let tables: i64 = row.try_get(0).map_err(|_| invalid.to_string())?;
        if tables != 5 {
            return Err(invalid.into());
        }
        Ok(())
    }
    .await;

    let _ = conn.close().await;
    check
}

/// Replace all current data with a backup file, then restart the app.
/// A safety copy of the current data is saved first in the app's
/// `backups` folder (pre-restore-<time>.db).
#[tauri::command]
pub async fn restore_database(
    app: AppHandle,
    instances: State<'_, DbInstances>,
    source: String,
) -> Result<(), String> {
    let source = PathBuf::from(&source);
    let live = db_path(&app)?;

    if let (Ok(a), Ok(b)) = (source.canonicalize(), live.canonicalize()) {
        if a == b {
            return Err("That is the live database, not a backup file.".into());
        }
    }

    // 1. Copy the backup next to the live database and check it is valid
    let incoming = live.with_extension("db.restore");
    let _ = std::fs::remove_file(&incoming);
    std::fs::copy(&source, &incoming).map_err(|e| format!("Could not read backup: {e}"))?;
    if let Err(e) = validate_backup(&incoming).await {
        let _ = std::fs::remove_file(&incoming);
        return Err(e);
    }

    // 2. Safety copy of the current data
    let pool = get_pool(&instances).await?;
    let safety_dir = live
        .parent()
        .map(|p| p.join("backups"))
        .ok_or("Invalid database path")?;
    std::fs::create_dir_all(&safety_dir).map_err(|e| e.to_string())?;
    let safety = safety_dir.join(format!("pre-restore-{}.db", unix_time()));
    if let Err(e) = snapshot_to(&pool, &safety).await {
        let _ = std::fs::remove_file(&incoming);
        return Err(format!("Could not save a safety copy, restore cancelled. {e}"));
    }

    // 3. Close every connection, swap the files, and restart
    pool.close().await;
    for ext in ["db-wal", "db-shm"] {
        let _ = std::fs::remove_file(live.with_extension(ext));
    }
    if let Err(e) = std::fs::rename(&incoming, &live) {
        // The old database is untouched; restart so it is reopened.
        eprintln!("Restore failed while replacing the database: {e}");
    }

    app.restart();
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    fn stmt(sql: &str, params: Vec<Value>) -> TxStatement {
        TxStatement { sql: sql.into(), params, expect_changes: None, error_message: None }
    }

    async fn test_pool(file: &Path) -> Pool<Sqlite> {
        let opts = SqliteConnectOptions::new().filename(file).create_if_missing(true);
        let pool = SqlitePoolOptions::new().max_connections(4).connect_with(opts).await.unwrap();
        for m in crate::database::get_migrations() {
            sqlx::raw_sql(m.sql).execute(&pool).await.unwrap();
        }
        sqlx::query("INSERT INTO products (name, sku, stock) VALUES ('Rice', 'R1', 5)")
            .execute(&pool).await.unwrap();
        pool
    }

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("biztrack-test-{name}-{}", unix_time()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    async fn count(pool: &Pool<Sqlite>, table: &str) -> i64 {
        sqlx::query(&format!("SELECT COUNT(*) FROM {table}"))
            .fetch_one(pool).await.unwrap().get(0)
    }

    #[test]
    fn transaction_commits_and_resolves_refs() {
        tauri::async_runtime::block_on(async {
            let dir = temp_dir("commit");
            let pool = test_pool(&dir.join("t.db")).await;
            let results = run_statements(&pool, &[
                stmt("INSERT INTO sales (receipt_number, customer_id, total) VALUES (?, ?, ?)",
                     vec!["RCT-1".into(), Value::Null, 12.5.into()]),
                stmt("INSERT INTO sale_items (sale_id, product_id, product_name, quantity) VALUES (?, 1, 'Rice', 2)",
                     vec![serde_json::json!({ "$ref": 0 })]),
            ]).await.unwrap();

            let sale_id: i64 = sqlx::query("SELECT sale_id FROM sale_items")
                .fetch_one(&pool).await.unwrap().get(0);
            assert_eq!(sale_id, results[0].last_insert_id);
            let total: f64 = sqlx::query("SELECT total FROM sales").fetch_one(&pool).await.unwrap().get(0);
            assert_eq!(total, 12.5);
        });
    }

    #[test]
    fn transaction_rolls_back_everything_when_expect_changes_fails() {
        tauri::async_runtime::block_on(async {
            let dir = temp_dir("rollback");
            let pool = test_pool(&dir.join("t.db")).await;
            let mut check = stmt("UPDATE products SET stock = stock - ? WHERE id = 1 AND stock >= ?",
                                 vec![9.into(), 9.into()]);
            check.expect_changes = Some(1);
            check.error_message = Some("Not enough stock".into());

            let err = run_statements(&pool, &[
                stmt("INSERT INTO sales (receipt_number) VALUES ('RCT-2')", vec![]),
                check,
            ]).await.unwrap_err();

            assert_eq!(err, "Not enough stock");
            assert_eq!(count(&pool, "sales").await, 0);
            let stock: i64 = sqlx::query("SELECT stock FROM products").fetch_one(&pool).await.unwrap().get(0);
            assert_eq!(stock, 5);
        });
    }

    #[test]
    fn duplicate_receipt_error_mentions_the_column() {
        tauri::async_runtime::block_on(async {
            let dir = temp_dir("unique");
            let pool = test_pool(&dir.join("t.db")).await;
            let insert = || stmt("INSERT INTO sales (receipt_number) VALUES ('SAME')", vec![]);
            run_statements(&pool, &[insert()]).await.unwrap();
            let err = run_statements(&pool, &[insert()]).await.unwrap_err();
            assert!(err.contains("UNIQUE constraint failed: sales.receipt_number"), "{err}");
        });
    }

    #[test]
    fn backup_snapshot_is_complete_and_validates() {
        tauri::async_runtime::block_on(async {
            let dir = temp_dir("backup");
            let pool = test_pool(&dir.join("live.db")).await;
            let target = dir.join("backup.db");
            std::fs::write(&target, b"old file").unwrap(); // overwriting must work

            snapshot_to(&pool, &target).await.unwrap();
            assert!(!target.with_extension("db.partial").exists());
            validate_backup(&target).await.unwrap();

            let opts = SqliteConnectOptions::new().filename(&target);
            let mut conn = SqliteConnection::connect_with(&opts).await.unwrap();
            let n: i64 = sqlx::query("SELECT COUNT(*) FROM products").fetch_one(&mut conn).await.unwrap().get(0);
            assert_eq!(n, 1);
        });
    }

    #[test]
    fn auto_backup_runs_once_per_day_and_keeps_the_newest() {
        tauri::async_runtime::block_on(async {
            let dir = temp_dir("auto");
            let pool = test_pool(&dir.join("live.db")).await;
            let backups = dir.join("backups");
            std::fs::create_dir_all(&backups).unwrap();

            for day in ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"] {
                auto_backup_into(&pool, &backups, day, 3).await.unwrap();
            }
            // Same day again: no new file
            auto_backup_into(&pool, &backups, "2026-10-04", 3).await.unwrap();

            let names: Vec<String> = auto_backups_in(&backups)
                .iter()
                .map(|p| p.file_name().unwrap().to_string_lossy().to_string())
                .collect();
            assert_eq!(names, vec![
                "rica_biztrack_auto_2026-10-04.db",
                "rica_biztrack_auto_2026-10-03.db",
                "rica_biztrack_auto_2026-10-02.db",
            ]);
            validate_backup(&backups.join("rica_biztrack_auto_2026-10-04.db")).await.unwrap();
            assert!(auto_backup_into(&pool, &backups, "../../evil", 3).await.is_err());
        });
    }

    #[test]
    fn validate_rejects_non_backup_files() {
        tauri::async_runtime::block_on(async {
            let dir = temp_dir("invalid");
            let junk = dir.join("junk.db");
            std::fs::write(&junk, b"this is not a database").unwrap();
            assert!(validate_backup(&junk).await.is_err());
            assert!(validate_backup(&dir.join("missing.db")).await.is_err());
        });
    }
}
