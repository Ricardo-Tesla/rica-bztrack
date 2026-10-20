import { useEffect } from 'react'
import { useApp } from '../context/AppContext'

// Lock the app (back to the PIN screen) after some minutes without any
// mouse or keyboard activity. Set in Settings → "Auto-lock". 0 = never.
export function useAutoLock() {
  const { user, settings, signOut } = useApp()
  const minutes = parseInt(settings?.auto_lock_minutes || '0') || 0

  useEffect(() => {
    if (!user || minutes <= 0) return
    let timer
    const reset = () => {
      clearTimeout(timer)
      timer = setTimeout(signOut, minutes * 60 * 1000)
    }
    const events = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart']
    events.forEach(e => window.addEventListener(e, reset, { passive: true }))
    reset()
    return () => {
      clearTimeout(timer)
      events.forEach(e => window.removeEventListener(e, reset))
    }
  }, [user, minutes, signOut])
}
