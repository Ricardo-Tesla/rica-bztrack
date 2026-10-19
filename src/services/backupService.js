import { invoke } from '@tauri-apps/api/core'
import { save, open, ask } from '@tauri-apps/plugin-dialog'

function localDate() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Save a complete, consistent copy of the database.
// The copy is made by SQLite itself (VACUUM INTO), so it is safe while the app
// is running and always includes the latest sales.
export async function backupDatabase() {
  try {
    const savePath = await save({
      defaultPath: `rica_biztrack_backup_${localDate()}.db`,
      filters: [{ name: 'Database Backup', extensions: ['db'] }]
    })

    if (!savePath) return { success: false, cancelled: true }

    await invoke('backup_database', { destination: savePath })
    return { success: true, path: savePath }
  } catch (err) {
    console.error('Backup failed:', err)
    return { success: false, error: String(err?.message || err) }
  }
}

// Replace all current data with a backup file.
// The backup is checked first, and a safety copy of the current data is saved
// in the app's data folder (backups/pre-restore-*.db). The app then restarts.
export async function restoreDatabase() {
  try {
    const filePath = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'Database Backup', extensions: ['db'] }]
    })

    if (!filePath) return { success: false, cancelled: true }

    const confirmed = await ask(
      'This will replace ALL current data with the data in this backup.\n\n' +
      'A safety copy of your current data will be saved first, and the app will restart.\n\n' +
      'Do you want to continue?',
      { title: 'Restore backup', kind: 'warning', okLabel: 'Restore', cancelLabel: 'Cancel' }
    )

    if (!confirmed) return { success: false, cancelled: true }

    // On success the app restarts, so this call normally never returns.
    await invoke('restore_database', { source: filePath })
    return { success: true }
  } catch (err) {
    console.error('Restore failed:', err)
    return { success: false, error: String(err?.message || err) }
  }
}
