import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getTestDb, resetTestDb } from './testDb'
import {
    addSupplierToDb, getSuppliersFromDb, deleteSupplierFromDb,
    addProductToDb, getProductsFromDb, deleteProductFromDb,
    addCustomerToDb, getCustomersFromDb,
    completeSaleInDb, getSalesFromDb,
    addExpenseToDb, getExpensesFromDb, getTransactionsFromDb,
} from './serviceHelpers'

// Fresh database before each test
beforeEach(() => { getTestDb() })
afterEach(() => { resetTestDb() })

// ============================================================
// SUPPLIER TESTS
// ============================================================
describe('Supplier Service', () => {
    it('adds a supplier and retrieves it', () => {
        const db = getTestDb()
        addSupplierToDb(db, { name: 'Acme Co', phone: '123456' })
        const suppliers = getSuppliersFromDb(db)
        expect(suppliers).toHaveLength(1)
        expect(suppliers[0].name).toBe('Acme Co')
        expect(suppliers[0].phone).toBe('123456')
    })

    it('adds multiple suppliers', () => {
        const db = getTestDb()
        addSupplierToDb(db, { name: 'Supplier A' })
        addSupplierToDb(db, { name: 'Supplier B' })
        addSupplierToDb(db, { name: 'Supplier C' })
        const suppliers = getSuppliersFromDb(db)
        expect(suppliers).toHaveLength(3)
    })

    it('retrieves suppliers in alphabetical order', () => {
        const db = getTestDb()
        addSupplierToDb(db, { name: 'Zebra Supplies' })
        addSupplierToDb(db, { name: 'Acme Co' })
        const suppliers = getSuppliersFromDb(db)
        expect(suppliers[0].name).toBe('Acme Co')
        expect(suppliers[1].name).toBe('Zebra Supplies')
    })

    it('deletes a supplier', () => {
        const db = getTestDb()
        const id = addSupplierToDb(db, { name: 'To Delete' })
        deleteSupplierFromDb(db, id)
        const suppliers = getSuppliersFromDb(db)
        expect(suppliers).toHaveLength(0)
    })

    it('stores optional fields correctly', () => {
        const db = getTestDb()
        addSupplierToDb(db, {
            name: 'Full Supplier',
            contact: 'John Doe',
            phone: '+1234567890',
            email: 'john@supplier.com',
            address: 'Kigali, Rwanda',
            notes: 'Reliable supplier'
        })
        const suppliers = getSuppliersFromDb(db)
        expect(suppliers[0].email).toBe('john@supplier.com')
        expect(suppliers[0].address).toBe('Kigali, Rwanda')
    })

    it('stores null for missing optional fields', () => {
        const db = getTestDb()
        addSupplierToDb(db, { name: 'Minimal Supplier' })
        const suppliers = getSuppliersFromDb(db)
        expect(suppliers[0].phone).toBeNull()
        expect(suppliers[0].email).toBeNull()
    })
})

// ============================================================
// PRODUCT TESTS
// ============================================================
describe('Product Service', () => {
    it('adds a product and retrieves it', () => {
        const db = getTestDb()
        addProductToDb(db, {
            name: 'Laptop', sku: 'LAP-001',
            buy_price: 800, sell_price: 1200, stock: 10
        })
        const products = getProductsFromDb(db)
        expect(products).toHaveLength(1)
        expect(products[0].name).toBe('Laptop')
        expect(products[0].sell_price).toBe(1200)
    })

    it('enforces unique SKU', () => {
        const db = getTestDb()
        addProductToDb(db, { name: 'Product A', sku: 'SKU-001', sell_price: 100, buy_price: 60 })
        expect(() => {
            addProductToDb(db, { name: 'Product B', sku: 'SKU-001', sell_price: 200, buy_price: 100 })
        }).toThrow()
    })

    it('stores correct buy and sell prices', () => {
        const db = getTestDb()
        addProductToDb(db, { name: 'Test', sku: 'T-001', buy_price: 500, sell_price: 750, stock: 5 })
        const products = getProductsFromDb(db)
        expect(products[0].buy_price).toBe(500)
        expect(products[0].sell_price).toBe(750)
    })

    it('defaults stock to 0 when not provided', () => {
        const db = getTestDb()
        addProductToDb(db, { name: 'Test', sku: 'T-002', sell_price: 100, buy_price: 60 })
        const products = getProductsFromDb(db)
        expect(products[0].stock).toBe(0)
    })

    it('deletes a product', () => {
        const db = getTestDb()
        const id = addProductToDb(db, { name: 'To Delete', sku: 'DEL-001', sell_price: 100, buy_price: 60 })
        deleteProductFromDb(db, id)
        const products = getProductsFromDb(db)
        expect(products).toHaveLength(0)
    })

    it('links product to supplier', () => {
        const db = getTestDb()
        const supplierId = addSupplierToDb(db, { name: 'Test Supplier' })
        addProductToDb(db, {
            name: 'Linked Product', sku: 'LP-001',
            sell_price: 100, buy_price: 60, supplier_id: supplierId
        })
        const products = getProductsFromDb(db)
        expect(products[0].supplier_id).toBe(supplierId)
    })
})

// ============================================================
// CUSTOMER TESTS
// ============================================================
describe('Customer Service', () => {
    it('adds a customer and retrieves it', () => {
        const db = getTestDb()
        addCustomerToDb(db, { name: 'Jane Doe', phone: '0789123456' })
        const customers = getCustomersFromDb(db)
        expect(customers).toHaveLength(1)
        expect(customers[0].name).toBe('Jane Doe')
    })

    it('adds multiple customers', () => {
        const db = getTestDb()
        addCustomerToDb(db, { name: 'Customer A' })
        addCustomerToDb(db, { name: 'Customer B' })
        const customers = getCustomersFromDb(db)
        expect(customers).toHaveLength(2)
    })

    it('stores null for missing optional fields', () => {
        const db = getTestDb()
        addCustomerToDb(db, { name: 'Minimal Customer' })
        const customers = getCustomersFromDb(db)
        expect(customers[0].phone).toBeNull()
        expect(customers[0].email).toBeNull()
    })
})

// ============================================================
// SALES TESTS
// ============================================================
describe('Sales Service', () => {
    it('completes a sale and saves it', () => {
        const db = getTestDb()
        const productId = addProductToDb(db, {
            name: 'Widget', sku: 'W-001',
            buy_price: 10, sell_price: 20, stock: 50
        })
        const cart = [{ id: productId, name: 'Widget', sell_price: 20, buy_price: 10, quantity: 3 }]
        completeSaleInDb(db, cart, null, 'Cash', 'RCT-20260306-TEST')
        const sales = getSalesFromDb(db)
        expect(sales).toHaveLength(1)
        expect(sales[0].total).toBe(60)
    })

    it('saves sale items correctly', () => {
        const db = getTestDb()
        const productId = addProductToDb(db, {
            name: 'Widget', sku: 'W-001',
            buy_price: 10, sell_price: 20, stock: 50
        })
        const cart = [{ id: productId, name: 'Widget', sell_price: 20, buy_price: 10, quantity: 3 }]
        completeSaleInDb(db, cart, null, 'Cash', 'RCT-20260306-TEST')
        const sales = getSalesFromDb(db)
        expect(sales[0].items).toHaveLength(1)
        expect(sales[0].items[0].quantity).toBe(3)
        expect(sales[0].items[0].subtotal).toBe(60)
    })

    it('deducts stock after sale', () => {
        const db = getTestDb()
        const productId = addProductToDb(db, {
            name: 'Widget', sku: 'W-001',
            buy_price: 10, sell_price: 20, stock: 50
        })
        const cart = [{ id: productId, name: 'Widget', sell_price: 20, buy_price: 10, quantity: 5 }]
        completeSaleInDb(db, cart, null, 'Cash', 'RCT-20260306-TEST')
        const products = getProductsFromDb(db)
        expect(products[0].stock).toBe(45)
    })

    it('links sale to customer', () => {
        const db = getTestDb()
        const productId = addProductToDb(db, {
            name: 'Widget', sku: 'W-001',
            buy_price: 10, sell_price: 20, stock: 50
        })
        const customerId = addCustomerToDb(db, { name: 'John Doe' })
        const cart = [{ id: productId, name: 'Widget', sell_price: 20, buy_price: 10, quantity: 1 }]
        completeSaleInDb(db, cart, { id: customerId, name: 'John Doe' }, 'Cash', 'RCT-TEST-001')
        const sales = getSalesFromDb(db)
        expect(sales[0].customer_name).toBe('John Doe')
        expect(sales[0].customer_id).toBe(customerId)
    })

    it('uses Walk-in Customer when no customer selected', () => {
        const db = getTestDb()
        const productId = addProductToDb(db, {
            name: 'Widget', sku: 'W-001',
            buy_price: 10, sell_price: 20, stock: 50
        })
        const cart = [{ id: productId, name: 'Widget', sell_price: 20, buy_price: 10, quantity: 1 }]
        completeSaleInDb(db, cart, null, 'Cash', 'RCT-TEST-002')
        const sales = getSalesFromDb(db)
        expect(sales[0].customer_name).toBe('Walk-in Customer')
    })
    it('automatically creates an income transaction after sale', () => {
        const db = getTestDb()
        const productId = addProductToDb(db, {
            name: 'Widget', sku: 'W-001',
            buy_price: 10, sell_price: 20, stock: 50
        })
        const cart = [{ id: productId, name: 'Widget', sell_price: 20, buy_price: 10, quantity: 3 }]
        completeSaleInDb(db, cart, null, 'Cash', 'RCT-TEST-TXN')
        const transactions = getTransactionsFromDb(db)
        expect(transactions).toHaveLength(1)
        expect(transactions[0].type).toBe('income')
        expect(transactions[0].category).toBe('Sales')
        expect(transactions[0].amount).toBe(60)
    })

    it('calculates correct total for multiple items', () => {
        const db = getTestDb()
        const p1 = addProductToDb(db, { name: 'Item A', sku: 'A-001', buy_price: 10, sell_price: 20, stock: 50 })
        const p2 = addProductToDb(db, { name: 'Item B', sku: 'B-001', buy_price: 30, sell_price: 50, stock: 50 })
        const cart = [
            { id: p1, name: 'Item A', sell_price: 20, buy_price: 10, quantity: 2 },
            { id: p2, name: 'Item B', sell_price: 50, buy_price: 30, quantity: 3 },
        ]
        completeSaleInDb(db, cart, null, 'Cash', 'RCT-TEST-003')
        const sales = getSalesFromDb(db)
        expect(sales[0].total).toBe(190)
    })
})

// ============================================================
// EXPENSE TESTS
// ============================================================
describe('Expense Service', () => {
    it('adds an expense and retrieves it', () => {
        const db = getTestDb()
        addExpenseToDb(db, {
            description: 'Office Rent',
            category: 'Rent',
            amount: 500,
            date: '2026-03-01'
        })
        const expenses = getExpensesFromDb(db)
        expect(expenses).toHaveLength(1)
        expect(expenses[0].description).toBe('Office Rent')
        expect(expenses[0].amount).toBe(500)
    })

    it('automatically creates a transaction when expense is added', () => {
        const db = getTestDb()
        addExpenseToDb(db, {
            description: 'Staff Salary',
            category: 'Salary',
            amount: 1200,
            date: '2026-03-01'
        })
        const transactions = getTransactionsFromDb(db)
        expect(transactions).toHaveLength(1)
        expect(transactions[0].type).toBe('expense')
        expect(transactions[0].amount).toBe(1200)
        expect(transactions[0].category).toBe('Salary')
    })

    it('transaction description matches expense description', () => {
        const db = getTestDb()
        addExpenseToDb(db, {
            description: 'Electricity Bill',
            category: 'Utilities',
            amount: 150,
            date: '2026-03-01'
        })
        const transactions = getTransactionsFromDb(db)
        expect(transactions[0].description).toBe('Electricity Bill')
    })

    it('adds multiple expenses', () => {
        const db = getTestDb()
        addExpenseToDb(db, { description: 'Rent', category: 'Rent', amount: 500, date: '2026-03-01' })
        addExpenseToDb(db, { description: 'Salary', category: 'Salary', amount: 1000, date: '2026-03-01' })
        addExpenseToDb(db, { description: 'Utilities', category: 'Utilities', amount: 200, date: '2026-03-01' })
        const expenses = getExpensesFromDb(db)
        expect(expenses).toHaveLength(3)
    })

    it('creates one transaction per expense', () => {
        const db = getTestDb()
        addExpenseToDb(db, { description: 'Rent', category: 'Rent', amount: 500, date: '2026-03-01' })
        addExpenseToDb(db, { description: 'Salary', category: 'Salary', amount: 1000, date: '2026-03-01' })
        const transactions = getTransactionsFromDb(db)
        expect(transactions).toHaveLength(2)
    })
})