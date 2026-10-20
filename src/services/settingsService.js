import { getDb, runTransaction } from './db'

// Every setting the app knows about, with its default value.
// Values are stored as text in the `settings` table.
export const DEFAULT_SETTINGS = {
  business_name: '',
  business_tin: '',
  business_phone: '',
  business_address: '',
  receipt_footer: 'Thank you for your business!',
  paper_width: '80',          // receipt printer: '80' or '58' mm
  vat_enabled: '0',           // '1' = prices include VAT
  vat_rate: '18',
  language: 'en',
  auto_lock_minutes: '15',    // '0' = never lock
  backup_folder: '',          // '' = Documents\Rica BizTrack Backups
  backup_keep: '30',          // automatic backups to keep
  last_auto_backup: '',       // local date of the last automatic backup
  setup_done: '0',
  recovery_hash: '',          // owner PIN recovery code (hashed)
  recovery_salt: '',
}

// Settings that must never be sent to the screen
const SECRET_KEYS = ['recovery_hash', 'recovery_salt']

export function parseSettings(rows) {
  const out = { ...DEFAULT_SETTINGS }
  for (const r of rows) out[r.key] = r.value ?? ''
  return out
}

export async function getSettings({ includeSecrets = false } = {}) {
  const db = await getDb()
  const rows = await db.select('SELECT key, value FROM settings')
  const settings = parseSettings(rows)
  if (!includeSecrets) SECRET_KEYS.forEach(k => delete settings[k])
  return settings
}

export function buildSaveSettingsStatements(values) {
  return Object.entries(values)
    .filter(([key]) => key in DEFAULT_SETTINGS)
    .map(([key, value]) => ({
      sql: `INSERT INTO settings (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      params: [key, value == null ? '' : String(value)],
    }))
}

export async function saveSettings(values) {
  const statements = buildSaveSettingsStatements(values)
  if (statements.length) await runTransaction(statements)
}

// Helpers that read typed values
export const isVatEnabled = s => s?.vat_enabled === '1'
export const vatRate = s => (isVatEnabled(s) ? parseFloat(s.vat_rate) || 0 : 0)
