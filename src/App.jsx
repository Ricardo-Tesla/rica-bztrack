import SalesPage from './pages/SalesPage'
import './index.css'

function App() {
  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      <main className="flex-1 overflow-y-auto">
        <SalesPage />
      </main>
    </div>
  )
}

export default App