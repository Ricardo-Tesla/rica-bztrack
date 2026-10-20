// Shared formatting helpers for money and dates.
import { getCurrentLanguage, DATE_LOCALES } from '../i18n'

const dateLocale = () => DATE_LOCALES[getCurrentLanguage()] || 'en-GB'

// ── MONEY ─────────────────────────────────────────────────
// Change these two values to switch the whole app to another currency.
export const CURRENCY = 'RWF'
export const CURRENCY_DECIMALS = 0

// 12500 → "RWF 12,500"
export function formatMoney(amount) {
  const n = Number(amount) || 0
  return `${CURRENCY} ${n.toLocaleString('en-US', {
    minimumFractionDigits: CURRENCY_DECIMALS,
    maximumFractionDigits: CURRENCY_DECIMALS,
  })}`
}

// ── DATES ─────────────────────────────────────────────────
// SQLite's datetime('now') saves UTC time as "YYYY-MM-DD HH:MM:SS" with no
// time zone. JavaScript would read that as LOCAL time (2 hours off in Kigali),
// so we mark it as UTC. Plain dates ("YYYY-MM-DD", e.g. an expense date) are
// calendar days and are kept as local dates.
export function parseDbDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  const s = String(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) {
    return new Date(s.replace(' ', 'T') + 'Z')
  }
  return new Date(s) // already has a time zone (e.g. toISOString())
}

// "19 Oct 2026" (in the app's language)
export function formatDate(value, fallback = '—') {
  const d = parseDbDate(value)
  if (!d || isNaN(d)) return fallback
  return d.toLocaleDateString(dateLocale(), { year: 'numeric', month: 'short', day: 'numeric' })
}

// "19 Oct 2026, 14:30" (in the app's language, 24-hour clock)
export function formatDateTime(value, fallback = '—') {
  const d = parseDbDate(value)
  if (!d || isNaN(d)) return fallback
  return d.toLocaleString(dateLocale(), {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

const pad = n => String(n).padStart(2, '0')

// Today's LOCAL date as "YYYY-MM-DD" (toISOString() would give the UTC date,
// which is yesterday between midnight and 2 am in Kigali).
export function todayLocal(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// This LOCAL month as "YYYY-MM"
export function monthLocal(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
}

// First month of the last `count` months (including this one) as "YYYY-MM"
export function monthsAgoLocal(count, date = new Date()) {
  return monthLocal(new Date(date.getFullYear(), date.getMonth() - (count - 1), 1))
}

// Round a money amount to the currency's decimals (RWF: whole francs)
export function roundMoney(amount) {
  const f = 10 ** CURRENCY_DECIMALS
  return Math.round((Number(amount) || 0) * f) / f
}

// ── QUANTITIES ────────────────────────────────────────────
// 1.5 → "1.5", 2 → "2", 0.3333 → "0.333"
export function formatQty(q) {
  const n = Math.round((Number(q) || 0) * 1000) / 1000
  return n.toLocaleString('en-US', { maximumFractionDigits: 3 })
}

// Shown name of a customer ("Walk-in Customer" is stored in English)
export function customerLabel(name, tr) {
  return !name || name === 'Walk-in Customer' ? tr('Walk-in Customer') : name
}

export function roundQty(q) {
  return Math.round((Number(q) || 0) * 1000) / 1000
}
