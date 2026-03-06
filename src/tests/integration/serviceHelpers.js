// These are pure service functions that accept a db instance
// This allows us to inject a test database during testing

// ── SUPPLIER HELPERS ─────────────────────────────
export function addSupplierToDb(db, supplier) {
    const stmt = db.prepare(`
    INSERT INTO suppliers (name, contact, phone, email, address, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
    const result = stmt.run(
        supplier.name,
        supplier.contact || null,
        supplier.phone || null,
        supplier.email || null,
        supplier.address || null,
        supplier.notes || null
    )
    return result.lastInsertRowid
}

export function getSuppliersFromDb(db) {
    return db.prepare('SELECT * FROM suppliers ORDER BY name ASC').all()
}

export function deleteSupplierFromDb(db, id) {
    db.prepare('DELETE FROM suppliers WHERE id = ?').run(id)
}

// ── PRODUCT HELPERS ──────────────────────────────
export function addProductToDb(db, product) {
    const stmt = db.prepare(`
    INSERT INTO products
    (name, sku, category, unit, buy_price, sell_price, stock, low_stock_alert, supplier_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    const result = stmt.run(
        product.name,
        product.sku,
        product.category || null,
        product.unit || null,
        parseFloat(product.buy_price) || 0,
        parseFloat(product.sell_price) || 0,
        parseInt(product.stock) || 0,
        parseInt(product.low_stock_alert) || 5,
        product.supplier_id || null
    )
    return result.lastInsertRowid
}

export function getProductsFromDb(db) {
    return db.prepare('SELECT * FROM products ORDER BY name ASC').all()
}

export function updateProductStockInDb(db, id, quantity) {
    db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(quantity, id)
}

export function deleteProductFromDb(db, id) {
    db.prepare('DELETE FROM products WHERE id = ?').run(id)
}

// ── CUSTOMER HELPERS ─────────────────────────────
export function addCustomerToDb(db, customer) {
    const stmt = db.prepare(`
    INSERT INTO customers (name, phone, email, address)
    VALUES (?, ?, ?, ?)
  `)
    const result = stmt.run(
        customer.name,
        customer.phone || null,
        customer.email || null,
        customer.address || null
    )
    return result.lastInsertRowid
}

export function getCustomersFromDb(db) {
    return db.prepare('SELECT * FROM customers ORDER BY name ASC').all()
}

// ── SALES HELPERS ────────────────────────────────
export function completeSaleInDb(db, cart, customer, paymentMethod, receiptNumber) {
    const subtotal = cart.reduce((a, item) => a + item.sell_price * item.quantity, 0)
    const customerName = customer ? customer.name : 'Walk-in Customer'
    const customerId = customer ? customer.id : null

    const saleStmt = db.prepare(`
    INSERT INTO sales
    (receipt_number, customer_id, customer_name, subtotal, tax, discount, total, payment_method)
    VALUES (?, ?, ?, ?, 0, 0, ?, ?)
  `)
    const saleResult = saleStmt.run(
        receiptNumber, customerId, customerName, subtotal, subtotal, paymentMethod
    )
    const saleId = saleResult.lastInsertRowid

    const itemStmt = db.prepare(`
    INSERT INTO sale_items
    (sale_id, product_id, product_name, quantity, unit_price, buy_price, subtotal)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)

    for (const item of cart) {
        itemStmt.run(
            saleId, item.id, item.name,
            item.quantity, item.sell_price,
            item.buy_price, item.sell_price * item.quantity
        )
        updateProductStockInDb(db, item.id, item.quantity)
    }

    // Auto log income transaction
    db.prepare(`
    INSERT INTO transactions
    (description, type, category, amount, payment_method, reference_id, date)
    VALUES (?, 'income', 'Sales', ?, ?, ?, DATE('now'))
  `).run(
        `Sale #${receiptNumber} — ${customerName}`,
        subtotal,
        paymentMethod,
        saleId
    )

    return { saleId, receiptNumber, total: subtotal, customerName }
}

export function getSalesFromDb(db) {
    const sales = db.prepare('SELECT * FROM sales ORDER BY created_at DESC').all()
    for (const sale of sales) {
        sale.items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(sale.id)
    }
    return sales
}

// ── EXPENSE HELPERS ──────────────────────────────
export function addExpenseToDb(db, expense) {
    const expStmt = db.prepare(`
    INSERT INTO expenses (description, category, amount, date)
    VALUES (?, ?, ?, ?)
  `)
    const result = expStmt.run(
        expense.description,
        expense.category,
        parseFloat(expense.amount),
        expense.date
    )

    // Auto create transaction
    db.prepare(`
    INSERT INTO transactions (description, type, category, amount, payment_method, reference_id, date)
    VALUES (?, 'expense', ?, ?, ?, ?, ?)
  `).run(
        expense.description,
        expense.category,
        parseFloat(expense.amount),
        expense.payment_method || 'Cash',
        result.lastInsertRowid,
        expense.date
    )

    return result.lastInsertRowid
}

export function getExpensesFromDb(db) {
    return db.prepare('SELECT * FROM expenses ORDER BY date DESC').all()
}

export function getTransactionsFromDb(db) {
    return db.prepare('SELECT * FROM transactions ORDER BY created_at DESC').all()
}