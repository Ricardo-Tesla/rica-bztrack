import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getTestDb, resetTestDb } from './testDB'
import { addProductToDb, getProductsFromDb } from './serviceHelpers'
import { addSupplierToDb, getExpensesFromDb, getTransactionsFromDb } from './serviceHelpers'
import { restockProductInDb, getStockMovementsFromDb } from './serviceHelpers'

beforeEach(() => { getTestDb() })
afterEach(() => { resetTestDb() })

// ============================================================
// RESTOCK TESTS
// ============================================================
describe('Restock Service', () => {

  it('increases product stock after restock', () => {
    const db = getTestDb()
    const id = addProductToDb(db, {
      name: 'Laptop', sku: 'LAP-001',
      buy_price: 6, sell_price: 10, stock: 10
    })
    restockProductInDb(db, {
      product_id: id, product_name: 'Laptop',
      quantity: 20, unit_cost: 7,
      date: '2026-03-06'
    })
    const products = getProductsFromDb(db)
    expect(products[0].stock).toBe(30)
  })

  it('calculates correct weighted average cost', () => {
    const db = getTestDb()
    const id = addProductToDb(db, {
      name: 'Laptop', sku: 'LAP-001',
      buy_price: 6, sell_price: 10, stock: 10
    })
    restockProductInDb(db, {
      product_id: id, product_name: 'Laptop',
      quantity: 20, unit_cost: 7,
      date: '2026-03-06'
    })
    const products = getProductsFromDb(db)
    // (10 × 6 + 20 × 7) / 30 = 200 / 30 = 6.67
    expect(products[0].buy_price).toBe(6.67)
  })

  it('keeps buy price unchanged when unit cost is 0', () => {
    const db = getTestDb()
    const id = addProductToDb(db, {
      name: 'Laptop', sku: 'LAP-001',
      buy_price: 6, sell_price: 10, stock: 10
    })
    restockProductInDb(db, {
      product_id: id, product_name: 'Laptop',
      quantity: 20, unit_cost: 0,
      date: '2026-03-06'
    })
    const products = getProductsFromDb(db)
    expect(products[0].buy_price).toBe(6)
  })

  it('records a stock movement entry', () => {
    const db = getTestDb()
    const id = addProductToDb(db, {
      name: 'Laptop', sku: 'LAP-001',
      buy_price: 6, sell_price: 10, stock: 10
    })
    restockProductInDb(db, {
      product_id: id, product_name: 'Laptop',
      quantity: 20, unit_cost: 7,
      date: '2026-03-06'
    })
    const movements = getStockMovementsFromDb(db, id)
    expect(movements).toHaveLength(1)
    expect(movements[0].quantity).toBe(20)
    expect(movements[0].unit_cost).toBe(7)
    expect(movements[0].total_cost).toBe(140)
    expect(movements[0].type).toBe('restock')
  })

  it('records expense when unit cost is provided', () => {
    const db = getTestDb()
    const id = addProductToDb(db, {
      name: 'Laptop', sku: 'LAP-001',
      buy_price: 6, sell_price: 10, stock: 10
    })
    restockProductInDb(db, {
      product_id: id, product_name: 'Laptop',
      quantity: 20, unit_cost: 7,
      date: '2026-03-06'
    })
    const expenses = getExpensesFromDb(db)
    expect(expenses).toHaveLength(1)
    expect(expenses[0].amount).toBe(140)
    expect(expenses[0].category).toBe('Stock Purchase')
  })

  it('does not record expense when unit cost is 0', () => {
    const db = getTestDb()
    const id = addProductToDb(db, {
      name: 'Laptop', sku: 'LAP-001',
      buy_price: 6, sell_price: 10, stock: 10
    })
    restockProductInDb(db, {
      product_id: id, product_name: 'Laptop',
      quantity: 20, unit_cost: 0,
      date: '2026-03-06'
    })
    const expenses = getExpensesFromDb(db)
    expect(expenses).toHaveLength(0)
  })

  it('auto creates transaction when expense is recorded', () => {
    const db = getTestDb()
    const id = addProductToDb(db, {
      name: 'Laptop', sku: 'LAP-001',
      buy_price: 6, sell_price: 10, stock: 10
    })
    restockProductInDb(db, {
      product_id: id, product_name: 'Laptop',
      quantity: 20, unit_cost: 7,
      date: '2026-03-06'
    })
    const transactions = getTransactionsFromDb(db)
    expect(transactions).toHaveLength(1)
    expect(transactions[0].type).toBe('expense')
    expect(transactions[0].category).toBe('Stock Purchase')
    expect(transactions[0].amount).toBe(140)
  })

  it('links stock movement to supplier', () => {
    const db = getTestDb()
    const supplierId = addSupplierToDb(db, { name: 'Acme Supplies' })
    const id = addProductToDb(db, {
      name: 'Laptop', sku: 'LAP-001',
      buy_price: 6, sell_price: 10, stock: 10
    })
    restockProductInDb(db, {
      product_id: id, product_name: 'Laptop',
      quantity: 20, unit_cost: 7,
      supplier_id: supplierId,
      supplier_name: 'Acme Supplies',
      date: '2026-03-06'
    })
    const movements = getStockMovementsFromDb(db, id)
    expect(movements[0].supplier_name).toBe('Acme Supplies')
    expect(movements[0].supplier_id).toBe(supplierId)
  })

  it('handles multiple restocks and compounds average correctly', () => {
    const db = getTestDb()
    const id = addProductToDb(db, {
      name: 'Laptop', sku: 'LAP-001',
      buy_price: 6, sell_price: 10, stock: 10
    })
    // First restock: 20 units @ $7
    // Average after: (10×6 + 20×7) / 30 = 6.67
    restockProductInDb(db, {
      product_id: id, product_name: 'Laptop',
      quantity: 20, unit_cost: 7, date: '2026-03-06'
    })
    // Second restock: 10 units @ $8
    // Average after: (30×6.67 + 10×8) / 40 = (200.1 + 80) / 40 = 7.00
    restockProductInDb(db, {
      product_id: id, product_name: 'Laptop',
      quantity: 10, unit_cost: 8, date: '2026-03-06'
    })
    const products = getProductsFromDb(db)
    expect(products[0].stock).toBe(40)
    expect(products[0].buy_price).toBe(7.00)
  })

  it('records multiple stock movements for multiple restocks', () => {
    const db = getTestDb()
    const id = addProductToDb(db, {
      name: 'Laptop', sku: 'LAP-001',
      buy_price: 6, sell_price: 10, stock: 10
    })
    restockProductInDb(db, {
      product_id: id, product_name: 'Laptop',
      quantity: 20, unit_cost: 7, date: '2026-03-01'
    })
    restockProductInDb(db, {
      product_id: id, product_name: 'Laptop',
      quantity: 10, unit_cost: 8, date: '2026-03-06'
    })
    const movements = getStockMovementsFromDb(db, id)
    expect(movements).toHaveLength(2)
  })
})