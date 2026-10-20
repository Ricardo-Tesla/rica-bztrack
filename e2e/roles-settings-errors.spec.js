import { test, expect } from './fixtures'
import { btn, field, nav, readyShop, sell, signIn, lock, addCashier, dbValue, modal, CASHIER, row } from './helpers'

test.describe('cashier', () => {
  test.beforeEach(async ({ page }) => {
    await readyShop(page)
    await sell(page, [['Soap', 1]])
    await addCashier(page)
    await lock(page)
    await signIn(page, CASHIER)
  })

  test('sees only the selling pages', async ({ page }) => {
    const menu = await page.locator('aside nav').innerText()
    for (const hidden of ['Dashboard', 'Products', 'Profit & Loss', 'Settings', 'Expenses', 'Suppliers', 'Transactions']) {
      expect(menu, `cashier can see ${hidden}`).not.toContain(hidden)
    }
    for (const shown of ['Point of Sale', 'Sales History', 'Customers']) expect(menu).toContain(shown)
  })

  test('can sell and print, but cannot void, edit EBM, export or delete', async ({ page }) => {
    await sell(page, [['Soap', 1]])
    expect(await dbValue(page, "SELECT user_name FROM sales ORDER BY id DESC LIMIT 1")).toBe('Aline')
    await nav(page, 'Sales History')
    await expect(page.getByRole('button', { name: /Excel/ })).toHaveCount(0)
    await page.getByRole('button', { name: 'View' }).first().click()
    await expect(btn(page, '↩ Void Sale')).toHaveCount(0)
    await expect(field(page, 'EBM receipt number')).toHaveCount(0)
    await btn(page, '🖨️ Print').click()
    await modal(page).locator('button:has-text("✕")').click()

    await nav(page, 'Customers')
    await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0)
  })

  test('does not see buy prices or profit at the till', async ({ page }) => {
    await nav(page, 'Point of Sale')
    await expect(page.getByText(/Buy price|Profit/)).toHaveCount(0)
  })
})

test.describe('settings', () => {
  test.beforeEach(async ({ page }) => { await readyShop(page) })

  test('every tab opens; shop name is required; backups are listed', async ({ page }) => {
    await nav(page, 'Settings')
    for (const tab of ['Shop', 'Receipts & VAT', 'Backups', 'General', 'About', 'Users']) {
      await btn(page, tab).click()
    }
    await btn(page, 'Shop').click()
    await field(page, 'Shop name *').fill('')
    await btn(page, 'Save').click()
    await expect(page.getByText('Shop name is required')).toBeVisible()

    await btn(page, 'Backups').click()
    await expect(page.getByText('rica_biztrack_auto_2026-10-18.db')).toBeVisible()
    await btn(page, 'About').click()
    await expect(page.getByText('Installed version')).toBeVisible()
  })

  test('the owner cannot deactivate themself', async ({ page }) => {
    await nav(page, 'Settings')
    await btn(page, 'Users').click()
    await expect(row(page, 'Rica').getByRole('button', { name: 'Deactivate' })).toHaveCount(0)
  })

  for (const [code, label, settingsWord, posWord] of [
    ['rw', 'Kinyarwanda', 'Igenamiterere', null],
    ['fr', 'Français', 'Paramètres', 'Caisse'],
  ]) {
    test(`the whole app switches to ${label}`, async ({ page }) => {
      await nav(page, 'Settings')
      await btn(page, 'General').click()
      await page.locator('select').first().selectOption(code)
      await page.locator('button', { hasText: /^Save$/ }).first().click()
      await expect(page.getByText(settingsWord).first()).toBeVisible()
      if (posWord) await expect(page.locator('aside')).toContainText(posWord)
      // every page opens without errors in this language
      const count = await page.locator('aside nav button').count()
      for (let i = 0; i < count; i++) {
        await page.locator('aside nav button').nth(i).click()
        await expect(page.locator('main, [role=main], aside + *').first()).toBeVisible()
      }
    })
  }
})

test.describe('when something goes wrong', () => {
  test.use({ allowedErrors: [/disk I\/O error|database is locked|Failed/i] })

  test('a database failure during a sale shows a message and saves nothing', async ({ page }) => {
    await readyShop(page)
    await nav(page, 'Point of Sale')
    await page.locator('button', { hasText: 'Soap' }).first().click()
    await page.evaluate(() => { window.__failNext = { cmd: 'db_transaction', error: 'disk I/O error' } })
    await btn(page, '✓ Complete Sale').click()
    await expect(page.locator('body')).toContainText(/disk I\/O error|could not|failed/i)
    expect(await dbValue(page, 'SELECT COUNT(*) FROM sales')).toBe(0)
    // the cart is kept, so the cashier can simply try again
    await btn(page, '✓ Complete Sale').click()
    await expect(page.getByText('Sale Complete!')).toBeVisible()
  })

  test('answering "No" to a confirmation changes nothing', async ({ page }) => {
    await readyShop(page)
    await page.evaluate(() => { window.__askAnswer = false })
    await nav(page, 'Products')
    await row(page, 'SOAP').getByRole('button', { name: 'Delete' }).click()
    await expect(row(page, 'SOAP')).toBeVisible()
    expect(await dbValue(page, "SELECT archived FROM products WHERE sku = 'SOAP'")).toBe(0)
  })
})
