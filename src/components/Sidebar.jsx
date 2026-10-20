import { useState } from 'react'
import { backupDatabase } from '../services/backupService'
import { useApp } from '../context/AppContext'
import { errorText } from '../utils/errors'

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'pos', label: 'Point of Sale', icon: '🛒', group: 'Sales' },
  { id: 'sales', label: 'Sales History', icon: '💳', group: 'Sales' },
  { id: 'products', label: 'Products', icon: '📦', group: 'Inventory' },
  { id: 'suppliers', label: 'Suppliers', icon: '🏭', group: 'Inventory' },
  { id: 'customers', label: 'Customers', icon: '👥', group: 'People' },
  { id: 'transactions', label: 'Transactions', icon: '🔄', group: 'Finance' },
  { id: 'expenses', label: 'Expenses', icon: '💸', group: 'Finance' },
  { id: 'profit', label: 'Profit & Loss', icon: '📈', group: 'Finance' },
  { id: 'settings', label: 'Settings', icon: '⚙️', group: 'System' },
]

const groups = ['', 'Sales', 'Inventory', 'People', 'Finance', 'System']

export default function Sidebar({ activePage, onNavigate }) {
  const { t, user, settings, signOut, can, canSeePage } = useApp()
  const [backing, setBacking] = useState(false)
  const [backupStatus, setBackupStatus] = useState(null)

  async function handleBackup() {
    try {
      setBacking(true)
      setBackupStatus(null)
      const result = await backupDatabase()
      if (result.success) {
        setBackupStatus({ type: 'success', message: t('Backup saved!') })
      } else if (!result.cancelled) {
        setBackupStatus({ type: 'error', message: errorText(t, result.error) || t('Backup failed') })
      }
    } finally {
      setBacking(false)
      setTimeout(() => setBackupStatus(null), 5000)
    }
  }

  const visible = navItems.filter(item => canSeePage(item.id))

  return (
    <aside className="w-60 bg-gray-900 border-r border-gray-800 flex flex-col h-screen flex-shrink-0">

      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-800">
        <div className="text-xl font-bold">
          <span className="text-yellow-400">Rica</span>
          <span className="text-white"> BizTrack</span>
        </div>
        <div className="text-xs text-gray-500 mt-0.5 truncate" title={settings?.business_name}>
          {settings?.business_name || t('Business Management')}
        </div>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {groups.map(group => {
          const items = visible.filter(item => (item.group || '') === group)
          if (!items.length) return null
          return (
            <div key={group || 'main'} className="mb-4">
              {group && (
                <div className="text-xs text-gray-600 uppercase tracking-widest px-3 mb-2 font-semibold">
                  {t(group)}
                </div>
              )}
              {items.map(item => (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition mb-0.5
                    ${activePage === item.id
                      ? 'bg-yellow-400 text-black'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                    }`}
                >
                  <span>{item.icon}</span>
                  <span className="text-left leading-tight">{t(item.label)}</span>
                </button>
              ))}
            </div>
          )
        })}
      </nav>

      {/* Bottom */}
      <div className="px-4 py-4 border-t border-gray-800">

        {backupStatus && (
          <div className={`text-xs px-3 py-2 rounded-lg mb-3 text-center font-medium
            ${backupStatus.type === 'success'
              ? 'bg-green-950 text-green-400 border border-green-800'
              : 'bg-red-950 text-red-400 border border-red-800'
            }`}>
            {backupStatus.type === 'success' ? '✅' : '❌'} {backupStatus.message}
          </div>
        )}

        {can('backup_restore') && (
          <button
            onClick={handleBackup}
            disabled={backing}
            className="w-full flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white px-3 py-2.5 rounded-lg text-xs font-medium transition mb-3"
          >
            {backing ? <><span className="animate-pulse">⏳</span> {t('Backing up...')}</> : <><span>💾</span> {t('Backup Data')}</>}
          </button>
        )}

        {/* Signed-in user */}
        <div className="flex items-center justify-between bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 mb-3">
          <div className="min-w-0">
            <div className="text-xs text-white font-semibold truncate">{user?.name}</div>
            <div className="text-xs text-gray-500">{user?.role === 'owner' ? t('Owner') : t('Cashier')}</div>
          </div>
          <button
            onClick={signOut}
            title={t('Lock')}
            className="text-xs text-gray-400 hover:text-yellow-400 border border-gray-700 hover:border-yellow-600 rounded-md px-2 py-1 transition"
          >
            🔒 {t('Lock')}
          </button>
        </div>

        <div className="text-xs text-gray-600">Rica BizTrack</div>
        <div className="text-xs text-gray-700 mt-0.5">© {new Date().getFullYear()} Ricardo Tesla</div>
      </div>
    </aside>
  )
}
