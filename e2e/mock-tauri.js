// Simulates the Tauri desktop backend in a normal browser, using sql.js
// (SQLite compiled to JavaScript) and the app's real migrations.
//
// Test hooks (set from a test with page.evaluate):
//   window.__failNext = { cmd: 'db_transaction', error: 'disk I/O error' }
//       → the next call of that command fails with that error
//   window.__askAnswer = false   → confirmation dialogs answer "No"
//   window.__printed             → how many times the app printed
/* global initSqlJs, __MIGRATIONS__ */
(function () {
  const calls = []
  window.__mockCalls = calls
  window.__printed = 0
  window.print = () => { window.__printed++ }

  const ready = initSqlJs().then(SQL => {
    const db = new SQL.Database()
    db.exec('PRAGMA foreign_keys = ON')
    for (const sql of __MIGRATIONS__) db.exec(sql)
    window.__db = db
    return db
  })

  const norm = v => (v === true ? 1 : v === false ? 0 : v === undefined ? null : v)

  function run(db, sql, params) {
    db.run(sql, (params || []).map(norm))
    const changes = db.getRowsModified()
    const id = db.exec('SELECT last_insert_rowid()')[0].values[0][0]
    return { rowsAffected: changes, lastInsertId: id }
  }

  function select(db, sql, params) {
    const stmt = db.prepare(sql)
    stmt.bind((params || []).map(norm))
    const rows = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return rows
  }

  const handlers = {
    'plugin:sql|load': () => 'sqlite:rica_biztrack.db',
    'plugin:sql|select': (db, a) => select(db, a.query, a.values),
    'plugin:sql|execute': (db, a) => { const r = run(db, a.query, a.values); return [r.rowsAffected, r.lastInsertId] },
    'db_transaction': (db, a) => {
      db.exec('BEGIN')
      try {
        const results = []
        for (const s of a.statements) {
          const params = (s.params || []).map(p => (p && typeof p === 'object' && '$ref' in p ? results[p.$ref].lastInsertId : p))
          const r = run(db, s.sql, params)
          if (s.expectChanges != null && r.rowsAffected !== s.expectChanges) {
            throw s.errorMessage || 'Operation cancelled: data changed unexpectedly'
          }
          results.push(r)
        }
        db.exec('COMMIT')
        return results
      } catch (e) {
        db.exec('ROLLBACK')
        throw typeof e === 'string' ? e : String(e.message || e)
      }
    },
    'auto_backup': (db, a) => `C:\\Users\\shop\\Documents\\Rica BizTrack Backups\\rica_biztrack_auto_${a.date}.db`,
    'list_auto_backups': () => [{ name: 'rica_biztrack_auto_2026-10-18.db', path: 'C:\\b\\rica_biztrack_auto_2026-10-18.db', size: 81920 }],
    'default_backup_folder': () => 'C:\\Users\\shop\\Documents\\Rica BizTrack Backups',
    'log_folder': () => 'C:\\Users\\shop\\AppData\\Local\\com.ricabiztrack.app\\logs',
    'backup_database': (db, a) => a.destination,
    'plugin:app|version': () => '1.0.0',
    'plugin:log|log': () => null,
    'plugin:dialog|ask': () => window.__askAnswer ?? true,
    'plugin:dialog|confirm': () => window.__askAnswer ?? true,
    'plugin:dialog|message': () => null,
    'plugin:dialog|save': () => null,
    'plugin:dialog|open': () => null,
    'plugin:updater|check': () => null,
  }

  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main', windowLabel: 'main' } },
    transformCallback: () => Math.floor(Math.random() * 1e9),
    unregisterCallback: () => {},
    convertFileSrc: p => p,
    async invoke(cmd, args) {
      calls.push(cmd)
      const db = await ready
      const fail = window.__failNext
      if (fail && fail.cmd === cmd) { window.__failNext = null; throw fail.error }
      const h = handlers[cmd]
      if (!h) throw `Mock: no handler for ${cmd}`
      return h(db, args || {})
    },
  }
})()
