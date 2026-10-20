// POS upgrades, VAT, credit sales (ideni), customer payments and receipts.
import { describe, it, expect, beforeEach } from 'vitest'
import { createDb, runInTestDb } from './realDb'
import { calculateTotals, completeSale, voidSale, validateCart, qtyLabel } from '../../services/salesService'
import { buildRecordPaymentStatements, buildVoidPaymentStatements, balanceSql } from '../../services/customerService'
import { buildRestockStatements } from '../../services/restockService'
import { findByCode } from '../../services/productService'
import { buildReceiptModel, renderReceiptText, renderReceiptHtml } from '../../utils/receiptPrinter'
import { setCurrentUser } from '../../utils/session'

describe('Totals: discount and VAT', () => {
  const cart = [
    { id: 1, name: 'Soap', sell_price: 1180, quantity: 2 },               // 2,360
    { id: 2, name: 'Beans', sell_price: 1000, quantity: 1, vat_exempt: 1 }, // 1,000 (exempt)
  ]

  it('adds lines and applies no VAT for a non-VAT shop', () => {
    expect(calculateTotals(cart)).toMatchObject({ subtotal: 3360, discountAmount: 0, total: 3360, vat: 0 })
  })

  it('computes VAT included in prices, skipping exempt items', () => {
    // 2,360 × 18/118 = 360
    expect(calculateTotals(cart, { vatRate: 18 })).toMatchObject({ total: 3360, vat: 360 })
  })

  it('applies an amount or percent discount, never below zero', () => {
    expect(calculateTotals(cart, { discount: { type: 'amount', value: 360 } })).toMatchObject({ discountAmount: 360, total: 3000 })
    expect(calculateTotals(cart, { discount: { type: 'percent', value: 10 } })).toMatchObject({ discountAmount: 336, total: 3024 })
    expect(calculateTotals(cart, { discount: { type: 'amount', value: 99999 } })).toMatchObject({ total: 0 })
  })

  it('a discount reduces the VAT proportionally', () => {
    // total 3,000 of 3,360 → VAT 360 × 3000/3360 ≈ 321
    expect(calculateTotals(cart, { vatRate: 18, discount: { type: 'amount', value: 360 } }).vat).toBe(321)
  })

  it('rounds to whole francs', () => {
    expect(calculateTotals([{ id: 1, name: 'Rice', sell_price: 1250, quantity: 0.333 }]).total).toBe(416)
  })
})

describe('Selling', () => {
  let db, run
  beforeEach(() => {
    db = createDb(); run = runInTestDb(db)
    setCurrentUser({ id: 1, name: 'Aline', role: 'cashier' })
  })

  const product = (name, stock, unit = 'Piece', price = 1000) => Number(db.prepare(
    `INSERT INTO products (name, sku, unit, buy_price, sell_price, stock) VALUES (?, ?, ?, 600, ?, ?)`
  ).run(name, name.toUpperCase(), unit, price, stock).lastInsertRowid)

  const customer = name => ({ id: Number(db.prepare(`INSERT INTO customers (name) VALUES (?)`).run(name).lastInsertRowid), name })
  const balance = id => db.prepare(`SELECT ${balanceSql('?')} AS b`).get(id, id).b

  it('sells kg products in parts and keeps stock exact', async () => {
    const id = product('Rice', 10, 'Kg', 1200)
    await completeSale([{ id, name: 'Rice', unit: 'Kg', sell_price: 1200, quantity: 1.5 }], { paymentMethod: 'Cash' }, run)
    await completeSale([{ id, name: 'Rice', unit: 'Kg', sell_price: 1200, quantity: 0.1 }], { paymentMethod: 'Cash' }, run)
    expect(db.prepare('SELECT stock FROM products').get().stock).toBe(8.4)
    expect(db.prepare('SELECT SUM(subtotal) s FROM sale_items').get().s).toBe(1800 + 120)
  })

  it('refuses parts of a piece', () => {
    expect(validateCart([{ id: 1, name: 'Soap', unit: 'Piece', quantity: 1.5 }])?.message).toMatch('whole units')
    expect(validateCart([{ id: 1, name: 'Rice', unit: 'Kg', quantity: 1.5 }])).toBe(null)
    expect(validateCart([])).toBe('Cart is empty')
  })

  it('records discount, VAT, payment reference and the cashier', async () => {
    const id = product('Soap', 5, 'Piece', 1180)
    const r = await completeSale([{ id, name: 'Soap', sell_price: 1180, quantity: 2 }], {
      paymentMethod: 'Mobile Money', paymentReference: 'MP123', vatRate: 18, discount: { type: 'amount', value: 60 },
    }, run)
    const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(r.saleId)
    expect(sale).toMatchObject({ subtotal: 2360, discount: 60, total: 2300, tax: 351, payment_reference: 'MP123', user_name: 'Aline', amount_paid: 2300 })
    expect(db.prepare('SELECT vat_rate FROM sale_items').get().vat_rate).toBe(18)
    expect(db.prepare('SELECT amount, payment_method, user_name FROM transactions').get())
      .toEqual({ amount: 2300, payment_method: 'Mobile Money', user_name: 'Aline' })
  })

  it('credit sale: only the part paid now goes in the cash ledger, the rest is owed', async () => {
    const id = product('Oil', 10, 'Piece', 5000)
    const ann = customer('Ann')
    await completeSale([{ id, name: 'Oil', sell_price: 5000, quantity: 2 }], {
      customer: ann, paymentMethod: 'Credit', amountPaid: 3000, paidNowMethod: 'Mobile Money',
    }, run)

    expect(db.prepare('SELECT total, amount_paid FROM sales').get()).toEqual({ total: 10000, amount_paid: 3000 })
    expect(db.prepare('SELECT amount, payment_method FROM transactions').get()).toEqual({ amount: 3000, payment_method: 'Mobile Money' })
    expect(balance(ann.id)).toBe(7000)
  })

  it('credit sale needs a customer', async () => {
    const id = product('Oil', 10)
    await expect(completeSale([{ id, name: 'Oil', sell_price: 1000, quantity: 1 }], { paymentMethod: 'Credit' }, run))
      .rejects.toThrow('Choose a customer')
  })

  it('repayments reduce the debt, go in the ledger, and cannot exceed it', async () => {
    const id = product('Oil', 10, 'Piece', 5000)
    const ann = customer('Ann')
    await completeSale([{ id, name: 'Oil', sell_price: 5000, quantity: 1 }], { customer: ann, paymentMethod: 'Credit' }, run)
    expect(db.prepare('SELECT COUNT(*) n FROM transactions').get().n).toBe(0) // nothing paid yet

    await run(buildRecordPaymentStatements({ customerId: ann.id, customerName: 'Ann', amount: 2000, paymentMethod: 'Cash' }))
    expect(balance(ann.id)).toBe(3000)
    expect(db.prepare(`SELECT category, amount, reference_type FROM transactions`).get())
      .toEqual({ category: 'Debt Repayment', amount: 2000, reference_type: 'customer_payment' })

    await expect(run(buildRecordPaymentStatements({ customerId: ann.id, customerName: 'Ann', amount: 3001 })))
      .rejects.toMatch('more than what the customer owes')
    expect(balance(ann.id)).toBe(3000)

    // Cancel the repayment: the debt comes back, the ledger entry goes
    const paymentId = db.prepare('SELECT id FROM customer_payments').get().id
    await run(buildVoidPaymentStatements(paymentId))
    expect(balance(ann.id)).toBe(5000)
    expect(db.prepare('SELECT COUNT(*) n FROM transactions').get().n).toBe(0)
  })

  it('voiding a credit sale refunds only what was paid and clears the debt', async () => {
    const id = product('Oil', 10, 'Piece', 5000)
    const ann = customer('Ann')
    const r = await completeSale([{ id, name: 'Oil', sell_price: 5000, quantity: 2 }], { customer: ann, paymentMethod: 'Credit', amountPaid: 1000 }, run)
    const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(r.saleId)
    sale.items = db.prepare('SELECT * FROM sale_items').all()

    await voidSale(sale, 'Wrong customer', run)

    expect(balance(ann.id)).toBe(0)
    expect(db.prepare(`SELECT amount FROM transactions WHERE category = 'Refund'`).get().amount).toBe(1000)
    expect(db.prepare('SELECT voided_by, void_reason FROM sales').get()).toEqual({ voided_by: 'Aline', void_reason: 'Wrong customer' })
    expect(db.prepare('SELECT stock FROM products').get().stock).toBe(10)
  })

  it('restocks kg products in parts', async () => {
    const id = product('Rice', 1, 'Kg')
    await run(buildRestockStatements({ product_id: id, product_name: 'Rice', unit: 'Kg', quantity: '2.5', unit_cost: 800, date: '2026-10-19' }).statements)
    expect(db.prepare('SELECT stock FROM products').get().stock).toBe(3.5)
    expect(() => buildRestockStatements({ product_id: id, product_name: 'Soap', unit: 'Piece', quantity: '2.5', date: '2026-10-19' })).toThrow('whole units')
  })

  it('two products cannot share a barcode (archived ones are ignored)', () => {
    db.prepare(`INSERT INTO products (name, sku, barcode) VALUES ('A', 'A', '6001234')`).run()
    expect(() => db.prepare(`INSERT INTO products (name, sku, barcode) VALUES ('B', 'B', '6001234')`).run()).toThrow(/UNIQUE/)
    db.prepare(`UPDATE products SET archived = 1 WHERE sku = 'A'`).run()
    expect(() => db.prepare(`INSERT INTO products (name, sku, barcode) VALUES ('B', 'B', '6001234')`).run()).not.toThrow()
  })
})

describe('Barcode lookup', () => {
  const products = [
    { id: 1, name: 'Soap', sku: 'SOAP-1', barcode: '6001234567890' },
    { id: 2, name: 'Rice', sku: '6001234567890X', barcode: null },
  ]
  it('finds by barcode first, then by SKU (case-insensitive)', () => {
    expect(findByCode(products, '6001234567890').id).toBe(1)
    expect(findByCode(products, 'soap-1').id).toBe(1)
    expect(findByCode(products, '  6001234567890x ').id).toBe(2)
    expect(findByCode(products, 'nothing')).toBe(null)
  })

  it('labels quantities with short units', () => {
    expect(qtyLabel(1.5, 'Kg')).toBe('1.5 kg')
    expect(qtyLabel(2, 'Litre')).toBe('2 L')
    expect(qtyLabel(3, 'Piece')).toBe('3')
  })
})

describe('Receipts', () => {
  const settings = {
    business_name: 'Duka Rica', business_address: 'Kigali, Nyarugenge', business_phone: '0788000000',
    business_tin: '123456789', receipt_footer: 'Murakoze!', vat_rate: '18',
  }
  const sale = {
    receipt_number: 'RCT-20261019-ABC123', created_at: '2026-10-19 12:00:00', customer_name: 'Ann',
    payment_method: 'Credit', subtotal: 10000, discount: 500, total: 9500, tax: 1449, amount_paid: 2000,
    user_name: 'Aline', payment_reference: null, ebm_receipt_no: 'EBM-77',
    items: [{ product_name: 'Rice <25kg>', quantity: 2, unit_price: 5000, subtotal: 10000 }],
  }

  it('shows the shop details, totals, VAT, debt and the "not an EBM invoice" notice', () => {
    const text = renderReceiptText(buildReceiptModel(sale, settings))
    for (const part of ['Duka Rica', 'Kigali, Nyarugenge', 'TIN: 123456789', 'RCT-20261019-ABC123', 'Aline',
      'RWF 9,500', 'RWF 1,449', 'Balance due', 'RWF 7,500', 'EBM-77', 'Murakoze!', 'not an EBM']) {
      expect(text).toContain(part)
    }
  })

  it('escapes product names in the printed version', () => {
    const html = renderReceiptHtml(buildReceiptModel(sale, settings))
    expect(html).toContain('Rice &lt;25kg&gt;')
    expect(html).not.toContain('<25kg>')
  })

  it('marks voided sales', () => {
    expect(renderReceiptText(buildReceiptModel({ ...sale, status: 'voided' }, settings))).toContain('VOIDED')
  })
})
