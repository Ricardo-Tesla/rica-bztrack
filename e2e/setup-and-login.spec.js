import { test, expect } from './fixtures'
import { btn, field, setupShop, signIn, lock, addCashier, dbValue, OWNER, CASHIER, row } from './helpers'

test('first start: the wizard checks each step and saves the shop', async ({ page }) => {
  await page.goto('/')
  await btn(page, 'Next').click()
  await btn(page, 'Next').click()
  await expect(page.getByText('Shop name is required')).toBeVisible()
  await field(page, 'Shop name *').fill('Duka Rica')
  await btn(page, 'Next').click()
  await btn(page, 'Yes, my prices include VAT').click()
  await btn(page, 'Next').click()
  await btn(page, 'Create account').click()
  await expect(page.getByText('Your name is required')).toBeVisible()
  await field(page, 'Your name').fill('Rica')
  await field(page, 'PIN (4–6 digits)').fill('12')
  await btn(page, 'Create account').click()
  await expect(page.getByText('PIN must be 4 to 6 digits')).toBeVisible()
  await field(page, 'PIN (4–6 digits)').fill('1234')
  await field(page, 'Repeat PIN').fill('4321')
  await btn(page, 'Create account').click()
  await expect(page.getByText('The two PINs do not match')).toBeVisible()
  await field(page, 'Repeat PIN').fill('1234')
  await btn(page, 'Create account').click()

  await expect(page.getByText('This is your recovery code')).toBeVisible()
  await expect(btn(page, 'Start using Rica BizTrack')).toBeDisabled()
  await page.getByRole('checkbox').check()
  await btn(page, 'Start using Rica BizTrack').click()
  await expect(page.getByText('Who is using the app?')).toBeVisible()

  expect(await dbValue(page, "SELECT value FROM settings WHERE key = 'business_name'")).toBe('Duka Rica')
  expect(await dbValue(page, "SELECT value FROM settings WHERE key = 'vat_enabled'")).toBe('1')
  // the PIN is never stored as plain text
  expect(await dbValue(page, "SELECT COUNT(*) FROM users WHERE pin_hash = '1234'")).toBe(0)
})

test('sign in: wrong PIN refused, right PIN accepted, keypad works', async ({ page }) => {
  await setupShop(page)
  await page.getByRole('button', { name: /^Rica/ }).click()
  for (const k of ['9', '9', '9', '9']) await btn(page, k).click()
  await btn(page, '✓').click()
  await expect(page.getByText('Wrong PIN')).toBeVisible()
  for (const k of ['1', '2', '3', '5']) await btn(page, k).click()
  await btn(page, '⌫').click()
  await btn(page, '4').click()
  await btn(page, '✓').click()
  await expect(page.getByText(/Good (morning|afternoon|evening)/)).toBeVisible()
})

test('forgot PIN: the recovery code resets the owner PIN', async ({ page }) => {
  const code = await setupShop(page)
  await btn(page, 'Owner forgot PIN?').click()
  await field(page, 'Recovery code').fill('AAAA-BBBB-CCCC')
  await field(page, 'New PIN').fill('2468')
  await field(page, 'Repeat PIN').fill('2468')
  await btn(page, 'Reset PIN').click()
  await expect(page.getByText('Wrong recovery code')).toBeVisible()

  // lower case and without dashes is accepted
  await field(page, 'Recovery code').fill(code.replace(/-/g, '').toLowerCase())
  await btn(page, 'Reset PIN').click()
  await expect(page.getByText(/PIN changed for Rica/)).toBeVisible()
  await signIn(page, { name: 'Rica', pin: '2468' })
})

test('locking returns to the sign-in screen; a deactivated cashier cannot sign in', async ({ page }) => {
  await setupShop(page)
  await signIn(page)
  await addCashier(page)
  await lock(page)
  await signIn(page, CASHIER)
  await lock(page)

  await signIn(page, OWNER)
  await page.locator('aside nav button', { hasText: 'Settings' }).click()
  await btn(page, 'Users').click()
  await row(page, 'Aline').getByRole('button', { name: 'Deactivate' }).click()
  await lock(page)
  await expect(page.getByRole('button', { name: /^Aline/ })).toHaveCount(0)
})
