import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { completeSetup, validatePin } from '../services/authService'
import { LANGUAGES, translate } from '../i18n'
import { Alert, Button, Field, inputClass } from '../components/ui'

// First run: language → shop details → VAT → owner account → recovery code
export default function SetupPage() {
  const { finishSetup } = useApp()
  const [step, setStep] = useState(0)
  const [lang, setLang] = useState('en')
  const [business, setBusiness] = useState({
    business_name: '', business_tin: '', business_phone: '', business_address: '',
    vat_enabled: '0', vat_rate: '18',
  })
  const [owner, setOwner] = useState({ name: '', pin: '', pin2: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [recoveryCode, setRecoveryCode] = useState('')
  const [wroteItDown, setWroteItDown] = useState(false)

  const t = (text, vars) => translate(lang, text, vars)
  const set = (k, v) => setBusiness(b => ({ ...b, [k]: v }))

  function next() {
    setError('')
    if (step === 1 && !business.business_name.trim()) return setError(t('Shop name is required'))
    if (step === 2 && business.vat_enabled === '1' && !(parseFloat(business.vat_rate) > 0)) return setError(t('Enter a valid VAT rate'))
    setStep(s => s + 1)
  }

  async function createAccount() {
    setError('')
    if (!owner.name.trim()) return setError(t('Your name is required'))
    const pinError = validatePin(owner.pin)
    if (pinError) return setError(t(pinError))
    if (owner.pin !== owner.pin2) return setError(t('The two PINs do not match'))
    try {
      setSaving(true)
      const code = await completeSetup({
        business: { ...business, language: lang },
        ownerName: owner.name,
        pin: owner.pin,
      })
      setRecoveryCode(code)
      setStep(4)
    } catch (err) {
      setError(t(String(err?.message || err)))
    } finally {
      setSaving(false)
    }
  }

  const steps = [t('Language'), t('Shop'), t('VAT'), t('Owner'), t('Finish')]

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <div className="text-3xl font-bold"><span className="text-yellow-400">Rica</span> BizTrack</div>
          <p className="text-gray-400 text-sm mt-1">{t('Welcome! Let\'s set up your shop.')}</p>
        </div>

        <div className="flex justify-center gap-2 mb-6">
          {steps.map((s, i) => (
            <div key={s} className={`text-xs px-3 py-1 rounded-full border ${i === step ? 'bg-yellow-400 text-black border-yellow-400' : i < step ? 'border-yellow-700 text-yellow-500' : 'border-gray-700 text-gray-500'}`}>
              {i + 1}. {s}
            </div>
          ))}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-7">
          <Alert onClose={() => setError('')}>{error}</Alert>

          {step === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-gray-300 mb-2">{t('Choose your language')}</p>
              {LANGUAGES.map(l => (
                <button
                  key={l.code}
                  onClick={() => setLang(l.code)}
                  className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition ${lang === l.code ? 'border-yellow-400 bg-gray-800 text-white' : 'border-gray-700 text-gray-300 hover:border-gray-500'}`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <Field label={t('Shop name') + ' *'}>
                <input className={inputClass} value={business.business_name} onChange={e => set('business_name', e.target.value)} autoFocus />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t('TIN')} hint={t('Optional')}>
                  <input className={inputClass} value={business.business_tin} onChange={e => set('business_tin', e.target.value)} />
                </Field>
                <Field label={t('Phone')}>
                  <input className={inputClass} value={business.business_phone} onChange={e => set('business_phone', e.target.value)} placeholder="07..." />
                </Field>
              </div>
              <Field label={t('Address')}>
                <input className={inputClass} value={business.business_address} onChange={e => set('business_address', e.target.value)} placeholder={t('e.g. Kigali, Nyarugenge')} />
              </Field>
              <p className="text-xs text-gray-500">{t('These details are printed on your receipts. You can change them later in Settings.')}</p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-300">{t('Is your business registered for VAT with RRA?')}</p>
              {[['0', t('No, not VAT-registered')], ['1', t('Yes, my prices include VAT')]].map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => set('vat_enabled', v)}
                  className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition ${business.vat_enabled === v ? 'border-yellow-400 bg-gray-800 text-white' : 'border-gray-700 text-gray-300 hover:border-gray-500'}`}
                >
                  {label}
                </button>
              ))}
              {business.vat_enabled === '1' && (
                <Field label={t('VAT rate (%)')}>
                  <input type="number" min="0" step="0.1" className={inputClass} value={business.vat_rate} onChange={e => set('vat_rate', e.target.value)} />
                </Field>
              )}
              <p className="text-xs text-gray-500">
                {t('Note: receipts from this app are not EBM invoices. VAT-registered businesses must still issue official invoices through RRA\'s EBM system.')}
              </p>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-300">{t('Create the owner account. The owner can see profits, manage stock and add cashiers.')}</p>
              <Field label={t('Your name')}>
                <input className={inputClass} value={owner.name} onChange={e => setOwner({ ...owner, name: e.target.value })} autoFocus />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t('PIN (4–6 digits)')}>
                  <input type="password" inputMode="numeric" maxLength={6} className={inputClass} value={owner.pin} onChange={e => setOwner({ ...owner, pin: e.target.value.replace(/\D/g, '') })} />
                </Field>
                <Field label={t('Repeat PIN')}>
                  <input type="password" inputMode="numeric" maxLength={6} className={inputClass} value={owner.pin2} onChange={e => setOwner({ ...owner, pin2: e.target.value.replace(/\D/g, '') })} />
                </Field>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4 text-center">
              <div className="text-4xl">🔑</div>
              <p className="text-sm text-gray-300">{t('This is your recovery code. If you forget your PIN, it is the ONLY way back into the owner account.')}</p>
              <div className="font-mono text-2xl tracking-widest text-yellow-400 bg-gray-950 border border-yellow-800 rounded-xl py-4 select-all">
                {recoveryCode}
              </div>
              <p className="text-xs text-red-300">{t('Write it on paper and keep it somewhere safe. It will not be shown again.')}</p>
              <label className="flex items-center justify-center gap-2 text-sm text-gray-300">
                <input type="checkbox" checked={wroteItDown} onChange={e => setWroteItDown(e.target.checked)} />
                {t('I have written down my recovery code')}
              </label>
            </div>
          )}

          <div className="flex justify-between mt-7">
            {step > 0 && step < 4 ? (
              <Button variant="secondary" onClick={() => { setError(''); setStep(s => s - 1) }}>{t('Back')}</Button>
            ) : <span />}
            {step < 3 && <Button onClick={next}>{t('Next')}</Button>}
            {step === 3 && <Button onClick={createAccount} disabled={saving}>{saving ? t('Saving...') : t('Create account')}</Button>}
            {step === 4 && <Button onClick={finishSetup} disabled={!wroteItDown}>{t('Start using Rica BizTrack')}</Button>}
          </div>
        </div>
      </div>
    </div>
  )
}
