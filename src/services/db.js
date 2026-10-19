import Database from '@tauri-apps/plugin-sql'
import { invoke } from '@tauri-apps/api/core'

let db = null

export async function getDb() {
  if (!db) {
    db = await Database.load('sqlite:rica_biztrack.db')
  }
  return db
}

// Run several statements as ONE all-or-nothing database transaction.
// If any statement fails — or a statement with `expectChanges` changes a
// different number of rows — everything is rolled back and nothing is saved.
//
// statements: [{ sql, params, expectChanges?, errorMessage? }]
// Returns: [{ rowsAffected, lastInsertId }] — one entry per statement.
export async function runTransaction(statements) {
  return await invoke('db_transaction', { statements })
}

// Use as a param to insert the id of the row created by statement number `index`
// earlier in the same runTransaction() call.
export function ref(index) {
  return { $ref: index }
}
