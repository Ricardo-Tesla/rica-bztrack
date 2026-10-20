// Writes errors to the app's log file (for support) and the console.
// Log file location on Windows: %LOCALAPPDATA%\com.ricabiztrack.app\logs\
let plugin = null
async function getPlugin() {
  if (plugin === null) {
    try { plugin = await import('@tauri-apps/plugin-log') } catch { plugin = false }
  }
  return plugin
}

function format(message, extra) {
  if (!extra) return String(message)
  const detail = extra instanceof Error ? `${extra.message}\n${extra.stack || ''}` : String(extra)
  return `${message} — ${detail}`
}

export async function logError(message, extra) {
  const text = format(message, extra)
  console.error(text)
  try { const p = await getPlugin(); if (p) await p.error(text) } catch { /* ignore */ }
}

export async function logInfo(message) {
  console.info(message)
  try { const p = await getPlugin(); if (p) await p.info(String(message)) } catch { /* ignore */ }
}

// Catch errors that happen outside React
export function installGlobalErrorLogging() {
  window.addEventListener('error', e => logError('Uncaught error', e.error || e.message))
  window.addEventListener('unhandledrejection', e => logError('Unhandled promise rejection', e.reason))
}
