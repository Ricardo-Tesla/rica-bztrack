// Small helpers so tests read like what a shop owner does.
import { expect } from '@playwright/test'

export const OWNER = { name: 'Rica', pin: '1234' }
export const CASHIER = { name: 'Aline', pin: '5678' }

/** The input/select/textarea right after a <label> with this exact text */
export const field = (page, label) =>
  page.locator(`xpath=(//label[normalize-space()="${label}"]/following-sibling::*[self::input or self::select or self::textarea])[1]`)

/** The table row containing an element with exactly this text (e.g. a SKU or a name) */
export const row = (page, text) =>
  page.locator('tbody tr').filter({ has: page.getByText(text, { exact: true }) })

export const btn = (page, name) => page.getByRole('button', { name, exact: true })

/** The open modal window */
export const modal = page => page.locator('.fixed').last()

export async function nav(page, label) {
  await page.locator('aside nav button', { hasText: label }).click()
}

/** Run the first-start wizard. Returns the recovery code shown at the end. */
export async function setupShop(page, { vat = false, shop = 'Duka Rica' } = {}) {
  await page.goto('/')
  await btn(page, 'English').click()
  await btn(page, 'Next').click()
  await field(page, 'Shop name *').fill(shop)
  await field(page, 'TIN').fill('123456789')
  await field(page, 'Phone').fill('0788123456')
  await field(page, 'Address').fill('Kigali, Nyarugenge')
  await btn(page, 'Next').click()
  if (vat) await btn(page, 'Yes, my prices include VAT').click()
  await btn(page, 'Next').click()
  await field(page, 'Your name').fill(OWNER.name)
  await field(page, 'PIN (4–6 digits)').fill(OWNER.pin)
  await field(page, 'Repeat PIN').fill(OWNER.pin)
  await btn(page, 'Create account').click()
  await page.getByText('This is your recovery code').waitFor()
  const code = (await page.locator('body').innerText()).match(/[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/)?.[0]
  expect(code).toBeTruthy()
  await page.getByRole('checkbox').check()
  await btn(page, 'Start using Rica BizTrack').click()
  await page.getByText('Who is using the app?').waitFor()
  return code
}

export async function signIn(page, { name, pin } = OWNER) {
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).click()
  await page.locator('input[type=password]').fill(pin)
  await page.keyboard.press('Enter')
  await expect(page.locator('aside')).toBeVisible()
}

export async function lock(page) {
  await page.getByRole('button', { name: /Lock/ }).click()
  await page.getByText('Who is using the app?').waitFor()
}

export async function addProduct(page, { name, sku, barcode = '', unit = 'Piece', category = '', buy = '500', sell = '1000', stock = '10' }) {
  await nav(page, 'Products')
  await btn(page, '+ Add Product').click()
  await field(page, 'Product name *').fill(name)
  await field(page, 'SKU *').fill(sku)
  if (barcode) await field(page, 'Barcode').fill(barcode)
  if (category) await field(page, 'Category').selectOption(category)
  await field(page, 'Unit').selectOption(unit)
  await field(page, 'Buy price').fill(buy)
  await field(page, 'Sell price *').fill(sell)
  await field(page, 'Initial Stock').fill(stock)
  await btn(page, 'Save').click()
  await expect(row(page, sku)).toBeVisible()
}

export async function addCustomer(page, { name, phone = '' }) {
  await nav(page, 'Customers')
  await btn(page, '+ Add Customer').click()
  await field(page, 'Name *').fill(name)
  if (phone) await field(page, 'Phone').fill(phone)
  await btn(page, 'Save').click()
  await expect(page.getByText(name).first()).toBeVisible()
}

export async function addCashier(page, { name, pin } = CASHIER) {
  await nav(page, 'Settings')
  await btn(page, 'Users').click()
  await btn(page, '+ Add user').click()
  await field(page, 'Name').fill(name)
  await field(page, 'PIN (4–6 digits)').fill(pin)
  await field(page, 'Repeat PIN').fill(pin)
  await modal(page).getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('cell', { name })).toBeVisible()
}

/** A shop with an owner, two products and a customer, signed in as owner. */
export async function readyShop(page, options) {
  const code = await setupShop(page, options)
  await signIn(page)
  await addProduct(page, { name: 'Rice (loose)', sku: 'RICE', barcode: '600111', unit: 'Kg', category: 'Food', buy: '900', sell: '1200', stock: '50' })
  await addProduct(page, { name: 'Soap', sku: 'SOAP', buy: '500', sell: '1180', stock: '20' })
  await addCustomer(page, { name: 'Ann Uwase', phone: '0788000111' })
  return code
}

export const searchBox = page => page.getByPlaceholder('Search or scan products...')

export async function sell(page, items, { credit = null, customer = null } = {}) {
  await nav(page, 'Point of Sale')
  for (const [label, times = 1] of items) {
    for (let i = 0; i < times; i++) await page.locator('button', { hasText: label }).first().click()
  }
  if (customer) await page.locator('select').first().selectOption({ label: customer })
  if (credit !== null) {
    await btn(page, 'Credit').click()
    if (credit) await page.locator('label:text-is("Paid now (optional)") + div input').fill(String(credit))
  }
  await btn(page, '✓ Complete Sale').click()
  await page.getByText('Sale Complete!').waitFor()
  await btn(page, 'New sale').click()
}

export const dbValue = (page, sql) => page.evaluate(q => {
  const r = window.__db.exec(q)
  return r.length ? r[0].values[0][0] : null
}, sql)
