import AuthLayout from '../../layouts/AuthLayout'
import Button from '../../components/Button'
import { navigateTo } from '../../routes/routerUtils'
import { paths } from '../../routes/paths'

function Login() {
  return (
    <AuthLayout mode="login">
      <div className="auth-card">
        <span className="eyebrow">Bienvenida de vuelta</span>
        <h2>Inicia sesion</h2>
        <p>Accede a tu agenda, clientas y panel de control.</p>

        <form className="form-stack">
          <label>
            Correo
            <input type="email" placeholder="hola@studioflow.mx" />
          </label>
          <label>
            Contrasena
            <input type="password" placeholder="••••••••" />
          </label>
          <Button className="full-width" onClick={() => navigateTo(paths.artist)}>
            Entrar al dashboard
          </Button>
        </form>

        <div className="role-shortcuts">
          <button type="button" onClick={() => navigateTo(paths.admin)}>Ver Admin</button>
          <button type="button" onClick={() => navigateTo(paths.artist)}>Ver Artista</button>
          <button type="button" onClick={() => navigateTo(paths.client)}>Ver Cliente</button>
        </div>
      </div>
    </AuthLayout>
  )
}

export default Login
