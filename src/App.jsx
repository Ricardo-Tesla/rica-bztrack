import { useState } from 'react'
import Sidebar from './components/Sidebar'
import DashboardPage from './pages/DashboardPage'
import POSPage from './pages/POSPage'
import SalesPage from './pages/SalesPage'
import ProductsPage from './pages/ProductsPage'
import SuppliersPage from './pages/SuppliersPage'
import CustomersPage from './pages/CustomersPage'
import TransactionsPage from './pages/TransactionsPage'
import ExpensesPage from './pages/ExpensesPage'
import PLPage from './pages/PLPage'
import './index.css'

function App() {
  const [activePage, setActivePage] = useState('dashboard')

  function renderPage() {
    switch (activePage) {
      case 'dashboard':    return <DashboardPage />
      case 'pos':          return <POSPage />
      case 'sales':        return <SalesPage />
      case 'products':     return <ProductsPage />
      case 'suppliers':    return <SuppliersPage />
      case 'customers':    return <CustomersPage />
      case 'transactions': return <TransactionsPage />
      case 'expenses':     return <ExpensesPage />
      case 'profit':       return <PLPage />
      default:             return <DashboardPage />
    }
  }

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100 overflow-hidden">
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <main className="flex-1 overflow-y-auto">
        {renderPage()}
      </main>
    </div>
  )
}

export default App