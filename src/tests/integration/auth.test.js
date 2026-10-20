// Users, PINs, roles, first-run setup and settings.
import { describe, it, expect, beforeEach } from 'vitest'
import { createDb, runInTestDb } from './realDb'
import {
  hashSecret, validatePin, generateRecoveryCode, buildCreateUserStatement,
  buildSetUserActiveStatement, buildSetupStatements, login, checkPin,
} from '../../services/authService'
import { buildSaveSettingsStatements, parseSettings, DEFAULT_SETTINGS, vatRate } from '../../services/settingsService'
import { can, canSeePage, homePage } from '../../utils/permissions'
import { translate } from '../../i18n'

describe('PINs', () => {
  it('accepts 4–6 digits only', () => {
    expect(validatePin('1234')).toBe(null)
    expect(validatePin('123456')).toBe(null)
    expect(validatePin('123')).not.toBe(null)
    expect(validatePin('1234567')).not.toBe(null)
    expect(validatePin('12a4')).not.toBe(null)
  })

  it('hashes with a salt (same PIN, different salt → different hash)', async () => {
    const a = await hashSecret('1234', 'salt-a')
    const b = await hashSecret('1234', 'salt-b')
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).not.toBe(b)
    expect(await hashSecret('1234', 'salt-a')).toBe(a)
  })

  it('recovery codes look like XXXX-XXXX-XXXX without confusing characters', () => {
    const code = generateRecoveryCode()
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/)
  })
})

describe('Users and login', () => {
  let db, run, select
  beforeEach(() => {
    db = createDb(); run = runInTestDb(db)
    select = async (sql, params) => db.prepare(sql).all(...params)
  })

  it('first-run setup creates the owner and saves shop settings', async () => {
    const { statements, recoveryCode } = await buildSetupStatements({
      business: { business_name: 'Duka Rica', vat_enabled: '1', not_a_setting: 'x' },
      ownerName: 'Rica', pin: '2468',
    })
    await run(statements)

    const owner = db.prepare('SELECT * FROM users').get()
    expect(owner).toMatchObject({ name: 'Rica', role: 'owner', active: 1 })
    expect(owner.pin_hash).not.toContain('2468')
    expect(await checkPin(owner, '2468')).toBe(true)

    const settings = parseSettings(db.prepare('SELECT key, value FROM settings').all())
    expect(settings).toMatchObject({ business_name: 'Duka Rica', vat_enabled: '1', setup_done: '1' })
    expect(settings.not_a_setting).toBeUndefined()
    expect(settings.recovery_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(recoveryCode).toMatch(/-/)
  })

  it('signs in with the right PIN and refuses a wrong one', async () => {
    await run([await buildCreateUserStatement({ name: 'Aline', role: 'cashier', pin: '1111' })])
    const id = db.prepare('SELECT id FROM users').get().id

    await expect(login(id, '9999', { select })).rejects.toThrow('Wrong PIN')
    expect(await login(id, '1111', { select })).toEqual({ id, name: 'Aline', role: 'cashier' })
  })

  it('locks an account for 30 seconds after 5 wrong PINs', async () => {
    await run([await buildCreateUserStatement({ name: 'Eric', role: 'cashier', pin: '1111' })])
    const id = db.prepare('SELECT id FROM users').get().id
    const now = 1_000_000
    for (let i = 0; i < 5; i++) await expect(login(id, '0000', { select, now })).rejects.toThrow('Wrong PIN')
    await expect(login(id, '1111', { select, now: now + 1000 })).rejects.toThrow(/Too many/)
    expect((await login(id, '1111', { select, now: now + 31000 })).name).toBe('Eric')
  })

  it('a deactivated user cannot sign in', async () => {
    await run([
      await buildCreateUserStatement({ name: 'Owner', role: 'owner', pin: '1234' }),
      await buildCreateUserStatement({ name: 'Old cashier', role: 'cashier', pin: '5555' }),
    ])
    const cashier = db.prepare(`SELECT id FROM users WHERE role = 'cashier'`).get().id
    await run([buildSetUserActiveStatement(cashier, false)])
    await expect(login(cashier, '5555', { select })).rejects.toThrow('Wrong PIN')
  })

  it('never deactivates the only owner', async () => {
    await run([await buildCreateUserStatement({ name: 'Owner', role: 'owner', pin: '1234' })])
    const owner = db.prepare('SELECT id FROM users').get().id
    await expect(run([buildSetUserActiveStatement(owner, false)])).rejects.toMatch('only owner')
    expect(db.prepare('SELECT active FROM users').get().active).toBe(1)
  })

  it('rejects bad PINs and roles when creating users', async () => {
    await expect(buildCreateUserStatement({ name: 'X', role: 'cashier', pin: '12' })).rejects.toThrow()
    await expect(buildCreateUserStatement({ name: 'X', role: 'admin', pin: '1234' })).rejects.toThrow()
    await expect(buildCreateUserStatement({ name: ' ', role: 'cashier', pin: '1234' })).rejects.toThrow()
  })
})

describe('Settings', () => {
  it('saves and updates values, ignoring unknown keys', async () => {
    const db = createDb(); const run = runInTestDb(db)
    await run(buildSaveSettingsStatements({ business_name: 'A', vat_rate: 18, junk: 'x' }))
    await run(buildSaveSettingsStatements({ business_name: 'B' }))
    const s = parseSettings(db.prepare('SELECT key, value FROM settings').all())
    expect(s.business_name).toBe('B')
    expect(s.vat_rate).toBe('18')
    expect(s.receipt_footer).toBe(DEFAULT_SETTINGS.receipt_footer)
    expect(db.prepare(`SELECT COUNT(*) n FROM settings WHERE key = 'junk'`).get().n).toBe(0)
  })

  it('VAT rate is 0 unless VAT is turned on', () => {
    expect(vatRate({ vat_enabled: '0', vat_rate: '18' })).toBe(0)
    expect(vatRate({ vat_enabled: '1', vat_rate: '18' })).toBe(18)
  })
})

describe('Roles', () => {
  const owner = { role: 'owner' }
  const cashier = { role: 'cashier' }

  it('cashiers only see selling pages', () => {
    expect(canSeePage(cashier, 'pos')).toBe(true)
    expect(canSeePage(cashier, 'sales')).toBe(true)
    expect(canSeePage(cashier, 'customers')).toBe(true)
    for (const page of ['dashboard', 'products', 'profit', 'expenses', 'transactions', 'settings', 'suppliers']) {
      expect(canSeePage(cashier, page)).toBe(false)
    }
    expect(homePage(cashier)).toBe('pos')
  })

  it('cashiers cannot void, delete, see profit or restore', () => {
    for (const action of ['void_sale', 'delete', 'see_profit', 'backup_restore', 'manage_users']) {
      expect(can(cashier, action)).toBe(false)
      expect(can(owner, action)).toBe(true)
    }
    expect(can(cashier, 'record_payment')).toBe(true)
    expect(can(null, 'record_payment')).toBe(false)
  })
})

describe('Translations', () => {
  it('falls back to English and fills placeholders', () => {
    expect(translate('rw', 'A sentence nobody translated')).toBe('A sentence nobody translated')
    expect(translate('en', '{n} minutes', { n: 5 })).toBe('5 minutes')
  })
})

describe('Upgrading an existing shop', () => {
  it('keeps all data when an older database gets the new version', async () => {
    const { MIGRATIONS } = await import('./realDb')
    const db = createDb(10) // database as it is after Round 3
    db.exec(`
      INSERT INTO products (name, sku, stock) VALUES ('Rice', 'R1', 5);
      INSERT INTO sales (receipt_number, total, payment_method) VALUES ('RCT-OLD', 4500, 'Cash');
      INSERT INTO customers (name) VALUES ('Ann');
    `)
    db.exec(MIGRATIONS[10]) // migration 11

    expect(db.prepare('SELECT amount_paid FROM sales').get().amount_paid).toBe(4500) // old sales count as fully paid
    expect(db.prepare('SELECT COUNT(*) n FROM products').get().n).toBe(1)
    expect(db.prepare('SELECT COUNT(*) n FROM users').get().n).toBe(0) // → the app shows the setup screen
    const balance = db.prepare(`SELECT ${(await import('../../services/customerService')).balanceSql('?')} AS b`).get(1, 1).b
    expect(balance).toBe(0)
  })
})
