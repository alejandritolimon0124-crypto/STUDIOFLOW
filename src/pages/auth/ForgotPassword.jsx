import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthLayout from '../../layouts/AuthLayout'
import BrandLogo from '../../components/BrandLogo'
import Button from '../../components/Button'
import Input from '../../components/Input'
import { useApp } from '../../contexts/appContextCore'
import { paths } from '../../routes/paths'

function ForgotPassword() {
  const navigate = useNavigate()
  const { authError, resetPassword } = useApp()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setIsSubmitting(true)

    try {
      await resetPassword(email)
      setSent(true)
    } finally {
      setIsSubmitting(false)
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
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          {authError && <small style={{ color: 'var(--rose-dark)', fontWeight: 800 }}>{authError}</small>}
          {sent && (
            <small style={{ color: 'var(--muted)', fontWeight: 800 }}>
              Si el correo existe, recibiras un enlace para restablecer tu contrasena.
            </small>
          )}

          <Button className="full-width" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Enviando...' : 'Enviar enlace'}
          </Button>
          <button className="text-link center-link" type="button" onClick={() => navigate(paths.login)}>
            Volver a iniciar sesion
          </button>
        </form>
      </div>
    </AuthLayout>
  )
}

export default ForgotPassword
