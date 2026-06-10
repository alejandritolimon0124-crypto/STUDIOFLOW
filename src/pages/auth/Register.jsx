import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthLayout from '../../layouts/AuthLayout'
import BrandLogo from '../../components/BrandLogo'
import Button from '../../components/Button'
import Input from '../../components/Input'
import { useApp } from '../../contexts/appContextCore'
import { paths } from '../../routes/paths'
import { getDefaultStudioStatus, getStudioStatusLabel } from '../../modules/governance/studioGovernance'

const initialClientForm = {
  displayName: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
}

const initialArtistForm = {
  artisticName: '',
  displayName: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
  address: '',
  city: '',
  claimToken: '',
}

function Register() {
  const navigate = useNavigate()
  const { authError, isAuthLoading, registerArtist, registerClient } = useApp()
  const [accountType, setAccountType] = useState(null)
  const [clientForm, setClientForm] = useState(initialClientForm)
  const [artistForm, setArtistForm] = useState(initialArtistForm)
  const [localError, setLocalError] = useState('')
  const [confirmationMessage, setConfirmationMessage] = useState('')
  const defaultStudioStatus = getDefaultStudioStatus()

  const updateClientForm = (field, value) => {
    setClientForm((currentForm) => ({ ...currentForm, [field]: value }))
  }

  const updateArtistForm = (field, value) => {
    setArtistForm((currentForm) => ({ ...currentForm, [field]: value }))
  }

  const validatePasswords = (form) => {
    if (form.password !== form.confirmPassword) {
      setLocalError('Las contrasenas no coinciden.')
      return false
    }

    setLocalError('')
    return true
  }

  const handleClientSubmit = async (event) => {
    event.preventDefault()
    setConfirmationMessage('')

    if (!validatePasswords(clientForm)) return

    try {
      const result = await registerClient(clientForm)

      if (result.needsEmailConfirmation) {
        setConfirmationMessage('Revisa tu correo para confirmar la cuenta antes de entrar.')
        return
      }

      navigate(paths.client)
    } catch {
      setLocalError('No se pudo crear la cuenta cliente.')
    }
  }

  const handleArtistSubmit = async (event) => {
    event.preventDefault()
    setConfirmationMessage('')

    if (!validatePasswords(artistForm)) return

    try {
      const result = await registerArtist({
        ...artistForm,
        displayName: artistForm.displayName || artistForm.artisticName,
      })

      if (result.needsEmailConfirmation) {
        setConfirmationMessage('Revisa tu correo para confirmar la cuenta antes de entrar.')
        return
      }

      navigate(paths.artistSettings)
    } catch {
      setLocalError('No se pudo crear la cuenta artista.')
    }
  }

  return (
    <AuthLayout>
      <div className="auth-card">
        <div style={{ display: 'grid', gap: '18px', justifyItems: 'center', textAlign: 'center' }}>
          <BrandLogo hero />
        </div>

        {!accountType && (
          <div className="login-actions">
            <button
              type="button"
              onClick={() => setAccountType('client')}
              style={{
                background: 'linear-gradient(135deg, #fff, #f8e7e8)',
                border: '1px solid var(--line)',
                borderRadius: '16px',
                boxShadow: 'var(--shadow-soft)',
                color: 'var(--text)',
                display: 'grid',
                gap: '8px',
                padding: '18px',
                textAlign: 'left',
              }}
            >
              <strong>Crear cuenta cliente</strong>
              <small style={{ color: 'var(--muted)' }}>Reserva citas, guarda favoritos y consulta tu historial beauty.</small>
            </button>

            <button
              type="button"
              onClick={() => setAccountType('artist')}
              style={{
                background: 'linear-gradient(135deg, #fff, #f2e8e1)',
                border: '1px solid var(--line)',
                borderRadius: '16px',
                boxShadow: 'var(--shadow-soft)',
                color: 'var(--text)',
                display: 'grid',
                gap: '8px',
                padding: '18px',
                textAlign: 'left',
              }}
            >
              <strong>Crear cuenta artista</strong>
              <small style={{ color: 'var(--muted)' }}>Prepara tu perfil profesional para agenda, servicios y clientas.</small>
            </button>

            <button className="text-link center-link" type="button" onClick={() => navigate(paths.login)}>
              Ya tienes cuenta? Inicia sesion
            </button>
          </div>
        )}

        {accountType === 'client' && (
          <form className="form-stack" onSubmit={handleClientSubmit}>
            <Input
              label="Nombre completo"
              type="text"
              placeholder="ejemplo Mariana Lopez"
              value={clientForm.displayName}
              onChange={(event) => updateClientForm('displayName', event.target.value)}
              required
            />
            <Input
              label="Correo electronico"
              type="email"
              placeholder="ejemplo mariana@email.com"
              value={clientForm.email}
              onChange={(event) => updateClientForm('email', event.target.value)}
              required
            />
            <Input
              label="Numero celular"
              type="tel"
              placeholder="coloca aqui tu numero para recibir notificaciones y recordatorios de tus citas"
              value={clientForm.phone}
              onChange={(event) => updateClientForm('phone', event.target.value)}
            />
            <Input
              label="Crear contrasena"
              type="password"
              placeholder="********"
              value={clientForm.password}
              onChange={(event) => updateClientForm('password', event.target.value)}
              required
              minLength={6}
            />
            <Input
              label="Confirmar contrasena"
              type="password"
              placeholder="********"
              value={clientForm.confirmPassword}
              onChange={(event) => updateClientForm('confirmPassword', event.target.value)}
              required
              minLength={6}
            />

            {(localError || authError) && (
              <small style={{ color: 'var(--rose-dark)', fontWeight: 800 }}>{authError || localError}</small>
            )}
            {confirmationMessage && <small style={{ color: 'var(--muted)', fontWeight: 800 }}>{confirmationMessage}</small>}

            <Button className="full-width" variant="ghost" disabled>Continuar con Google</Button>
            <Button className="full-width" type="submit" disabled={isAuthLoading}>
              {isAuthLoading ? 'Creando...' : 'Crear cuenta cliente'}
            </Button>
            <button className="text-link center-link" type="button" onClick={() => navigate(paths.login)}>
              Ya tienes cuenta? Inicia sesion
            </button>
          </form>
        )}

        {accountType === 'artist' && (
          <form className="form-stack" onSubmit={handleArtistSubmit}>
            <div className="studio-validation-note">
              <span className="eyebrow">Acceso Seguro</span>
              <strong>{getStudioStatusLabel(defaultStudioStatus)}</strong>
              <p>Tu estudio entrara a validacion para mantener la calidad premium de Studio Flow.</p>
              <input type="hidden" name="studioStatus" value={defaultStudioStatus} />
            </div>
            <Input
              label="Nombre artistico o estudio"
              type="text"
              placeholder="ejemplo: Valeria Moon Studio"
              value={artistForm.artisticName}
              onChange={(event) => updateArtistForm('artisticName', event.target.value)}
              required
            />
            <Input
              label="Nombre completo"
              type="text"
              placeholder="ejemplo: Valeria Hernandez"
              value={artistForm.displayName}
              onChange={(event) => updateArtistForm('displayName', event.target.value)}
            />
            <Input
              label="Correo electronico"
              type="email"
              placeholder="ejemplo: contacto@studio.com"
              value={artistForm.email}
              onChange={(event) => updateArtistForm('email', event.target.value)}
              required
            />
            <Input
              label="Numero celular"
              type="tel"
              placeholder="coloca aqui tu numero para recibir notificaciones y recordatorios de tus citas"
              value={artistForm.phone}
              onChange={(event) => updateArtistForm('phone', event.target.value)}
            />
            <Input
              label="Crear contrasena"
              type="password"
              placeholder="********"
              value={artistForm.password}
              onChange={(event) => updateArtistForm('password', event.target.value)}
              required
              minLength={6}
            />
            <Input
              label="Confirmar contrasena"
              type="password"
              placeholder="********"
              value={artistForm.confirmPassword}
              onChange={(event) => updateArtistForm('confirmPassword', event.target.value)}
              required
              minLength={6}
            />

            <div style={{ borderTop: '1px solid var(--line)', display: 'grid', gap: '14px', paddingTop: '18px' }}>
              <div>
                <span className="eyebrow">Informacion profesional</span>
                <p style={{ color: 'var(--muted)', fontSize: '14px', lineHeight: 1.45 }}>
                  Datos visibles para preparar tu perfil publico mas adelante.
                </p>
              </div>

              <Input
                label="Direccion del estudio"
                type="text"
                placeholder="direccion de tu estudio o salon de belleza para mostrar en tu perfil publico"
                value={artistForm.address}
                onChange={(event) => updateArtistForm('address', event.target.value)}
              />
              <Input
                label="Ciudad"
                type="text"
                placeholder="Ciudaad donde se encuentra tu estudio para mostrar en tu perfil publico"
                value={artistForm.city}
                onChange={(event) => updateArtistForm('city', event.target.value)}
              />
              <Input
                label="Token de invitacion"
                type="text"
                placeholder="Opcional para reclamar artista de estudio"
                value={artistForm.claimToken}
                onChange={(event) => updateArtistForm('claimToken', event.target.value)}
              />
            </div>

            {(localError || authError) && (
              <small style={{ color: 'var(--rose-dark)', fontWeight: 800 }}>{authError || localError}</small>
            )}
            {confirmationMessage && <small style={{ color: 'var(--muted)', fontWeight: 800 }}>{confirmationMessage}</small>}

            <Button className="full-width" type="submit" disabled={isAuthLoading}>
              {isAuthLoading ? 'Creando...' : 'Crear cuenta artista'}
            </Button>
            <button className="text-link center-link" type="button" onClick={() => navigate(paths.login)}>
              Ya tienes cuenta? Inicia sesion
            </button>
          </form>
        )}
      </div>
    </AuthLayout>
  )
}

export default Register
