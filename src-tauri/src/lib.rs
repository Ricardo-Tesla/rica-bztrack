mod commands;
mod database;

use tauri_plugin_log::{RotationStrategy, Target, TargetKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Log file for support: %LOCALAPPDATA%\com.ricabiztrack.app\logs
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::LogDir {
                        file_name: Some("rica-biztrack".into()),
                    }),
                    Target::new(TargetKind::Stdout),
                ])
                .level(log::LevelFilter::Info)
                .max_file_size(2_000_000)
                .rotation_strategy(RotationStrategy::KeepOne)
                .build(),
        )
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(commands::DB_URL, database::get_migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            commands::db_transaction,
            commands::backup_database,
            commands::restore_database,
            commands::auto_backup,
            commands::list_auto_backups,
            commands::default_backup_folder,
            commands::log_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
