import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import AuthLayout from '../../layouts/AuthLayout'
import Button from '../../components/Button'
import Input from '../../components/Input'
import { useApp } from '../../contexts/appContextCore'
import { ROLES } from '../../modules/permissions/rolePermissions'
import { paths } from '../../routes/paths'
import '../../styles/login.css'
import { clearPendingInvitationReturnPath, getInvitationReturnPath, getPendingInvitationReturnPath } from '../../utils/invitationReturnPath'
import { resendSignupConfirmation } from '../../services/authService'

const routeByRole = {
  [ROLES.CLIENT]: paths.client,
  [ROLES.ARTIST]: paths.artistAgenda,
  [ROLES.PLATFORM_OWNER]: paths.admin,
  [ROLES.STUDIO_OWNER]: paths.admin,
  [ROLES.STUDIO_MANAGER]: paths.admin,
}

function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const invitationReturn = getInvitationReturnPath(location.search) || getPendingInvitationReturnPath()
  const { authError, isAuthLoading, isAuthenticated, loginWithPassword, session } = useApp()
  const [form, setForm] = useState({ email: '', password: '' })
  const [localError, setLocalError] = useState('')
  const [showConfirmationHelp, setShowConfirmationHelp] = useState(false)
  const [confirmationEmail, setConfirmationEmail] = useState('')
  const [confirmationStatus, setConfirmationStatus] = useState('')
  const [confirmationError, setConfirmationError] = useState('')
  const [isResendingConfirmation, setIsResendingConfirmation] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) return

    if (session.role === ROLES.CLIENT && invitationReturn) clearPendingInvitationReturnPath()
    navigate(session.role === ROLES.CLIENT && invitationReturn ? invitationReturn : routeByRole[session.role] || paths.onboarding, { replace: true })
  }, [isAuthenticated, navigate, session?.role, invitationReturn])

  const updateForm = (field, value) => {
    setForm((currentForm) => ({ ...currentForm, [field]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLocalError('')

    try {
      const nextSession = await loginWithPassword(form)
      if (nextSession.role === ROLES.CLIENT && invitationReturn) clearPendingInvitationReturnPath()
      navigate(nextSession.role === ROLES.CLIENT && invitationReturn ? invitationReturn : routeByRole[nextSession.role] || paths.onboarding)
    } catch {
      setLocalError('Revisa tu email y contrasena.')
    }
  }

  const handleResendConfirmation = async (event) => {
    event.preventDefault()
    setConfirmationError('')
    setConfirmationStatus('')
    setIsResendingConfirmation(true)

    try {
      await resendSignupConfirmation(confirmationEmail)
      setConfirmationStatus('Si este correo tiene una cuenta pendiente de confirmar, te enviamos un enlace nuevo. Revisa también spam.')
    } catch (error) {
      setConfirmationError(error.message || 'No pudimos solicitar el enlace. Intenta de nuevo más tarde.')
    } finally {
      setIsResendingConfirmation(false)
    }
  }

  return (
    <AuthLayout className="login-shell">
      <div className="auth-card login-card">
        <header className="auth-form-brand"><img src="/studioflow-wordmark-960.png" alt="Studio Flow" /><span>QUÉ GUSTO VERTE</span><h2>Entra a tu espacio</h2><p>Tu agenda y tus próximas oportunidades te esperan.</p></header>

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

        <div className="login-confirmation-help">
          <button className="text-link" type="button" aria-expanded={showConfirmationHelp} aria-controls="login-confirmation-form" onClick={() => {
            setShowConfirmationHelp((value) => !value)
            setConfirmationEmail(form.email)
            setConfirmationError('')
            setConfirmationStatus('')
          }}>
            ¿No recibiste el correo de confirmación?
          </button>
          {showConfirmationHelp && <form id="login-confirmation-form" className="form-stack" onSubmit={handleResendConfirmation}>
            <Input label="Correo de tu cuenta" type="email" autoComplete="email" value={confirmationEmail} onChange={(event) => setConfirmationEmail(event.target.value)} required />
            <Button className="full-width" type="submit" disabled={isResendingConfirmation}>{isResendingConfirmation ? 'Enviando...' : 'Reenviar enlace'}</Button>
            {confirmationStatus && <small role="status" className="login-confirmation-status">{confirmationStatus}</small>}
            {confirmationError && <small role="alert" className="form-error">{confirmationError}</small>}
          </form>}
        </div>

        <div className="login-actions">
          <button className="text-link center-link" type="button" onClick={() => navigate(invitationReturn ? `${paths.register}?tipo=client&next=${encodeURIComponent(invitationReturn)}` : paths.register)}>
            Crear cuenta
          </button>
        </div>
      </div>
    </AuthLayout>
  )
}

export default Login
