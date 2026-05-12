import { useNavigate } from 'react-router-dom'
import AuthLayout from '../../layouts/AuthLayout'
import BrandLogo from '../../components/BrandLogo'
import Button from '../../components/Button'
import Input from '../../components/Input'
import { useApp } from '../../contexts/appContextCore'
import { paths } from '../../routes/paths'

function Login() {
  const navigate = useNavigate()
  const { login } = useApp()

  const handleLogin = (role, path) => {
    login(role)
    navigate(path)
  }

  return (
    <AuthLayout>
      <div className="auth-card">
        <div style={{ display: 'grid', gap: '18px', justifyItems: 'center', textAlign: 'center' }}>
          <BrandLogo hero />
        </div>

        <form className="form-stack">
          <Input label="Email" type="email" placeholder="hola@studioflow.mx" />
          <Input label="Contrasena" type="password" placeholder="********" />
          <button className="text-link" type="button" style={{ justifySelf: 'end', fontSize: '12px' }}>
            Olvidaste tu contrasena?
          </button>
          <Button className="full-width" onClick={() => handleLogin('artist', paths.artistAgenda)}>
            Iniciar sesion
          </Button>
        </form>

        <div className="login-actions">
          <Button className="full-width" variant="ghost">
            Continuar con Google
          </Button>
          <button className="text-link center-link" type="button" onClick={() => navigate(paths.register)}>
            Crear cuenta
          </button>
        </div>

        <div className="login-actions" style={{ borderTop: '1px solid var(--line)', paddingTop: '16px' }}>
          <span className="eyebrow" style={{ marginBottom: 0, textAlign: 'center' }}>Accesos demo</span>
          <Button className="full-width" variant="ghost" onClick={() => handleLogin('artist', paths.artistAgenda)}>
            Entrar como artista demo
          </Button>
          <Button className="full-width" variant="ghost" onClick={() => handleLogin('client', paths.client)}>
            Entrar como cliente demo
          </Button>
          <Button className="full-width" variant="ghost" onClick={() => handleLogin('admin', paths.admin)}>
            Entrar como admin demo
          </Button>
        </div>
      </div>
    </AuthLayout>
  )
}

export default Login
