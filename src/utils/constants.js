// Lists used on several pages — change them here once.

export const PAYMENT_METHODS = ['Cash', 'Card', 'Mobile Money', 'Bank Transfer']

// At the till, a sale can also be on credit (the customer pays later)
export const CREDIT = 'Credit'
export const SALE_PAYMENT_METHODS = [...PAYMENT_METHODS, CREDIT]

// Methods where a transaction / reference number is useful
export const METHODS_WITH_REFERENCE = ['Mobile Money', 'Card', 'Bank Transfer']

export const PRODUCT_CATEGORIES = ['Electronics', 'Clothing', 'Food', 'Hardware', 'Furniture', 'Other']

export const PRODUCT_UNITS = ['Piece', 'Kg', 'Litre', 'Metre', 'Box', 'Pack', 'Dozen']

// Units that can be sold in parts (e.g. 1.5 kg)
export const DECIMAL_UNITS = ['Kg', 'Litre', 'Metre']
export const allowsDecimal = productOrUnit =>
  DECIMAL_UNITS.includes(typeof productOrUnit === 'string' ? productOrUnit : productOrUnit?.unit)

// Categories offered when adding an expense.
// "Stock Purchase" is intentionally not here: buying stock is recorded with
// Products → Restock, and its cost is counted as COGS when the items sell.
// Adding it here as well would count the same money twice.
export const EXPENSE_CATEGORIES = [
  'Rent', 'Salary', 'Utilities', 'Marketing',
  'Transport', 'Maintenance', 'Other',
]

export const TRANSACTION_CATEGORIES = [
  'Sales', 'Rent', 'Salary', 'Utilities', 'Marketing',
  'Transport', 'Stock Purchase', 'Maintenance', 'Other',
]
