import PLPage from './pages/PLPage'
import './index.css'

function App() {
  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      <main className="flex-1 overflow-y-auto">
        <PLPage />
      </main>
    </div>
  )
}

export default App