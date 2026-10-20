import { getDb, runTransaction } from './db'
import { buildSaveSettingsStatements, getSettings } from './settingsService'
import { errorWithVars } from '../utils/errors'
import { t } from '../i18n'

// ── PIN hashing ───────────────────────────────────────────
// PINs are never stored. We store a salted PBKDF2-SHA256 hash.
// Note: this protects the shop from casual misuse (a cashier using the owner
// account). Anyone who can copy the database file can still read the data,
// so keep the computer itself protected with a Windows password.
const ITERATIONS = 120000

function toHex(bytes) {
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('')
}

export function randomHex(byteCount = 16) {
  const bytes = new Uint8Array(byteCount)
  globalThis.crypto.getRandomValues(bytes)
  return toHex(bytes)
}

export async function hashSecret(secret, saltHex) {
  const enc = new TextEncoder()
  const key = await globalThis.crypto.subtle.importKey('raw', enc.encode(String(secret)), 'PBKDF2', false, ['deriveBits'])
  const bits = await globalThis.crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(saltHex), iterations: ITERATIONS },
    key, 256
  )
  return toHex(bits)
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export function validatePin(pin) {
  if (!/^\d{4,6}$/.test(String(pin || ''))) return 'PIN must be 4 to 6 digits'
  return null
}

// Recovery code shown ONCE at setup, e.g. "K7Q2-XM9P-4TBA"
export function generateRecoveryCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I
  const bytes = new Uint8Array(12)
  globalThis.crypto.getRandomValues(bytes)
  const s = Array.from(bytes, b => chars[b % chars.length]).join('')
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`
}

const normalizeCode = code => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

// ── Users ────────────────────────────────────────────────
export async function getUsers({ includeInactive = false } = {}) {
  const db = await getDb()
  return await db.select(
    `SELECT id, name, role, active, last_login, created_at FROM users
     ${includeInactive ? '' : 'WHERE active = 1'}
     ORDER BY role = 'owner' DESC, name ASC`
  )
}

export async function hasOwner() {
  const db = await getDb()
  const rows = await db.select(`SELECT COUNT(*) AS n FROM users WHERE role = 'owner' AND active = 1`)
  return (rows[0]?.n || 0) > 0
}

export async function buildCreateUserStatement({ name, role, pin }) {
  const err = validatePin(pin)
  if (err) throw new Error(err)
  if (!String(name || '').trim()) throw new Error('Name is required')
  if (!['owner', 'cashier'].includes(role)) throw new Error('Invalid role')
  const salt = randomHex()
  const hash = await hashSecret(pin, salt)
  return {
    sql: `INSERT INTO users (name, role, pin_hash, pin_salt) VALUES (?, ?, ?, ?)`,
    params: [name.trim(), role, hash, salt],
  }
}

export async function createUser(user) {
  await runTransaction([await buildCreateUserStatement(user)])
}

export async function buildChangePinStatement(userId, pin) {
  const err = validatePin(pin)
  if (err) throw new Error(err)
  const salt = randomHex()
  const hash = await hashSecret(pin, salt)
  return {
    sql: 'UPDATE users SET pin_hash = ?, pin_salt = ? WHERE id = ?',
    params: [hash, salt, userId],
    expectChanges: 1,
    errorMessage: 'User not found',
  }
}

export async function changePin(userId, pin) {
  await runTransaction([await buildChangePinStatement(userId, pin)])
}

export function buildRenameUserStatement(userId, name) {
  if (!String(name || '').trim()) throw new Error('Name is required')
  return { sql: 'UPDATE users SET name = ? WHERE id = ?', params: [name.trim(), userId] }
}

export async function renameUser(userId, name) {
  await runTransaction([buildRenameUserStatement(userId, name)])
}

// Deactivate / reactivate. The last active owner can never be deactivated.
export function buildSetUserActiveStatement(userId, active) {
  return {
    sql: active
      ? 'UPDATE users SET active = 1 WHERE id = ?'
      : `UPDATE users SET active = 0 WHERE id = ?
         AND NOT (role = 'owner' AND (SELECT COUNT(*) FROM users WHERE role = 'owner' AND active = 1) <= 1)`,
    params: [userId],
    expectChanges: 1,
    errorMessage: t('You cannot deactivate the only owner account.'),
  }
}

export async function setUserActive(userId, active) {
  await runTransaction([buildSetUserActiveStatement(userId, active)])
}

// ── Login ────────────────────────────────────────────────
// After 5 wrong PINs, that account is locked for 30 seconds.
const failures = new Map()
const MAX_TRIES = 5
const LOCK_MS = 30000

export async function checkPin(userRow, pin) {
  const hash = await hashSecret(pin, userRow.pin_salt)
  return safeEqual(hash, userRow.pin_hash)
}

export async function login(userId, pin, { now = Date.now(), select } = {}) {
  const f = failures.get(userId)
  if (f && f.lockedUntil > now) {
    const secs = Math.ceil((f.lockedUntil - now) / 1000)
    throw errorWithVars('Too many wrong PINs. Try again in {secs} seconds.', { secs })
  }
  const run = select || (async (sql, p) => (await getDb()).select(sql, p))
  const rows = await run('SELECT * FROM users WHERE id = ? AND active = 1', [userId])
  const user = rows[0]
  if (!user || !(await checkPin(user, pin))) {
    const count = (f?.count || 0) + 1
    failures.set(userId, count >= MAX_TRIES ? { count: 0, lockedUntil: now + LOCK_MS } : { count, lockedUntil: 0 })
    throw new Error('Wrong PIN')
  }
  failures.delete(userId)
  if (!select) {
    try {
      await runTransaction([{ sql: `UPDATE users SET last_login = datetime('now') WHERE id = ?`, params: [userId] }])
    } catch { /* not important */ }
  }
  return { id: user.id, name: user.name, role: user.role }
}

// ── First-run setup ──────────────────────────────────────
// Creates the owner account and saves the shop details.
// Returns the recovery code, which must be shown to the owner once.
export async function buildSetupStatements({ business, ownerName, pin }) {
  const recoveryCode = generateRecoveryCode()
  const recoverySalt = randomHex()
  const recoveryHash = await hashSecret(normalizeCode(recoveryCode), recoverySalt)
  const statements = [
    await buildCreateUserStatement({ name: ownerName, role: 'owner', pin }),
    ...buildSaveSettingsStatements({
      ...business,
      recovery_hash: recoveryHash,
      recovery_salt: recoverySalt,
      setup_done: '1',
    }),
  ]
  return { statements, recoveryCode }
}

export async function completeSetup(data) {
  if (await hasOwner()) throw new Error('This shop is already set up.')
  const { statements, recoveryCode } = await buildSetupStatements(data)
  await runTransaction(statements)
  return recoveryCode
}

// Forgotten owner PIN: the recovery code resets the PIN of the first owner.
export async function recoverOwnerPin(code, newPin) {
  const settings = await getSettings({ includeSecrets: true })
  if (!settings.recovery_hash) throw new Error('No recovery code was set up.')
  const hash = await hashSecret(normalizeCode(code), settings.recovery_salt)
  if (!safeEqual(hash, settings.recovery_hash)) throw new Error('Wrong recovery code')
  const db = await getDb()
  const owners = await db.select(`SELECT id, name FROM users WHERE role = 'owner' ORDER BY id LIMIT 1`)
  if (!owners.length) throw new Error('No owner account found')
  await runTransaction([
    await buildChangePinStatement(owners[0].id, newPin),
    { sql: 'UPDATE users SET active = 1 WHERE id = ?', params: [owners[0].id] },
  ])
  return owners[0]
}

// Create a new recovery code (owner only, e.g. if the old one was lost)
export async function regenerateRecoveryCode() {
  const recoveryCode = generateRecoveryCode()
  const salt = randomHex()
  const hash = await hashSecret(normalizeCode(recoveryCode), salt)
  await runTransaction(buildSaveSettingsStatements({ recovery_hash: hash, recovery_salt: salt }))
  return recoveryCode
}
