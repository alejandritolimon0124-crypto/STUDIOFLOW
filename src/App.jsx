import { AppProvider } from './contexts/AppContext'
import AppRouter from './routes/AppRouter'
import './styles/global.css'

function App() {
  return (
    <AppProvider>
      <AppRouter />
    </AppProvider>
  )
}

export default App
