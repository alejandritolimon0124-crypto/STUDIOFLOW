import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthLayout from '../../layouts/AuthLayout'
import BrandLogo from '../../components/BrandLogo'
import Button from '../../components/Button'
import Input from '../../components/Input'
import { useApp } from '../../contexts/appContextCore'
import { paths } from '../../routes/paths'

function ResetPassword() {
  const navigate = useNavigate()
  const { authError, updatePassword } = useApp()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [updated, setUpdated] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (password !== confirmPassword) return

    setIsSubmitting(true)

    try {
      await updatePassword(password)
      setUpdated(true)
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
            label="Nueva contrasena"
            type="password"
            placeholder="********"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={6}
          />
          <Input
            label="Confirmar contrasena"
            type="password"
            placeholder="********"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            minLength={6}
          />

          {password && confirmPassword && password !== confirmPassword && (
            <small style={{ color: 'var(--rose-dark)', fontWeight: 800 }}>Las contrasenas no coinciden.</small>
          )}
          {authError && <small style={{ color: 'var(--rose-dark)', fontWeight: 800 }}>{authError}</small>}
          {updated && <small style={{ color: 'var(--muted)', fontWeight: 800 }}>Contrasena actualizada.</small>}

          <Button className="full-width" type="submit" disabled={isSubmitting || password !== confirmPassword}>
            {isSubmitting ? 'Actualizando...' : 'Actualizar contrasena'}
          </Button>
          <button className="text-link center-link" type="button" onClick={() => navigate(paths.login)}>
            Ir a login
          </button>
        </form>
      </div>
    </AuthLayout>
  )
}

export default ResetPassword
