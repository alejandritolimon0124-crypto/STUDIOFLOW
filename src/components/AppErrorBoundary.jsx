import { Component } from 'react'

export default class AppErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children

    return <main style={{ minHeight: '100dvh', display: 'grid', placeContent: 'center', gap: 16, padding: 24, background: '#f7eff0', color: '#35252b', textAlign: 'center' }}>
      <h1 style={{ margin: 0, font: '700 32px Georgia, serif' }}>No pudimos abrir esta página</h1>
      <p style={{ margin: 0 }}>Intenta cargarla de nuevo.</p>
      <a href={window.location.href} style={{ display: 'inline-block', padding: '13px 20px', borderRadius: 6, background: '#35252b', color: '#fff', fontWeight: 800, textDecoration: 'none' }}>Volver a intentar</a>
    </main>
  }
}
