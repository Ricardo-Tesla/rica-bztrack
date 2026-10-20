import { useEffect, useState } from 'react'
import { getVersion } from '@tauri-apps/api/app'
import { useApp } from '../../context/AppContext'
import { checkForUpdate, installUpdate } from '../../services/updateService'
import { getLogFolder } from '../../services/backupService'
import { Alert, Button } from '../ui'
import { errorText } from '../../utils/errors'

export default function UpdateSettings() {
  const { t } = useApp()
  const [version, setVersion] = useState('')
  const [logFolder, setLogFolder] = useState('')
  const [update, setUpdate] = useState(null)
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null)

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {})
    getLogFolder().then(setLogFolder).catch(() => {})
  }, [])

  async function check() {
    try {
      setBusy(true)
      setStatus(null)
      const found = await checkForUpdate()
      setUpdate(found)
      if (!found) setStatus({ type: 'success', text: t('You have the latest version.') })
    } catch (err) {
      setStatus({ type: 'error', text: t('Could not check for updates. Are you connected to the internet?') + '\n' + errorText(t, err) })
    } finally {
      setBusy(false)
    }
  }

  async function install() {
    try {
      setBusy(true)
      await installUpdate(update, setProgress)
    } catch (err) {
      setStatus({ type: 'error', text: errorText(t, err) })
      setBusy(false)
    }
  }

  return (
    <>
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
        <h2 className="font-bold text-white mb-4">{t('Updates')}</h2>
        <Alert type={status?.type} onClose={() => setStatus(null)}>{status?.text}</Alert>
        <p className="text-sm text-gray-300 mb-4">{t('Installed version')}: <span className="font-mono text-yellow-400">{version || '—'}</span></p>
        {update ? (
          <div className="bg-gray-950 border border-yellow-800 rounded-lg p-4 mb-4">
            <div className="text-yellow-400 font-semibold mb-1">{t('Version {v} is available', { v: update.version })}</div>
            {update.body && <pre className="text-xs text-gray-400 whitespace-pre-wrap mb-3">{update.body}</pre>}
            <p className="text-xs text-gray-500 mb-3">{t('Make sure no sale is in progress. The app will close, update and open again. Your data is kept.')}</p>
            <Button onClick={install} disabled={busy}>
              {progress != null ? t('Downloading… {p}%', { p: progress }) : t('Install update')}
            </Button>
          </div>
        ) : (
          <Button onClick={check} disabled={busy}>{busy ? t('Checking...') : t('Check for updates')}</Button>
        )}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6 text-sm text-gray-400 space-y-2">
        <h2 className="font-bold text-white mb-2">{t('About')}</h2>
        <p><span className="text-yellow-400 font-semibold">Rica BizTrack</span> — {t('offline business management for small businesses.')}</p>
        <p>© {new Date().getFullYear()} Ricardo Tesla</p>
        <p>{t('Receipts from this app are not EBM invoices.')}</p>
        {logFolder && <p className="text-xs">{t('Log files (for support)')}: <span className="font-mono text-gray-300 select-all">{logFolder}</span></p>}
      </div>
    </>
  )
}
