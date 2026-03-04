import TransactionsPage from './pages/TransactionsPage'
import './index.css'

function App() {
  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      <main className="flex-1 overflow-y-auto">
        <TransactionsPage />
      </main>
    </div>
  )
}

export default App