/* eslint-disable react-refresh/only-export-components -- the provider and its hooks belong together */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getSettings, saveSettings as saveSettingsToDb } from '../services/settingsService'
import { hasOwner } from '../services/authService'
import { translate, setCurrentLanguage } from '../i18n'
import { setCurrentUser } from '../utils/session'
import { can as canDo, canSeePage } from '../utils/permissions'
import { logError } from '../utils/logger'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [settings, setSettings] = useState(null)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [user, setUser] = useState(null)
  const [loadError, setLoadError] = useState('')

  const refreshSettings = useCallback(async () => {
    const s = await getSettings()
    setCurrentLanguage(s.language)
    setSettings(s)
    return s
  }, [])

  useEffect(() => {
    (async () => {
      try {
        await refreshSettings()
        setNeedsSetup(!(await hasOwner()))
      } catch (err) {
        logError('Failed to open the database', err)
        setLoadError(String(err?.message || err))
      }
    })()
  }, [refreshSettings])

  const saveSettings = useCallback(async values => {
    await saveSettingsToDb(values)
    return refreshSettings()
  }, [refreshSettings])

  const signIn = useCallback(u => { setCurrentUser(u); setUser(u) }, [])
  const signOut = useCallback(() => { setCurrentUser(null); setUser(null) }, [])
  const finishSetup = useCallback(async () => { await refreshSettings(); setNeedsSetup(false) }, [refreshSettings])

  const lang = settings?.language || 'en'
  const t = useCallback((text, vars) => translate(lang, text, vars), [lang])

  const value = useMemo(() => ({
    settings, refreshSettings, saveSettings,
    needsSetup, finishSetup, loadError,
    user, signIn, signOut,
    can: action => canDo(user, action),
    canSeePage: page => canSeePage(user, page),
    lang, t,
  }), [settings, refreshSettings, saveSettings, needsSetup, finishSetup, loadError, user, signIn, signOut, lang, t])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>')
  return ctx
}

// Just the translation function, for components that only need text
export function useT() {
  return useApp().t
}
