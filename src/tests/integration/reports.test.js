// Reports by period, VAT in P&L, date ranges and Excel files.
import { describe, it, expect } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import { createDb, runInTestDb } from './realDb'
import { getPLReport } from '../../services/plService'
import { completeSale } from '../../services/salesService'
import { buildAddExpenseStatements } from '../../services/expenseService'
import { rangeFor } from '../../utils/dateRanges'
import { buildXlsx } from '../../utils/excel'

describe('Date ranges', () => {
  const now = new Date(2026, 9, 22, 15, 0) // Thursday 22 Oct 2026

  it('gives the usual periods in local dates', () => {
    expect(rangeFor('today', now)).toEqual({ from: '2026-10-22', to: '2026-10-22' })
    expect(rangeFor('yesterday', now)).toEqual({ from: '2026-10-21', to: '2026-10-21' })
    expect(rangeFor('this_week', now)).toEqual({ from: '2026-10-19', to: '2026-10-22' }) // Monday
    expect(rangeFor('this_month', now)).toEqual({ from: '2026-10-01', to: '2026-10-22' })
    expect(rangeFor('last_month', now)).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(rangeFor('this_year', now)).toEqual({ from: '2026-01-01', to: '2026-10-22' })
    expect(rangeFor('all', now)).toEqual({ from: null, to: null })
  })

  it('handles January (last month is December of last year) and Sundays', () => {
    expect(rangeFor('last_month', new Date(2026, 0, 10))).toEqual({ from: '2025-12-01', to: '2025-12-31' })
    expect(rangeFor('this_week', new Date(2026, 9, 25))).toEqual({ from: '2026-10-19', to: '2026-10-25' })
  })
})

describe('Profit & Loss by period', () => {
  async function setup() {
    const db = createDb(); const run = runInTestDb(db)
    const select = async (sql, params = []) => db.prepare(sql).all(...params)
    const pid = Number(db.prepare(`INSERT INTO products (name, sku, buy_price, sell_price, stock) VALUES ('Soap', 'S', 500, 1180, 100)`).run().lastInsertRowid)
    // One sale in September, one in October (VAT 18% included)
    for (const when of ['2026-09-15 10:00:00', '2026-10-05 10:00:00']) {
      const r = await completeSale([{ id: pid, name: 'Soap', sell_price: 1180, quantity: 10 }], { paymentMethod: 'Cash', vatRate: 18 }, run)
      db.prepare('UPDATE sales SET created_at = ? WHERE id = ?').run(when, r.saleId)
    }
    await run(buildAddExpenseStatements({ description: 'Rent', category: 'Rent', amount: 2000, date: '2026-10-01' }))
    await run(buildAddExpenseStatements({ description: 'Rent', category: 'Rent', amount: 2000, date: '2026-09-01' }))
    db.exec(`INSERT INTO transactions (description, type, category, amount, date) VALUES ('Tips', 'income', 'Other', 300, '2026-10-10')`)
    return select
  }

  it('only counts the chosen month, and takes VAT out of sales', async () => {
    const select = await setup()
    const r = await getPLReport({ from: '2026-10-01', to: '2026-10-31', select })
    expect(r).toMatchObject({
      salesCount: 1,
      totalRevenue: 11800,
      vatCollected: 1800,
      netSales: 10000,
      totalCogs: 5000,
      grossProfit: 5000,
      totalExpenses: 2000,
      otherIncome: 300,
      netProfit: 3300,
    })
  })

  it('all time adds everything up', async () => {
    const select = await setup()
    const r = await getPLReport({ select })
    expect(r).toMatchObject({ salesCount: 2, totalRevenue: 23600, vatCollected: 3600, totalExpenses: 4000, netProfit: 20000 - 10000 - 4000 + 300 })
  })
})

describe('Excel files', () => {
  it('builds a valid workbook with numbers as numbers and text escaped', () => {
    const files = unzipSync(buildXlsx([{
      name: 'Sales/Oct',
      columns: [{ header: 'Name', key: 'n' }, { header: 'Total', key: 'v', type: 'money' }],
      rows: [{ n: 'Ann & <Co>', v: 12500 }, { n: '=1+1', v: null }],
    }]))
    expect(Object.keys(files)).toEqual(expect.arrayContaining(['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/styles.xml']))
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml'])
    expect(sheet).toContain('Ann &amp; &lt;Co&gt;')
    expect(sheet).toContain('<v>12500</v>')
    expect(sheet).toContain('<t xml:space="preserve">=1+1</t>') // text, never a formula
    expect(strFromU8(files['xl/workbook.xml'])).toContain('name="Sales Oct"')
  })
})
