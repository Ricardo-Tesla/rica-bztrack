// Runs the app's REAL services against a REAL in-memory SQLite database built
// from the real migrations. Use in a test file with:
//
//   vi.mock('../../services/db', async () => (await import('./appDb')).dbModule)
//   beforeEach(() => { db = freshDb() })
//
import { createDb, runInTestDb } from './realDb'

let current = null

export function freshDb(upToVersion) {
  current = createDb(upToVersion)
  return current
}

export function currentDb() {
  return current
}

// Same value conversions the Tauri SQL plugin does
const norm = params => (params || []).map(v => (v === true ? 1 : v === false ? 0 : v === undefined ? null : v))

export const dbModule = {
  getDb: async () => ({
    select: async (sql, params) => current.prepare(sql).all(...norm(params)),
    execute: async (sql, params) => {
      const r = current.prepare(sql).run(...norm(params))
      return { rowsAffected: r.changes, lastInsertId: Number(r.lastInsertRowid) }
    },
  }),
  runTransaction: async statements => runInTestDb(current)(statements.map(s => ({ ...s, params: norm(s.params) }))),
  ref: index => ({ $ref: index }),
}
