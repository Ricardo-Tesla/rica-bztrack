import { useEffect, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import { runAutoBackup } from '../services/backupService'
import { checkForUpdate } from '../services/updateService'
import { todayLocal } from '../utils/format'
import { logError, logInfo } from '../utils/logger'

const HOUR = 60 * 60 * 1000

// Work that happens quietly while the app is open:
// - one automatic backup per day (checked at sign-in and every hour)
// - for owners, one check for a new version per session (when online)
// Returns a banner to show at the top of the page, or null.
export function useBackgroundTasks() {
  const { user, settings, saveSettings, t } = useApp()
  const [backupFailed, setBackupFailed] = useState('')
  const [updateVersion, setUpdateVersion] = useState('')
  const settingsRef = useRef(settings)
  useEffect(() => { settingsRef.current = settings }, [settings])
  const updateChecked = useRef(false)

  // Daily backup
  useEffect(() => {
    if (!user) return
    let cancelled = false
    async function backupIfNeeded() {
      const s = settingsRef.current
      if (!s || s.last_auto_backup === todayLocal()) return
      try {
        const path = await runAutoBackup(s)
        if (cancelled) return
        await saveSettings({ last_auto_backup: todayLocal() })
        setBackupFailed('')
        logInfo(`Automatic backup saved: ${path}`)
      } catch (err) {
        logError('Automatic backup failed', err)
        if (!cancelled) setBackupFailed(String(err?.message || err))
      }
    }
    backupIfNeeded()
    const timer = setInterval(backupIfNeeded, HOUR)
    return () => { cancelled = true; clearInterval(timer) }
  }, [user, saveSettings])

  // Update check (owners only, once per session)
  useEffect(() => {
    if (user?.role !== 'owner' || updateChecked.current || !navigator.onLine) return
    updateChecked.current = true
    checkForUpdate()
      .then(u => { if (u) setUpdateVersion(u.version) })
      .catch(() => { /* offline or updates not set up yet — ignore */ })
  }, [user])

  if (backupFailed && user?.role === 'owner') {
    return (
      <div className="bg-red-950 border-b border-red-800 text-red-300 text-sm px-6 py-2 flex justify-between">
        <span>⚠️ {t('Automatic backup failed. Check the backup folder in Settings → Backups.')}</span>
        <button onClick={() => setBackupFailed('')}>✕</button>
      </div>
    )
  }
  if (updateVersion) {
    return (
      <div className="bg-blue-950 border-b border-blue-800 text-blue-300 text-sm px-6 py-2 flex justify-between">
        <span>⬆️ {t('Version {v} is available. Install it from Settings → About.', { v: updateVersion })}</span>
        <button onClick={() => setUpdateVersion('')}>✕</button>
      </div>
    )
  }
  return null
}
