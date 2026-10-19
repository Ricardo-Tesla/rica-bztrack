import { ask } from '@tauri-apps/plugin-dialog'

// Yes/No question in a native app dialog (instead of the browser's confirm()).
export async function confirmDialog(message, { title = 'Rica BizTrack', okLabel = 'Yes', danger = false } = {}) {
  try {
    return await ask(message, { title, kind: danger ? 'warning' : 'info', okLabel, cancelLabel: 'Cancel' })
  } catch {
    // Not running inside the desktop app (e.g. opened in a browser)
    return window.confirm(message)
  }
}
