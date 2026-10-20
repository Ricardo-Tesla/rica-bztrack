// Shared setup for every end-to-end test:
// - each test gets a fresh, empty simulated database
// - any JavaScript error or console error in the app fails the test
import { test as base, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
// fileURLToPath works on Windows too (drive letters, spaces in folder names)
const root = fileURLToPath(new URL('..', import.meta.url))

const rust = readFileSync(join(root, 'src-tauri', 'src', 'database.rs'), 'utf8')
const migrations = [...rust.matchAll(/sql:\s*"([\s\S]*?)",\s*kind:/g)].map(m => m[1])
if (migrations.length < 11) throw new Error('Could not read the migrations from database.rs')

const initScript = readFileSync(require.resolve('sql.js/dist/sql-asm.js'), 'utf8')
  + `\nwindow.__MIGRATIONS__ = ${JSON.stringify(migrations)};\nvar __MIGRATIONS__ = window.__MIGRATIONS__;\n`
  + readFileSync(join(root, 'e2e', 'mock-tauri.js'), 'utf8')

export const test = base.extend({
  // Errors the test expects (e.g. a simulated disk failure) can be allowed with
  // test.use({ allowedErrors: [/disk I\/O/] })
  allowedErrors: [[], { option: true }],

  page: async ({ page, allowedErrors }, use) => {
    const problems = []
    page.on('pageerror', e => problems.push(`page error: ${e.message}`))
    page.on('console', m => {
      if (m.type() === 'error' && !allowedErrors.some(re => re.test(m.text()))) problems.push(`console: ${m.text()}`)
    })
    await page.addInitScript(initScript)
    await use(page)
    expect(problems, 'the app logged errors').toEqual([])
  },
})

export { expect }
