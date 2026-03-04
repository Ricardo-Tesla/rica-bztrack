const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'pos', label: 'Point of Sale', icon: '🛒', group: 'Sales' },
  { id: 'sales', label: 'Sales History', icon: '💳' },
  { id: 'products', label: 'Products', icon: '📦', group: 'Inventory' },
  { id: 'suppliers', label: 'Suppliers', icon: '🏭' },
  { id: 'customers', label: 'Customers', icon: '👥', group: 'People' },
  { id: 'transactions', label: 'Transactions', icon: '🔄', group: 'Finance' },
  { id: 'expenses', label: 'Expenses', icon: '💸' },
  { id: 'profit', label: 'Profit & Loss', icon: '📈' },
]

export default function Sidebar({ activePage, onNavigate }) {
  const groups = ['', 'Sales', 'Inventory', 'People', 'Finance']

  return (
    <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col h-screen flex-shrink-0">

      {/* Logo */}
      <div className="px-5 py-6 border-b border-gray-800">
        <div className="text-xl font-bold">
          <span className="text-yellow-400">Rica</span>
          <span className="text-white"> BizTrack</span>
        </div>
        <div className="text-xs text-gray-500 mt-0.5">Business Management</div>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {groups.map(group => {
          const items = navItems.filter(item =>
            group === '' ? !item.group : item.group === group
          )
          if (!items.length) return null
          return (
            <div key={group} className="mb-4">
              {group && (
                <div className="text-xs text-gray-600 uppercase tracking-widest px-3 mb-2 font-semibold">
                  {group}
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
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          )
        })}
      </nav>

      {/* Bottom */}
      <div className="px-5 py-4 border-t border-gray-800">
        <div className="text-xs text-gray-600">Rica BizTrack v1.0</div>
        <div className="text-xs text-gray-700 mt-0.5">© 2025 All rights reserved</div>
      </div>
    </aside>
  )
}