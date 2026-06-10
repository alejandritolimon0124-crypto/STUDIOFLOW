import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthLayout from '../../layouts/AuthLayout'
import BrandLogo from '../../components/BrandLogo'
import Button from '../../components/Button'
import Input from '../../components/Input'
import { useApp } from '../../contexts/appContextCore'
import { ROLES } from '../../modules/permissions/rolePermissions'
import { paths } from '../../routes/paths'

const routeByRole = {
  [ROLES.CLIENT]: paths.client,
  [ROLES.ARTIST]: paths.artistAgenda,
  [ROLES.PLATFORM_OWNER]: paths.admin,
  [ROLES.STUDIO_OWNER]: paths.admin,
  [ROLES.STUDIO_MANAGER]: paths.admin,
}

function Login() {
  const navigate = useNavigate()
  const { authError, isAuthLoading, loginDemo, loginWithPassword } = useApp()
  const [form, setForm] = useState({ email: '', password: '' })
  const [localError, setLocalError] = useState('')

  const handleDemoLogin = async (role, path) => {
    await loginDemo(role)
    navigate(path)
  }

  const updateForm = (field, value) => {
    setForm((currentForm) => ({ ...currentForm, [field]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLocalError('')

    try {
      const nextSession = await loginWithPassword(form)
      navigate(routeByRole[nextSession.role] || paths.onboarding)
    } catch {
      setLocalError('Revisa tu email y contrasena.')
    }
  }

  return (
    <AuthLayout>
      <div className="auth-card">
        <div style={{ display: 'grid', gap: '18px', justifyItems: 'center', textAlign: 'center' }}>
          <BrandLogo hero />
        </div>

        <form className="form-stack" onSubmit={handleSubmit}>
          <Input
            label="Email"
            type="email"
            placeholder="hola@studioflow.mx"
            value={form.email}
            onChange={(event) => updateForm('email', event.target.value)}
            required
          />
          <Input
            label="Contrasena"
            type="password"
            placeholder="********"
            value={form.password}
            onChange={(event) => updateForm('password', event.target.value)}
            required
          />
          <button
            className="text-link"
            type="button"
            style={{ justifySelf: 'end', fontSize: '12px' }}
            onClick={() => navigate(paths.forgotPassword)}
          >
            Olvidaste tu contrasena?
          </button>
          {(localError || authError) && (
            <small style={{ color: 'var(--rose-dark)', fontWeight: 800 }}>{authError || localError}</small>
          )}
          <Button className="full-width" type="submit" disabled={isAuthLoading}>
            {isAuthLoading ? 'Entrando...' : 'Iniciar sesion'}
          </Button>
        </form>

        <div className="login-actions">
          <Button className="full-width" variant="ghost" disabled>
            Continuar con Google
          </Button>
          <button className="text-link center-link" type="button" onClick={() => navigate(paths.register)}>
            Crear cuenta
          </button>
        </div>

        <div className="login-actions" style={{ borderTop: '1px solid var(--line)', paddingTop: '16px' }}>
          <span className="eyebrow" style={{ marginBottom: 0, textAlign: 'center' }}>Accesos demo</span>
          <Button className="full-width" variant="ghost" onClick={() => handleDemoLogin('artist', paths.artistAgenda)}>
            Entrar como artista demo
          </Button>
          <Button className="full-width" variant="ghost" onClick={() => handleDemoLogin('client', paths.client)}>
            Entrar como cliente demo
          </Button>
          <Button className="full-width" variant="ghost" onClick={() => handleDemoLogin('admin', paths.admin)}>
            Entrar como admin demo
          </Button>
          <Button className="full-width" variant="ghost" onClick={() => handleDemoLogin('studio_owner', paths.admin)}>
            Entrar como studio owner demo
          </Button>
          <Button className="full-width" variant="ghost" onClick={() => handleDemoLogin('studio_manager', paths.admin)}>
            Entrar como manager demo
          </Button>
        </div>
      </div>
    </AuthLayout>
  )
}

export default Login
