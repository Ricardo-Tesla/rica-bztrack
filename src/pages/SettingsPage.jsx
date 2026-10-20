import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import {
  getUsers, createUser, changePin, renameUser, setUserActive, regenerateRecoveryCode, validatePin,
} from '../services/authService'
import { LANGUAGES } from '../i18n'
import { Alert, Button, Field, Modal, PageHeader, inputClass } from '../components/ui'
import { errorText } from '../utils/errors'
import { formatDateTime } from '../utils/format'
import BackupSettings from '../components/settings/BackupSettings'
import UpdateSettings from '../components/settings/UpdateSettings'

const TABS = ['Shop', 'Receipts & VAT', 'Users', 'Backups', 'General', 'About']

export default function SettingsPage() {
  const { t } = useApp()
  const [tab, setTab] = useState('Shop')

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8">
      <PageHeader title={t('Settings')} subtitle={t('Shop details, receipts, users and backups')} />

      <div className="flex gap-2 mb-6 flex-wrap">
        {TABS.map(name => (
          <button
            key={name}
            onClick={() => setTab(name)}
            className={`px-4 py-2 rounded-lg text-sm border transition ${tab === name ? 'bg-yellow-400 text-black border-yellow-400 font-semibold' : 'border-gray-700 text-gray-300 hover:border-gray-500'}`}
          >
            {t(name)}
          </button>
        ))}
      </div>

      <div className="max-w-3xl">
        {tab === 'Shop' && <ShopSettings />}
        {tab === 'Receipts & VAT' && <ReceiptSettings />}
        {tab === 'Users' && <UserSettings />}
        {tab === 'Backups' && <BackupSettings />}
        {tab === 'General' && <GeneralSettings />}
        {tab === 'About' && <UpdateSettings />}
      </div>
    </div>
  )
}

function Card({ title, children }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
      {title && <h2 className="font-bold text-white mb-4">{title}</h2>}
      {children}
    </div>
  )
}

// Shared "edit some settings, then Save" form
function useSettingsForm(keys) {
  const { settings, saveSettings, t } = useApp()
  const [form, setForm] = useState(() => Object.fromEntries(keys.map(k => [k, settings[k] ?? ''])))
  const [status, setStatus] = useState(null)
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  async function save(validate) {
    const problem = validate?.(form)
    if (problem) return setStatus({ type: 'error', text: t(problem) })
    try {
      setSaving(true)
      await saveSettings(form)
      setStatus({ type: 'success', text: t('Saved') })
    } catch (err) {
      setStatus({ type: 'error', text: errorText(t, err) })
    } finally {
      setSaving(false)
    }
  }
  return { form, set, save, status, setStatus, saving }
}

function ShopSettings() {
  const { t } = useApp()
  const { form, set, save, status, setStatus, saving } = useSettingsForm(
    ['business_name', 'business_tin', 'business_phone', 'business_address']
  )
  return (
    <Card title={t('Shop details')}>
      <Alert type={status?.type} onClose={() => setStatus(null)}>{status?.text}</Alert>
      <div className="grid grid-cols-2 gap-4">
        <Field label={t('Shop name') + ' *'} className="col-span-2">
          <input className={inputClass} value={form.business_name} onChange={e => set('business_name', e.target.value)} />
        </Field>
        <Field label={t('TIN')}>
          <input className={inputClass} value={form.business_tin} onChange={e => set('business_tin', e.target.value)} />
        </Field>
        <Field label={t('Phone')}>
          <input className={inputClass} value={form.business_phone} onChange={e => set('business_phone', e.target.value)} />
        </Field>
        <Field label={t('Address')} className="col-span-2">
          <input className={inputClass} value={form.business_address} onChange={e => set('business_address', e.target.value)} />
        </Field>
      </div>
      <div className="flex justify-end mt-6">
        <Button disabled={saving} onClick={() => save(f => (!f.business_name.trim() ? 'Shop name is required' : null))}>
          {saving ? t('Saving...') : t('Save')}
        </Button>
      </div>
    </Card>
  )
}

function ReceiptSettings() {
  const { t } = useApp()
  const { form, set, save, status, setStatus, saving } = useSettingsForm(
    ['receipt_footer', 'paper_width', 'vat_enabled', 'vat_rate']
  )
  return (
    <>
      <Card title={t('Receipts')}>
        <Alert type={status?.type} onClose={() => setStatus(null)}>{status?.text}</Alert>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t('Receipt printer paper')}>
            <select className={inputClass} value={form.paper_width} onChange={e => set('paper_width', e.target.value)}>
              <option value="80">80 mm</option>
              <option value="58">58 mm</option>
            </select>
          </Field>
          <Field label={t('Message at the bottom of receipts')} className="col-span-2">
            <input className={inputClass} value={form.receipt_footer} onChange={e => set('receipt_footer', e.target.value)} />
          </Field>
        </div>
      </Card>
      <Card title={t('VAT')}>
        <label className="flex items-center gap-3 text-sm text-gray-300 mb-4">
          <input type="checkbox" checked={form.vat_enabled === '1'} onChange={e => set('vat_enabled', e.target.checked ? '1' : '0')} />
          {t('My business is VAT-registered (prices include VAT)')}
        </label>
        {form.vat_enabled === '1' && (
          <Field label={t('VAT rate (%)')} className="max-w-xs">
            <input type="number" min="0" step="0.1" className={inputClass} value={form.vat_rate} onChange={e => set('vat_rate', e.target.value)} />
          </Field>
        )}
        <p className="text-xs text-gray-500 mt-4">
          {t('Receipts from this app are not EBM invoices. VAT-registered businesses must still issue official invoices through RRA\'s EBM system. You can record the EBM receipt number on each sale in Sales History.')}
        </p>
      </Card>
      <div className="flex justify-end">
        <Button disabled={saving} onClick={() => save(f => (f.vat_enabled === '1' && !(parseFloat(f.vat_rate) > 0) ? 'Enter a valid VAT rate' : null))}>
          {saving ? t('Saving...') : t('Save')}
        </Button>
      </div>
    </>
  )
}

function GeneralSettings() {
  const { t } = useApp()
  const { form, set, save, status, setStatus, saving } = useSettingsForm(['language', 'auto_lock_minutes'])
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState('')

  async function newRecoveryCode() {
    try { setCode(await regenerateRecoveryCode()) } catch (err) { setCodeError(errorText(t, err)) }
  }

  return (
    <>
      <Card title={t('Language and security')}>
        <Alert type={status?.type} onClose={() => setStatus(null)}>{status?.text}</Alert>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t('Language')}>
            <select className={inputClass} value={form.language} onChange={e => set('language', e.target.value)}>
              {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </Field>
          <Field label={t('Auto-lock after no activity')}>
            <select className={inputClass} value={form.auto_lock_minutes} onChange={e => set('auto_lock_minutes', e.target.value)}>
              {['5', '10', '15', '30', '60', '0'].map(m => (
                <option key={m} value={m}>{m === '0' ? t('Never') : t('{n} minutes', { n: m })}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="flex justify-end mt-6">
          <Button disabled={saving} onClick={() => save()}>{saving ? t('Saving...') : t('Save')}</Button>
        </div>
      </Card>
      <Card title={t('Owner recovery code')}>
        <Alert onClose={() => setCodeError('')}>{codeError}</Alert>
        <p className="text-sm text-gray-400 mb-4">{t('Lost your recovery code? Create a new one. The old code stops working.')}</p>
        {code ? (
          <div className="text-center">
            <div className="font-mono text-2xl tracking-widest text-yellow-400 bg-gray-950 border border-yellow-800 rounded-xl py-4 mb-2 select-all">{code}</div>
            <p className="text-xs text-red-300">{t('Write it on paper and keep it somewhere safe. It will not be shown again.')}</p>
          </div>
        ) : (
          <Button variant="secondary" onClick={newRecoveryCode}>{t('Create new recovery code')}</Button>
        )}
      </Card>
    </>
  )
}

function UserSettings() {
  const { t, user: me } = useApp()
  const [users, setUsers] = useState([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [modal, setModal] = useState(null) // { mode: 'add' | 'pin' | 'rename', user }
  const [form, setForm] = useState({ name: '', role: 'cashier', pin: '', pin2: '' })
  const [saving, setSaving] = useState(false)

  async function load() {
    try { setUsers(await getUsers({ includeInactive: true })) } catch (err) { setError(errorText(t, err)) }
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function open(mode, user = null) {
    setForm({ name: user?.name || '', role: user?.role || 'cashier', pin: '', pin2: '' })
    setError('')
    setModal({ mode, user })
  }

  async function submit() {
    setError('')
    try {
      if (modal.mode !== 'rename') {
        const pinError = validatePin(form.pin)
        if (pinError) return setError(t(pinError))
        if (form.pin !== form.pin2) return setError(t('The two PINs do not match'))
      }
      setSaving(true)
      if (modal.mode === 'add') await createUser({ name: form.name, role: form.role, pin: form.pin })
      if (modal.mode === 'pin') await changePin(modal.user.id, form.pin)
      if (modal.mode === 'rename') await renameUser(modal.user.id, form.name)
      setModal(null)
      setNotice(t('Saved'))
      await load()
    } catch (err) {
      setError(errorText(t, err))
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(u) {
    try {
      await setUserActive(u.id, !u.active)
      await load()
    } catch (err) {
      setError(errorText(t, err))
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-white">{t('Users')}</h2>
        <Button onClick={() => open('add')}>+ {t('Add user')}</Button>
      </div>
      <Alert type="success" onClose={() => setNotice('')}>{notice}</Alert>
      {!modal && <Alert onClose={() => setError('')}>{error}</Alert>}
      <p className="text-xs text-gray-500 mb-4">{t('Cashiers can sell, see sales history and record customer payments. They cannot see profits, change products, void sales or change settings.')}</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-400 uppercase border-b border-gray-800">
            <th className="py-2">{t('Name')}</th><th>{t('Role')}</th><th>{t('Last sign-in')}</th><th></th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id} className={`border-b border-gray-800 ${u.active ? '' : 'opacity-50'}`}>
              <td className="py-3 text-white">{u.name}{u.id === me?.id && <span className="text-xs text-gray-500"> ({t('you')})</span>}</td>
              <td className="text-gray-300">{u.role === 'owner' ? t('Owner') : t('Cashier')}</td>
              <td className="text-gray-500 text-xs">{formatDateTime(u.last_login, t('Never'))}</td>
              <td className="text-right whitespace-nowrap space-x-2">
                <button className="text-xs text-yellow-400 hover:text-yellow-300" onClick={() => open('pin', u)}>{t('Change PIN')}</button>
                <button className="text-xs text-gray-300 hover:text-white" onClick={() => open('rename', u)}>{t('Rename')}</button>
                {u.id !== me?.id && (
                  <button className={`text-xs ${u.active ? 'text-red-400 hover:text-red-300' : 'text-green-400 hover:text-green-300'}`} onClick={() => toggleActive(u)}>
                    {u.active ? t('Deactivate') : t('Activate')}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {modal && (
        <Modal
          title={modal.mode === 'add' ? t('Add user') : modal.mode === 'pin' ? t('Change PIN') : t('Rename')}
          subtitle={modal.user?.name}
          onClose={() => setModal(null)}
          width="max-w-md"
        >
          <Alert onClose={() => setError('')}>{error}</Alert>
          <div className="space-y-4">
            {modal.mode !== 'pin' && (
              <Field label={t('Name')}>
                <input className={inputClass} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus />
              </Field>
            )}
            {modal.mode === 'add' && (
              <Field label={t('Role')}>
                <select className={inputClass} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                  <option value="cashier">{t('Cashier')}</option>
                  <option value="owner">{t('Owner')}</option>
                </select>
              </Field>
            )}
            {modal.mode !== 'rename' && (
              <div className="grid grid-cols-2 gap-4">
                <Field label={t('PIN (4–6 digits)')}>
                  <input type="password" inputMode="numeric" maxLength={6} className={inputClass} value={form.pin} onChange={e => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })} />
                </Field>
                <Field label={t('Repeat PIN')}>
                  <input type="password" inputMode="numeric" maxLength={6} className={inputClass} value={form.pin2} onChange={e => setForm({ ...form, pin2: e.target.value.replace(/\D/g, '') })} />
                </Field>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="secondary" onClick={() => setModal(null)}>{t('Cancel')}</Button>
            <Button onClick={submit} disabled={saving}>{saving ? t('Saving...') : t('Save')}</Button>
          </div>
        </Modal>
      )}
    </Card>
  )
}
