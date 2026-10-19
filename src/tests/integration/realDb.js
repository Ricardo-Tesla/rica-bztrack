// Test helpers that use the REAL database migrations from src-tauri/src/database.rs
//
// `runInTestDb` behaves like the Rust `db_transaction` command: all statements
// run in one transaction, `{ $ref: n }` params become statement n's new row id,
// and `expectChanges` cancels everything when not met.
import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

const migrationsFile = resolve(process.cwd(), 'src-tauri/src/database.rs')
export const MIGRATIONS = [...readFileSync(migrationsFile, 'utf8').matchAll(/sql:\s*"([\s\S]*?)",\s*kind:/g)]
  .map(m => m[1])

export function createDb(upToVersion = MIGRATIONS.length) {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  MIGRATIONS.slice(0, upToVersion).forEach(sql => db.exec(sql))
  return db
}

export function runInTestDb(db) {
  return async (statements) => {
    const tx = db.transaction(() => {
      const results = []
      for (const s of statements) {
        const params = (s.params || []).map(p =>
          p && typeof p === 'object' && '$ref' in p ? results[p.$ref].lastInsertId : p
        )
        const r = db.prepare(s.sql).run(...params)
        if (s.expectChanges !== undefined && r.changes !== s.expectChanges) {
          throw s.errorMessage || 'Operation cancelled'
        }
        results.push({ rowsAffected: r.changes, lastInsertId: Number(r.lastInsertRowid) })
      }
      return results
    })
    return tx()
  }
}

