import { useEffect, useState } from 'react'
import { useApp } from '../../context/AppContext'
import {
  backupDatabase, restoreDatabase, runAutoBackup, listAutoBackups,
  getDefaultBackupFolder, chooseBackupFolder,
} from '../../services/backupService'
import { Alert, Button, Field, inputClass } from '../ui'
import { errorText } from '../../utils/errors'
import { todayLocal } from '../../utils/format'

export default function BackupSettings() {
  const { t, settings, saveSettings } = useApp()
  const [defaultFolder, setDefaultFolder] = useState('')
  const [files, setFiles] = useState([])
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const folder = settings.backup_folder || defaultFolder

  async function refresh() {
    try {
      setDefaultFolder(await getDefaultBackupFolder())
      setFiles(await listAutoBackups(settings.backup_folder))
    } catch (err) {
      setStatus({ type: 'error', text: errorText(t, err) })
    }
  }
  useEffect(() => { refresh() }, [settings.backup_folder]) // eslint-disable-line react-hooks/exhaustive-deps

  async function changeFolder() {
    const chosen = await chooseBackupFolder()
    if (!chosen) return
    await saveSettings({ backup_folder: chosen })
    setStatus({ type: 'success', text: t('Backup folder changed') })
  }

  async function backupNow() {
    try {
      setBusy(true)
      await runAutoBackup(settings)
      await saveSettings({ last_auto_backup: todayLocal() })
      await refresh()
      setStatus({ type: 'success', text: t('Backup saved!') })
    } catch (err) {
      setStatus({ type: 'error', text: errorText(t, err) })
    } finally {
      setBusy(false)
    }
  }

  async function saveCopy() {
    const result = await backupDatabase()
    if (result.success) setStatus({ type: 'success', text: t('Backup saved!') })
    else if (!result.cancelled) setStatus({ type: 'error', text: errorText(t, result.error) })
  }

  async function restore(path = null) {
    const result = await restoreDatabase(path, folder)
    if (!result.success && !result.cancelled) setStatus({ type: 'error', text: errorText(t, result.error) })
  }

  return (
    <>
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
        <h2 className="font-bold text-white mb-1">{t('Automatic backups')}</h2>
        <p className="text-sm text-gray-400 mb-4">
          {t('The app saves a full backup every day. Tip: choose a folder on a USB drive or a synced folder (OneDrive, Google Drive), so your data survives if the computer is lost or broken.')}
        </p>
        <Alert type={status?.type} onClose={() => setStatus(null)}>{status?.text}</Alert>
        <div className="grid grid-cols-3 gap-4 items-end">
          <Field label={t('Backup folder')} className="col-span-2">
            <input className={inputClass} value={folder} readOnly />
          </Field>
          <Button variant="secondary" onClick={changeFolder}>{t('Change folder')}</Button>
          <Field label={t('Days of backups to keep')}>
            <select className={inputClass} value={settings.backup_keep} onChange={e => saveSettings({ backup_keep: e.target.value })}>
              {['7', '14', '30', '60', '90'].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          {settings.backup_folder && (
            <Button variant="ghost" onClick={() => saveSettings({ backup_folder: '' })}>{t('Use default folder')}</Button>
          )}
        </div>
        <div className="flex gap-3 mt-6">
          <Button onClick={backupNow} disabled={busy}>{busy ? t('Backing up...') : t('Back up now')}</Button>
          <Button variant="secondary" onClick={saveCopy}>{t('Save a copy somewhere else…')}</Button>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-white">{t('Restore')}</h2>
          <Button variant="danger" onClick={() => restore()}>{t('Restore from a file…')}</Button>
        </div>
        <p className="text-xs text-gray-500 mb-4">{t('Restoring replaces all current data. A safety copy of the current data is saved first.')}</p>
        {files.length === 0 ? (
          <p className="text-sm text-gray-500">{t('No automatic backups yet.')}</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {files.map(f => (
                <tr key={f.path} className="border-b border-gray-800">
                  <td className="py-2 text-gray-300 font-mono text-xs">{f.name}</td>
                  <td className="text-gray-500 text-xs">{(f.size / 1024).toFixed(0)} KB</td>
                  <td className="text-right">
                    <button className="text-xs text-red-400 hover:text-red-300" onClick={() => restore(f.path)}>{t('Restore')}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
