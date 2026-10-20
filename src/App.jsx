import { useState } from 'react'
import { AppProvider, useApp } from './context/AppContext'
import Sidebar from './components/Sidebar'
import ErrorBoundary from './components/ErrorBoundary'
import SetupPage from './pages/SetupPage'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import POSPage from './pages/POSPage'
import SalesPage from './pages/SalesPage'
import ProductsPage from './pages/ProductsPage'
import SuppliersPage from './pages/SuppliersPage'
import CustomersPage from './pages/CustomersPage'
import TransactionsPage from './pages/TransactionsPage'
import ExpensesPage from './pages/ExpensesPage'
import PLPage from './pages/PLPage'
import SettingsPage from './pages/SettingsPage'
import { homePage } from './utils/permissions'
import { useAutoLock } from './hooks/useAutoLock'
import { useBackgroundTasks } from './hooks/useBackgroundTasks'
import './index.css'

const PAGES = {
  dashboard: DashboardPage,
  pos: POSPage,
  sales: SalesPage,
  products: ProductsPage,
  suppliers: SuppliersPage,
  customers: CustomersPage,
  transactions: TransactionsPage,
  expenses: ExpensesPage,
  profit: PLPage,
  settings: SettingsPage,
}

function Shell() {
  const { settings, needsSetup, loadError, user, canSeePage } = useApp()
  // The chosen page belongs to the signed-in person; after a new sign-in,
  // start on that person's home page.
  const [nav, setNav] = useState({ userId: null, page: 'dashboard' })
  const activePage = user && nav.userId === user.id ? nav.page : homePage(user)
  const setActivePage = page => setNav({ userId: user?.id, page })

  useAutoLock()
  const banner = useBackgroundTasks()

  if (loadError) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center p-8">
        <div className="max-w-md text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <h1 className="text-xl font-bold text-red-400 mb-2">Could not open the database</h1>
          <p className="text-sm text-gray-400 mb-3">Please restart the app. If this keeps happening, contact support.</p>
          <pre className="text-xs text-red-300 bg-gray-900 border border-gray-800 rounded-lg p-3 whitespace-pre-wrap">{loadError}</pre>
        </div>
      </div>
    )
  }

  if (!settings) {
    return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-500 text-sm animate-pulse">Rica BizTrack…</div>
  }

  if (needsSetup) return <SetupPage />
  if (!user) return <LoginPage />

  const page = canSeePage(activePage) ? activePage : homePage(user)
  const Page = PAGES[page] || PAGES[homePage(user)]

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100 overflow-hidden">
      <Sidebar activePage={page} onNavigate={setActivePage} />
      <main className="flex-1 overflow-y-auto">
        {banner}
        <ErrorBoundary name={page} resetKey={page}>
          <Page onNavigate={setActivePage} />
        </ErrorBoundary>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary name="app">
      <AppProvider>
        <Shell />
      </AppProvider>
    </ErrorBoundary>
  )
}
