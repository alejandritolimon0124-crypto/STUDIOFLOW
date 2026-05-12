import { useNavigate } from 'react-router-dom'
import AuthLayout from '../../layouts/AuthLayout'
import Button from '../../components/Button'
import Input from '../../components/Input'
import { paths } from '../../routes/paths'

function Login() {
  const navigate = useNavigate()

  return (
    <AuthLayout mode="login">
      <div className="auth-card">
        <span className="eyebrow">Bienvenida de vuelta</span>
        <h2>Inicia sesion</h2>
        <p>Accede a tu agenda, clientas y panel de control.</p>

        <form className="form-stack">
          <Input label="Correo" type="email" placeholder="hola@studioflow.mx" helper="Demo visual, sin autenticacion real." />
          <Input label="Contrasena" type="password" placeholder="********" />
          <Button className="full-width" onClick={() => navigate(paths.artistAgenda)}>
            Entrar al dashboard
          </Button>
        </form>

        <div className="role-shortcuts">
          <button type="button" onClick={() => navigate(paths.admin)}>Ver Admin</button>
          <button type="button" onClick={() => navigate(paths.artistAgenda)}>Ver Artista</button>
          <button type="button" onClick={() => navigate(paths.client)}>Ver Cliente</button>
        </div>
      </div>
    </AuthLayout>
  )
}

export default Login
