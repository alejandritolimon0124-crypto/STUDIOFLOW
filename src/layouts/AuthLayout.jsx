import { navigateTo } from '../routes/routerUtils'
import { paths } from '../routes/paths'

function AuthLayout({ children, mode }) {
  const isLogin = mode === 'login'

  return (
    <main className="auth-shell">
      <section className="auth-brand-panel">
        <nav className="auth-nav">
          <button className="brand-button" type="button" onClick={() => navigateTo(paths.login)}>
            <span>SF</span>
            Studio Flow
          </button>
          <button className="text-link" type="button" onClick={() => navigateTo(isLogin ? paths.register : paths.login)}>
            {isLogin ? 'Crear cuenta' : 'Iniciar sesion'}
          </button>
        </nav>

        <div className="auth-hero">
          <span className="eyebrow">Beauty operations suite</span>
          <h1>Agenda premium para estudios que cuidan cada detalle.</h1>
          <p>
            Organiza reservas, clientas, servicios y crecimiento desde una experiencia elegante,
            lista para conectarse a tu backend cuando llegue el momento.
          </p>
        </div>

        <div className="auth-preview">
          <div>
            <small>Hoy</small>
            <strong>16 citas</strong>
          </div>
          <div>
            <small>Satisfaccion</small>
            <strong>98%</strong>
          </div>
          <div>
            <small>Ingresos</small>
            <strong>$24.8K</strong>
          </div>
        </div>
      </section>

      <section className="auth-form-panel">{children}</section>
    </main>
  )
}

export default AuthLayout
