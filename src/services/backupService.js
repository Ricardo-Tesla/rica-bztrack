import { appDataDir, join } from '@tauri-apps/api/path'
import { copyFile } from '@tauri-apps/plugin-fs'
import { save } from '@tauri-apps/plugin-dialog'

export async function backupDatabase() {
  try {
    // Get the path to the database file
    const appData = await appDataDir()
    const dbPath = await join(appData, 'rica_biztrack.db')

    // Format today's date for the filename
    const today = new Date().toISOString().split('T')[0]
    const defaultName = `rica_biztrack_backup_${today}.db`

    // Open save dialog
    const savePath = await save({
      defaultPath: defaultName,
      filters: [{ name: 'Database Backup', extensions: ['db'] }]
    })

    if (!savePath) return { success: false, cancelled: true }

    // Copy the database file to the chosen location
    await copyFile(dbPath, savePath)

    return { success: true, path: savePath }
  } catch (err) {
    console.error('Backup failed:', err)
    return { success: false, error: err.message }
  }
}