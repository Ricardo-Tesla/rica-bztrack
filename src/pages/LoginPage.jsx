import { useEffect, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import { getUsers, login, recoverOwnerPin, validatePin } from '../services/authService'
import { Alert, Button, Field, inputClass } from '../components/ui'
import { logError } from '../utils/logger'
import { errorText } from '../utils/errors'

export default function LoginPage() {
  const { signIn, settings, t } = useApp()
  const [users, setUsers] = useState([])
  const [selected, setSelected] = useState(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [recovering, setRecovering] = useState(false)
  const [recovery, setRecovery] = useState({ code: '', pin: '', pin2: '' })
  const [notice, setNotice] = useState('')
  const pinRef = useRef(null)

  useEffect(() => {
    getUsers().then(list => {
      setUsers(list)
      if (list.length === 1) setSelected(list[0])
    }).catch(err => { logError('Failed to load users', err); setError(t('Could not load users')) })
  }, [t])

  useEffect(() => { if (selected) pinRef.current?.focus() }, [selected])

  async function submit(e) {
    e?.preventDefault()
    if (!selected || !pin) return
    try {
      setBusy(true)
      setError('')
      const u = await login(selected.id, pin)
      signIn(u)
    } catch (err) {
      setPin('')
      setError(errorText(t, err))
    } finally {
      setBusy(false)
    }
  }

  function pressKey(k) {
    if (k === 'del') setPin(p => p.slice(0, -1))
    else if (pin.length < 6) setPin(p => p + k)
  }

  async function recover() {
    setError('')
    const pinError = validatePin(recovery.pin)
    if (pinError) return setError(t(pinError))
    if (recovery.pin !== recovery.pin2) return setError(t('The two PINs do not match'))
    try {
      setBusy(true)
      const owner = await recoverOwnerPin(recovery.code, recovery.pin)
      setRecovering(false)
      setRecovery({ code: '', pin: '', pin2: '' })
      setNotice(t('PIN changed for {name}. You can now sign in.', { name: owner.name }))
      const list = await getUsers()
      setUsers(list)
      setSelected(list.find(u => u.id === owner.id) || null)
    } catch (err) {
      setError(errorText(t, err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-3xl font-bold"><span className="text-yellow-400">Rica</span> BizTrack</div>
          {settings?.business_name && <p className="text-gray-300 mt-1">{settings.business_name}</p>}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-7">
          <Alert type="success" onClose={() => setNotice('')}>{notice}</Alert>
          <Alert onClose={() => setError('')}>{error}</Alert>

          {recovering ? (
            <div className="space-y-4">
              <h2 className="font-bold text-white">{t('Reset owner PIN')}</h2>
              <Field label={t('Recovery code')}>
                <input className={`${inputClass} font-mono uppercase tracking-widest`} placeholder="XXXX-XXXX-XXXX" value={recovery.code} onChange={e => setRecovery({ ...recovery, code: e.target.value })} autoFocus />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t('New PIN')}>
                  <input type="password" inputMode="numeric" maxLength={6} className={inputClass} value={recovery.pin} onChange={e => setRecovery({ ...recovery, pin: e.target.value.replace(/\D/g, '') })} />
                </Field>
                <Field label={t('Repeat PIN')}>
                  <input type="password" inputMode="numeric" maxLength={6} className={inputClass} value={recovery.pin2} onChange={e => setRecovery({ ...recovery, pin2: e.target.value.replace(/\D/g, '') })} />
                </Field>
              </div>
              <div className="flex justify-between">
                <Button variant="secondary" onClick={() => { setRecovering(false); setError('') }}>{t('Cancel')}</Button>
                <Button onClick={recover} disabled={busy}>{t('Reset PIN')}</Button>
              </div>
            </div>
          ) : (
            <>
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">{t('Who is using the app?')}</div>
              <div className="grid grid-cols-2 gap-2 mb-5">
                {users.map(u => (
                  <button
                    key={u.id}
                    onClick={() => { setSelected(u); setPin(''); setError('') }}
                    className={`px-3 py-3 rounded-lg border text-sm text-left transition ${selected?.id === u.id ? 'border-yellow-400 bg-gray-800 text-white' : 'border-gray-700 text-gray-300 hover:border-gray-500'}`}
                  >
                    <div className="font-semibold truncate">{u.name}</div>
                    <div className="text-xs text-gray-500">{u.role === 'owner' ? t('Owner') : t('Cashier')}</div>
                  </button>
                ))}
              </div>

              {selected && (
                <form onSubmit={submit}>
                  <input
                    ref={pinRef}
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    className={`${inputClass} text-center text-2xl tracking-[0.5em] mb-4`}
                    value={pin}
                    onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••"
                  />
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'].map(k => (
                      <button
                        key={k}
                        type={k === 'ok' ? 'submit' : 'button'}
                        onClick={k === 'ok' ? undefined : () => pressKey(k)}
                        disabled={busy}
                        className={`py-3 rounded-lg text-lg font-semibold transition ${k === 'ok' ? 'bg-yellow-400 text-black hover:bg-yellow-300' : 'bg-gray-800 text-white hover:bg-gray-700'}`}
                      >
                        {k === 'del' ? '⌫' : k === 'ok' ? '✓' : k}
                      </button>
                    ))}
                  </div>
                </form>
              )}

              <button onClick={() => { setRecovering(true); setError('') }} className="text-xs text-gray-500 hover:text-gray-300 w-full text-center">
                {t('Owner forgot PIN?')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
