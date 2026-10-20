import { invoke } from '@tauri-apps/api/core'
import { save, open, ask } from '@tauri-apps/plugin-dialog'
import { todayLocal } from '../utils/format'
import { t } from '../i18n'

// Save a complete, consistent copy of the database.
// The copy is made by SQLite itself (VACUUM INTO), so it is safe while the app
// is running and always includes the latest sales.
export async function backupDatabase() {
  try {
    const savePath = await save({
      defaultPath: `rica_biztrack_backup_${todayLocal()}.db`,
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
export async function restoreDatabase(chosenPath = null, defaultFolder = undefined) {
  try {
    const filePath = chosenPath || await open({
      multiple: false,
      directory: false,
      defaultPath: defaultFolder,
      filters: [{ name: 'Database Backup', extensions: ['db'] }]
    })

    if (!filePath) return { success: false, cancelled: true }

    const confirmed = await ask(
      t('This will replace ALL current data with the data in this backup.') + '\n\n' +
      t('A safety copy of your current data will be saved first, and the app will restart.') + '\n\n' +
      t('Do you want to continue?'),
      { title: t('Restore backup'), kind: 'warning', okLabel: t('Restore'), cancelLabel: t('Cancel') }
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

// Daily automatic backup (runs when the app starts and every hour while it is open).
// Returns the path of today's backup.
export async function runAutoBackup(settings) {
  return await invoke('auto_backup', {
    folder: settings.backup_folder || null,
    date: todayLocal(),
    keep: Math.max(1, parseInt(settings.backup_keep) || 30),
  })
}

export async function listAutoBackups(folder) {
  return await invoke('list_auto_backups', { folder: folder || null })
}

export async function getDefaultBackupFolder() {
  return await invoke('default_backup_folder')
}

export async function chooseBackupFolder() {
  return await open({ directory: true, multiple: false })
}

export async function getLogFolder() {
  return await invoke('log_folder')
}
