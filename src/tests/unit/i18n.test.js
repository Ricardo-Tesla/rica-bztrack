// Every English text the app shows must have a Kinyarwanda and French translation.
// To list what is missing:   npx vitest run src/tests/unit/i18n.test.js
// To dump all texts:          I18N_DUMP=keys.json npx vitest run src/tests/unit/i18n.test.js
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'
import * as constants from '../../utils/constants'
import { PRESET_LABELS } from '../../utils/dateRanges'
import rw from '../../i18n/rw'
import fr from '../../i18n/fr'

const SRC = resolve(process.cwd(), 'src')

function sourceFiles(dir) {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return name === 'tests' || name === 'i18n' ? [] : sourceFiles(p)
    return /\.(jsx?)$/.test(name) ? [p] : []
  })
}

// Texts translated from data (lists, labels, types) or thrown by services
const EXTRA = [
  'Dashboard', 'Point of Sale', 'Sales History', 'Products', 'Suppliers', 'Customers', 'Transactions',
  'Expenses', 'Profit & Loss', 'Settings', 'Sales', 'Inventory', 'People', 'Finance', 'System',
  'Shop', 'Receipts & VAT', 'Users', 'Backups', 'General', 'About',
  'restock', 'adjustment', 'return', 'Debt Repayment', 'Refund',
  'Cart is empty', 'Choose a customer for a credit sale', 'Enter a valid amount', 'Wrong PIN',
  'Too many wrong PINs. Try again in {secs} seconds.', 'PIN must be 4 to 6 digits', 'Name is required',
  'Invalid role', 'User not found', 'Wrong recovery code', 'No recovery code was set up.', 'No owner account found',
  'This shop is already set up.', 'Valid quantity is required', 'This product can only be stocked in whole units',
  'Unit cost cannot be negative', '{name} has an invalid quantity', '{name} can only be sold in whole units',
  'Database is not loaded yet', 'This file is not a valid Rica BizTrack backup.',
  'This backup file is damaged and cannot be restored.', 'That is the live database, not a backup file.',
]

export function collectKeys() {
  const keys = new Set(EXTRA)
  const re = /\bt\(\s*(['"])((?:\\.|(?!\1)[^\\])*)\1/g
  // tn(t, n, 'singular', 'plural')
  const plural = /\btn\(\s*t\s*,[^,]+,\s*'([^']*)'\s*,\s*'([^']*)'/g
  for (const file of sourceFiles(SRC)) {
    const src = readFileSync(file, 'utf8')
    for (const m of src.matchAll(re)) {
      keys.add(m[2].replace(/\\(['"\\])/g, '$1').replace(/\\n/g, '\n'))
    }
    for (const m of src.matchAll(plural)) { keys.add(m[1]); keys.add(m[2]) }
  }
  ;[...constants.SALE_PAYMENT_METHODS, ...constants.PRODUCT_CATEGORIES, ...constants.PRODUCT_UNITS,
    ...constants.TRANSACTION_CATEGORIES, ...constants.EXPENSE_CATEGORIES, ...Object.values(PRESET_LABELS)]
    .forEach(k => keys.add(k))
  keys.delete('')
  return [...keys].sort()
}

describe('Translations', () => {
  const keys = collectKeys()
  if (process.env.I18N_DUMP) writeFileSync(process.env.I18N_DUMP, JSON.stringify(keys, null, 2))

  for (const [lang, dict] of [['Kinyarwanda', rw], ['French', fr]]) {
    it(`${lang} has every text`, () => {
      const missing = keys.filter(k => !dict[k])
      expect(missing, `Missing ${lang} translations:\n${missing.join('\n')}`).toEqual([])
    })

    it(`${lang} keeps every {placeholder}`, () => {
      const broken = keys.filter(k => dict[k] && (k.match(/\{\w+\}/g) || []).some(ph => !dict[k].includes(ph)))
      expect(broken).toEqual([])
    })
  }
})
