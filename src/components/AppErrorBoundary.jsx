import { Component } from 'react'
import Button from './Button'

async function clearAppCaches() {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((registration) => registration.unregister()))
  }

  if ('caches' in window) {
    const cacheNames = await caches.keys()
    await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)))
  }
}

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[Studio Flow] App render error', error, info)
  }

  handleReload = async () => {
    try {
      await clearAppCaches()
    } finally {
      window.location.replace('/login')
    }
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <main className="app-error-screen">
        <section className="app-error-card">
          <span className="eyebrow">Studio Flow</span>
          <h1>Vamos a recargar la app</h1>
          <p>La version cargada en este navegador quedo incompleta. Limpiaremos la cache de Studio Flow y abriremos la app de nuevo.</p>
          <Button onClick={this.handleReload}>Limpiar y recargar</Button>
          <small>{this.state.error.message || 'Error de pantalla'}</small>
        </section>
      </main>
    )
  }
}

export default AppErrorBoundary
