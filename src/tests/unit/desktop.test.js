// Code that talks to the desktop (Tauri): backups, restore, updates, dialogs,
// printing, saving files and logging. The desktop side is simulated.
import { describe, it, expect, beforeEach, vi } from 'vitest'

const invoke = vi.fn()
const dialog = { save: vi.fn(), open: vi.fn(), ask: vi.fn() }
const fs = { writeTextFile: vi.fn(), writeFile: vi.fn() }
const updater = { check: vi.fn() }
const processPlugin = { relaunch: vi.fn() }
const logPlugin = { error: vi.fn(), info: vi.fn() }

vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a) => invoke(...a) }))
vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: (...a) => dialog.save(...a), open: (...a) => dialog.open(...a), ask: (...a) => dialog.ask(...a),
}))
vi.mock('@tauri-apps/plugin-fs', () => ({
  writeTextFile: (...a) => fs.writeTextFile(...a), writeFile: (...a) => fs.writeFile(...a),
}))
vi.mock('@tauri-apps/plugin-updater', () => ({ check: (...a) => updater.check(...a) }))
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: (...a) => processPlugin.relaunch(...a) }))
vi.mock('@tauri-apps/plugin-log', () => ({ error: (...a) => logPlugin.error(...a), info: (...a) => logPlugin.info(...a) }))

import {
  backupDatabase, restoreDatabase, runAutoBackup, listAutoBackups,
  getDefaultBackupFolder, chooseBackupFolder, getLogFolder,
} from '../../services/backupService'
import { checkForUpdate, installUpdate } from '../../services/updateService'
import { confirmDialog } from '../../utils/dialogs'
import { errorText, errorWithVars } from '../../utils/errors'
import { logError, logInfo, installGlobalErrorLogging } from '../../utils/logger'
import { printReceipt, downloadReceipt, generateReceipt } from '../../utils/receiptPrinter'
import { saveXlsx } from '../../utils/excel'
import { translate, setCurrentLanguage, getCurrentLanguage, tn, t } from '../../i18n'
import { todayLocal } from '../../utils/format'

beforeEach(() => {
  vi.clearAllMocks()
  setCurrentLanguage('en')
})

describe('Manual backup', () => {
  it('saves a copy where the owner chooses', async () => {
    dialog.save.mockResolvedValue('D:\\backup.db')
    invoke.mockResolvedValue('D:\\backup.db')
    expect(await backupDatabase()).toEqual({ success: true, path: 'D:\\backup.db' })
    expect(dialog.save.mock.calls[0][0].defaultPath).toBe(`rica_biztrack_backup_${todayLocal()}.db`)
    expect(invoke).toHaveBeenCalledWith('backup_database', { destination: 'D:\\backup.db' })
  })

  it('does nothing when the save window is closed', async () => {
    dialog.save.mockResolvedValue(null)
    expect(await backupDatabase()).toEqual({ success: false, cancelled: true })
    expect(invoke).not.toHaveBeenCalled()
  })

  it('reports a failure instead of crashing', async () => {
    dialog.save.mockResolvedValue('D:\\x.db')
    invoke.mockRejectedValue('Backup failed: disk full')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await backupDatabase()).toEqual({ success: false, error: 'Backup failed: disk full' })
  })
})

describe('Restore', () => {
  it('asks for confirmation, then restores the chosen file', async () => {
    dialog.open.mockResolvedValue('E:\\old.db')
    dialog.ask.mockResolvedValue(true)
    invoke.mockResolvedValue(undefined)
    expect(await restoreDatabase(null, 'E:\\')).toEqual({ success: true })
    expect(dialog.open.mock.calls[0][0].defaultPath).toBe('E:\\')
    expect(dialog.ask.mock.calls[0][1].kind).toBe('warning')
    expect(invoke).toHaveBeenCalledWith('restore_database', { source: 'E:\\old.db' })
  })

  it('a backup picked from the list skips the file window', async () => {
    dialog.ask.mockResolvedValue(true)
    await restoreDatabase('C:\\auto.db')
    expect(dialog.open).not.toHaveBeenCalled()
    expect(invoke).toHaveBeenCalledWith('restore_database', { source: 'C:\\auto.db' })
  })

  it('stops if no file is chosen, or the owner says no', async () => {
    dialog.open.mockResolvedValue(null)
    expect(await restoreDatabase()).toEqual({ success: false, cancelled: true })
    dialog.open.mockResolvedValue('E:\\old.db')
    dialog.ask.mockResolvedValue(false)
    expect(await restoreDatabase()).toEqual({ success: false, cancelled: true })
    expect(invoke).not.toHaveBeenCalled()
  })

  it('shows why a restore failed', async () => {
    dialog.ask.mockResolvedValue(true)
    invoke.mockRejectedValue('This file is not a valid Rica BizTrack backup.')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await restoreDatabase('C:\\photo.jpg')).toEqual({ success: false, error: 'This file is not a valid Rica BizTrack backup.' })
  })

  it('the confirmation is in the app language', async () => {
    setCurrentLanguage('fr')
    dialog.ask.mockResolvedValue(false)
    await restoreDatabase('C:\\a.db')
    expect(dialog.ask.mock.calls[0][0]).toContain('Cela remplacera TOUTES')
    expect(dialog.ask.mock.calls[0][1].okLabel).toBe('Restaurer')
  })
})

describe('Automatic backups', () => {
  it('sends the folder, today\'s date and how many to keep', async () => {
    invoke.mockResolvedValue('path')
    await runAutoBackup({ backup_folder: 'F:\\USB', backup_keep: '14' })
    expect(invoke).toHaveBeenCalledWith('auto_backup', { folder: 'F:\\USB', date: todayLocal(), keep: 14 })
  })

  it('uses the default folder and keeps at least one backup', async () => {
    invoke.mockResolvedValue('path')
    await runAutoBackup({ backup_folder: '', backup_keep: '0' })
    expect(invoke).toHaveBeenLastCalledWith('auto_backup', { folder: null, date: todayLocal(), keep: 30 })
    await runAutoBackup({ backup_folder: '', backup_keep: '-3' })
    expect(invoke.mock.lastCall[1].keep).toBe(1)
  })

  it('lists backups, finds the default and log folders, lets the owner pick a folder', async () => {
    invoke.mockResolvedValueOnce([{ name: 'a.db' }]).mockResolvedValueOnce('C:\\Docs').mockResolvedValueOnce('C:\\logs')
    expect(await listAutoBackups('')).toEqual([{ name: 'a.db' }])
    expect(invoke).toHaveBeenCalledWith('list_auto_backups', { folder: null })
    expect(await getDefaultBackupFolder()).toBe('C:\\Docs')
    expect(await getLogFolder()).toBe('C:\\logs')
    dialog.open.mockResolvedValue('G:\\')
    expect(await chooseBackupFolder()).toBe('G:\\')
    expect(dialog.open).toHaveBeenCalledWith({ directory: true, multiple: false })
  })
})

describe('Updates', () => {
  it('returns null when there is no new version', async () => {
    updater.check.mockResolvedValue(null)
    expect(await checkForUpdate()).toBe(null)
  })

  it('downloads with progress, then restarts', async () => {
    const progress = []
    const update = {
      version: '1.1.0',
      downloadAndInstall: async cb => {
        cb({ event: 'Started', data: { contentLength: 1000 } })
        cb({ event: 'Progress', data: { chunkLength: 250 } })
        cb({ event: 'Progress', data: { chunkLength: 750 } })
        cb({ event: 'Finished' })
      },
    }
    updater.check.mockResolvedValue(update)
    expect(await checkForUpdate()).toBe(update)
    await installUpdate(update, p => progress.push(p))
    expect(progress).toEqual([25, 100])
    expect(processPlugin.relaunch).toHaveBeenCalled()
  })

  it('a failed download does not restart the app', async () => {
    const update = { downloadAndInstall: async () => { throw new Error('signature mismatch') } }
    await expect(installUpdate(update)).rejects.toThrow('signature')
    expect(processPlugin.relaunch).not.toHaveBeenCalled()
  })
})

describe('Dialogs, errors and logging', () => {
  it('asks with the app dialog, falls back to the browser outside the app', async () => {
    dialog.ask.mockResolvedValue(true)
    expect(await confirmDialog('Delete?', { okLabel: 'Delete', danger: true })).toBe(true)
    expect(dialog.ask).toHaveBeenCalledWith('Delete?', { title: 'Rica BizTrack', kind: 'warning', okLabel: 'Delete', cancelLabel: 'Cancel' })
    dialog.ask.mockRejectedValue(new Error('not in Tauri'))
    window.confirm = vi.fn(() => false)
    expect(await confirmDialog('Delete?')).toBe(false)
  })

  it('turns any error into translated text', () => {
    setCurrentLanguage('fr')
    const tr = (s, v) => translate('fr', s, v)
    expect(errorText(tr, 'Wrong PIN')).toBe('PIN incorrect')
    expect(errorText(tr, new Error('Cart is empty'))).toBe('Le panier est vide')
    expect(errorText(tr, errorWithVars('Too many wrong PINs. Try again in {secs} seconds.', { secs: 12 }))).toBe('Trop de PIN incorrects. Réessayez dans 12 secondes.')
    expect(errorText(tr, null)).toBe('')
    expect(errorText(tr, { toString: () => 'odd' })).toBe('odd')
  })

  it('writes errors to the log file and the console', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    await logError('Sale failed', new Error('boom'))
    expect(logPlugin.error.mock.calls[0][0]).toMatch(/^Sale failed — boom/)
    expect(consoleError).toHaveBeenCalled()
    await logInfo('Backup saved')
    expect(logPlugin.info).toHaveBeenCalledWith('Backup saved')
    await logError('Plain')
    expect(logPlugin.error).toHaveBeenLastCalledWith('Plain')
  })

  it('logging never crashes the app, even if the log plugin fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    logPlugin.error.mockRejectedValue(new Error('log broken'))
    await expect(logError('x')).resolves.toBeUndefined()
  })

  it('catches errors that happen outside React', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const added = []
    vi.spyOn(window, 'addEventListener').mockImplementation((type, fn) => added.push([type, fn]))
    installGlobalErrorLogging()
    expect(added.map(a => a[0])).toEqual(['error', 'unhandledrejection'])
    added[1][1]({ reason: 'lost promise' })
    await new Promise(r => setTimeout(r, 0))
    expect(logPlugin.error.mock.lastCall[0]).toContain('Unhandled promise rejection — lost promise')
  })
})

describe('Printing and saving receipts', () => {
  const sale = {
    receipt_number: 'RCT-1', created_at: '2026-10-19 10:00:00', customer_name: 'Walk-in Customer',
    payment_method: 'Cash', total: 1000, subtotal: 1000, items: [{ product_name: 'Soap', quantity: 1, unit_price: 1000, subtotal: 1000 }],
  }

  it('prints on 80 mm by default and 58 mm when chosen', () => {
    window.print = vi.fn()
    printReceipt(sale, { business_name: 'Duka' })
    expect(document.getElementById('print-root').innerHTML).toContain('Duka')
    expect(document.getElementById('print-page-style').textContent).toContain('80mm')
    printReceipt(sale, { business_name: 'Duka', paper_width: '58' })
    expect(document.getElementById('print-page-style').textContent).toContain('58mm')
    expect(document.querySelectorAll('#print-root').length).toBe(1) // reused, not duplicated
    expect(window.print).toHaveBeenCalledTimes(2)
  })

  it('saves a text receipt, narrower for 58 mm paper', async () => {
    dialog.save.mockResolvedValue('C:\\r.txt')
    await downloadReceipt(sale, { paper_width: '58' })
    const text = fs.writeTextFile.mock.calls[0][1]
    expect(fs.writeTextFile.mock.calls[0][0]).toBe('C:\\r.txt')
    expect(Math.max(...text.split('\n').map(l => l.length))).toBeLessThanOrEqual(32)
    dialog.save.mockResolvedValue(null)
    await downloadReceipt(sale, {})
    expect(fs.writeTextFile).toHaveBeenCalledTimes(1)
  })

  it('a failed save does not crash', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    dialog.save.mockResolvedValue('C:\\r.txt')
    fs.writeTextFile.mockRejectedValue(new Error('denied'))
    await expect(downloadReceipt(sale, {})).resolves.toBeUndefined()
  })

  it('the old text helper still works', () => {
    expect(generateReceipt(sale)).toContain('RCT-1')
  })

  it('receipts follow the app language', () => {
    setCurrentLanguage('rw')
    expect(generateReceipt(sale)).toContain('Umukiriya usanzwe')
    expect(generateReceipt(sale)).toContain('IGITERANYO')
  })
})

describe('Excel export', () => {
  it('writes the file where chosen, or nothing if cancelled', async () => {
    dialog.save.mockResolvedValue('C:\\sales.xlsx')
    const path = await saveXlsx('sales.xlsx', [{ name: 'S', columns: [{ header: 'A', key: 'a' }], rows: [{ a: 1 }] }])
    expect(path).toBe('C:\\sales.xlsx')
    expect(fs.writeFile.mock.calls[0][1]).toBeInstanceOf(Uint8Array)
    dialog.save.mockResolvedValue(null)
    expect(await saveXlsx('x.xlsx', [])).toBe(null)
    expect(fs.writeFile).toHaveBeenCalledTimes(1)
  })
})

describe('Language helpers', () => {
  it('unknown languages fall back to English', () => {
    setCurrentLanguage('de')
    expect(getCurrentLanguage()).toBe('en')
    expect(t('Save')).toBe('Save')
    setCurrentLanguage('rw')
    expect(t('Save')).toBe('Bika')
  })

  it('picks singular or plural', () => {
    const tr = (s, v) => translate('fr', s, v)
    expect(tn(tr, 1, '{n} sale', '{n} sales')).toBe('1 vente')
    expect(tn(tr, 3, '{n} sale', '{n} sales')).toBe('3 ventes')
    expect(tn(tr, 0, '{n} sale', '{n} sales')).toBe('0 ventes')
  })

  it('fills the same placeholder several times', () => {
    expect(translate('en', '{a} and {a}', { a: 'x' })).toBe('x and x')
  })
})
