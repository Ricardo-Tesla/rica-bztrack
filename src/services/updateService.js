import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

// Returns the update object if a newer version is published, otherwise null.
export async function checkForUpdate() {
  const update = await check()
  return update || null
}

// Download, install and restart. `onProgress` receives 0–100.
export async function installUpdate(update, onProgress = () => {}) {
  let total = 0
  let received = 0
  await update.downloadAndInstall(event => {
    if (event.event === 'Started') total = event.data.contentLength || 0
    if (event.event === 'Progress') {
      received += event.data.chunkLength
      if (total) onProgress(Math.min(100, Math.round((received / total) * 100)))
    }
  })
  await relaunch()
}
