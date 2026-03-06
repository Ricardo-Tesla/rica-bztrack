import { describe, it, expect } from 'vitest'
import {
    calculateMargin,
    calculateMarkup,
    calculateProfitPerUnit,
    calculateCartTotal,
    calculateNetProfit,
    calculateGrossProfit,
    formatCurrency,
    formatDate,
    generateReceiptNumber,
    getStockStatus,
    validateProduct,
    validateSale,
} from '../../utils/calculations'

// ============================================================
// MARGIN TESTS
// ============================================================
describe('calculateMargin', () => {
    it('calculates correct margin', () => {
        expect(calculateMargin(1000, 1200)).toBe(16.7)
    })

    it('returns 50% margin for double the buy price', () => {
        expect(calculateMargin(50, 100)).toBe(50)
    })

    it('returns 0 when sell price is 0', () => {
        expect(calculateMargin(100, 0)).toBe(0)
    })

    it('returns 0 when buy price is 0', () => {
        expect(calculateMargin(0, 100)).toBe(0)
    })

    it('returns 0 when both prices are 0', () => {
        expect(calculateMargin(0, 0)).toBe(0)
    })

    it('handles null inputs', () => {
        expect(calculateMargin(null, null)).toBe(0)
    })
})

// ============================================================
// MARKUP TESTS
// ============================================================
describe('calculateMarkup', () => {
    it('calculates correct markup', () => {
        expect(calculateMarkup(1000, 1200)).toBe(20)
    })

    it('returns 100% markup when sell is double buy', () => {
        expect(calculateMarkup(50, 100)).toBe(100)
    })

    it('returns 0 when buy price is 0', () => {
        expect(calculateMarkup(0, 100)).toBe(0)
    })
})

// ============================================================
// PROFIT PER UNIT TESTS
// ============================================================
describe('calculateProfitPerUnit', () => {
    it('calculates correct profit per unit', () => {
        expect(calculateProfitPerUnit(1000, 1200)).toBe(200)
    })

    it('returns negative profit when sell is less than buy', () => {
        expect(calculateProfitPerUnit(100, 80)).toBe(-20)
    })

    it('returns 0 when prices are equal', () => {
        expect(calculateProfitPerUnit(100, 100)).toBe(0)
    })
})

// ============================================================
// CART TOTAL TESTS
// ============================================================
describe('calculateCartTotal', () => {
    it('calculates correct cart total', () => {
        const cart = [
            { sell_price: 100, quantity: 2 },
            { sell_price: 50, quantity: 3 },
        ]
        expect(calculateCartTotal(cart)).toBe(350)
    })

    it('returns 0 for empty cart', () => {
        expect(calculateCartTotal([])).toBe(0)
    })

    it('returns 0 for null cart', () => {
        expect(calculateCartTotal(null)).toBe(0)
    })

    it('handles single item cart', () => {
        const cart = [{ sell_price: 25.50, quantity: 4 }]
        expect(calculateCartTotal(cart)).toBe(102)
    })
})

// ============================================================
// NET PROFIT TESTS
// ============================================================
describe('calculateNetProfit', () => {
    it('calculates correct net profit', () => {
        expect(calculateNetProfit(10000, 6000, 2000)).toBe(2000)
    })

    it('returns negative when expenses exceed gross profit', () => {
        expect(calculateNetProfit(1000, 800, 500)).toBe(-300)
    })

    it('returns 0 when revenue equals cogs plus expenses', () => {
        expect(calculateNetProfit(1000, 600, 400)).toBe(0)
    })
})

// ============================================================
// GROSS PROFIT TESTS
// ============================================================
describe('calculateGrossProfit', () => {
    it('calculates correct gross profit', () => {
        expect(calculateGrossProfit(10000, 6000)).toBe(4000)
    })

    it('returns negative when cogs exceed revenue', () => {
        expect(calculateGrossProfit(1000, 1500)).toBe(-500)
    })
})

// ============================================================
// FORMAT CURRENCY TESTS
// ============================================================
describe('formatCurrency', () => {
    it('formats whole number correctly', () => {
        expect(formatCurrency(1000)).toBe('$1000.00')
    })

    it('formats decimal correctly', () => {
        expect(formatCurrency(99.5)).toBe('$99.50')
    })

    it('handles 0', () => {
        expect(formatCurrency(0)).toBe('$0.00')
    })

    it('handles null', () => {
        expect(formatCurrency(null)).toBe('$0.00')
    })

    it('handles undefined', () => {
        expect(formatCurrency(undefined)).toBe('$0.00')
    })
})

// ============================================================
// FORMAT DATE TESTS
// ============================================================
describe('formatDate', () => {
    it('returns dash for null', () => {
        expect(formatDate(null)).toBe('—')
    })

    it('returns dash for empty string', () => {
        expect(formatDate('')).toBe('—')
    })

    it('formats a valid date string', () => {
        const result = formatDate('2025-01-15')
        expect(result).toContain('Jan')
        expect(result).toContain('2025')
    })
})

// ============================================================
// RECEIPT NUMBER TESTS
// ============================================================
describe('generateReceiptNumber', () => {
    it('starts with RCT-', () => {
        expect(generateReceiptNumber()).toMatch(/^RCT-/)
    })

    it('generates unique receipt numbers', () => {
        const r1 = generateReceiptNumber()
        const r2 = generateReceiptNumber()
        expect(r1).not.toBe(r2)
    })

    it('has correct format RCT-YYYYMMDD-XXXX', () => {
        expect(generateReceiptNumber()).toMatch(/^RCT-\d{8}-[A-Z0-9]{4}$/)
    })
})

// ============================================================
// STOCK STATUS TESTS
// ============================================================
describe('getStockStatus', () => {
    it('returns out when stock is 0', () => {
        expect(getStockStatus(0, 5)).toBe('out')
    })

    it('returns out when stock is negative', () => {
        expect(getStockStatus(-1, 5)).toBe('out')
    })

    it('returns low when stock equals alert level', () => {
        expect(getStockStatus(5, 5)).toBe('low')
    })

    it('returns low when stock is below alert level', () => {
        expect(getStockStatus(3, 5)).toBe('low')
    })

    it('returns in-stock when stock is above alert level', () => {
        expect(getStockStatus(10, 5)).toBe('in-stock')
    })
})

// ============================================================
// VALIDATE PRODUCT TESTS
// ============================================================
describe('validateProduct', () => {
    it('returns no errors for valid product', () => {
        const form = { name: 'Test Product', sku: 'TP-001', sell_price: 100, buy_price: 60 }
        expect(validateProduct(form)).toHaveLength(0)
    })

    it('returns error when name is missing', () => {
        const form = { name: '', sku: 'TP-001', sell_price: 100, buy_price: 60 }
        expect(validateProduct(form)).toContain('Product name is required')
    })

    it('returns error when sku is missing', () => {
        const form = { name: 'Test', sku: '', sell_price: 100, buy_price: 60 }
        expect(validateProduct(form)).toContain('SKU is required')
    })

    it('returns error when sell price is 0', () => {
        const form = { name: 'Test', sku: 'TP-001', sell_price: 0, buy_price: 0 }
        expect(validateProduct(form)).toContain('Valid sell price is required')
    })

    it('returns error when sell price is less than buy price', () => {
        const form = { name: 'Test', sku: 'TP-001', sell_price: 50, buy_price: 100 }
        expect(validateProduct(form)).toContain('Sell price cannot be less than buy price')
    })

    it('returns multiple errors for empty form', () => {
        const form = { name: '', sku: '', sell_price: 0, buy_price: 0 }
        expect(validateProduct(form).length).toBeGreaterThan(1)
    })
})

// ============================================================
// VALIDATE SALE TESTS
// ============================================================
describe('validateSale', () => {
    it('returns no errors for valid cart', () => {
        const cart = [{ name: 'Product A', quantity: 2, stock: 10 }]
        expect(validateSale(cart)).toHaveLength(0)
    })

    it('returns error for empty cart', () => {
        expect(validateSale([])).toContain('Cart is empty')
    })

    it('returns error when quantity exceeds stock', () => {
        const cart = [{ name: 'Product A', quantity: 15, stock: 10 }]
        expect(validateSale(cart)).toContain('Product A exceeds available stock')
    })

    it('returns error when quantity is 0', () => {
        const cart = [{ name: 'Product A', quantity: 0, stock: 10 }]
        expect(validateSale(cart)).toContain('Product A has invalid quantity')
    })
})