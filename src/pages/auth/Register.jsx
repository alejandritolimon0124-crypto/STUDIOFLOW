import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthLayout from '../../layouts/AuthLayout'
import BrandLogo from '../../components/BrandLogo'
import Button from '../../components/Button'
import Input from '../../components/Input'
import { useApp } from '../../contexts/appContextCore'
import { paths } from '../../routes/paths'
import { getDefaultStudioStatus, getStudioStatusLabel } from '../../modules/governance/studioGovernance'
import { getMaxBirthDateForAdult, validateBirthDate } from '../../utils/birthdayValidation'
import { BEAUTY_SPACES } from '../../services/beautySpaceService'

const initialClientForm = {
  displayName: '',
  email: '',
  phone: '',
  birthday: '',
  password: '',
  confirmPassword: '',
}

const initialArtistForm = {
  artisticName: '',
  displayName: '',
  email: '',
  phone: '',
  birthday: '',
  password: '',
  confirmPassword: '',
  address: '',
  city: '',
  claimToken: '',
  beautySpaces: [],
  hasHealthOfficer: false,
  healthOfficerName: '',
  healthOfficerTitle: '',
  healthOfficerLicense: '',
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

  const toggleBeautySpace = (space) => {
    setArtistForm((currentForm) => ({
      ...currentForm,
      beautySpaces: currentForm.beautySpaces.includes(space)
        ? currentForm.beautySpaces.filter((item) => item !== space)
        : [...currentForm.beautySpaces, space],
    }))
  }

  const validatePasswords = (form) => {
    if (form.password !== form.confirmPassword) {
      setLocalError('Las contrasenas no coinciden.')
      return false
    }

    setLocalError('')
    return true
  }

  const validateBirthday = (birthday) => {
    const error = validateBirthDate(birthday)
    if (error) {
      setLocalError(error)
      return false
    }

    setLocalError('')
    return true
  }

  const handleClientSubmit = async (event) => {
    event.preventDefault()
    setConfirmationMessage('')

    if (!validatePasswords(clientForm) || !validateBirthday(clientForm.birthday)) return

    try {
      const result = await registerClient(clientForm)

      if (result.needsEmailConfirmation) {
        setConfirmationMessage('Revisa tu correo para confirmar el registro. Si este correo ya tenia una cuenta, inicia sesion o restablece tu contraseña.')
        return
      }

      navigate(paths.client)
    } catch (error) {
      setLocalError(error.message || 'No se pudo crear la cuenta cliente.')
    }
  }

  const handleArtistSubmit = async (event) => {
    event.preventDefault()
    setConfirmationMessage('')

    if (!validatePasswords(artistForm) || !validateBirthday(artistForm.birthday)) return
    if (artistForm.beautySpaces.length === 0) {
      setLocalError('Selecciona el beauty space en el que ofrecerás tus servicios.')
      return
    }
    if (artistForm.beautySpaces.includes(BEAUTY_SPACES.SPA_AND_ADVANCED_AESTHETICS)
      && (!artistForm.hasHealthOfficer || !artistForm.healthOfficerName.trim()
        || !artistForm.healthOfficerTitle.trim() || !artistForm.healthOfficerLicense.trim())) {
      setLocalError('Para estética avanzada debes confirmar y completar los datos del responsable sanitario.')
      return
    }

    try {
      const result = await registerArtist({
        ...artistForm,
        displayName: artistForm.displayName || artistForm.artisticName,
      })

      if (result.needsEmailConfirmation) {
        setConfirmationMessage('Revisa tu correo para confirmar el registro. Si este correo ya tenia una cuenta, inicia sesion o restablece tu contraseña.')
        return
      }

      navigate(paths.artistSettings)
    } catch (error) {
      setLocalError(error.message || 'No se pudo crear la cuenta artista.')
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
              label="Fecha de nacimiento"
              type="date"
              value={clientForm.birthday}
              max={getMaxBirthDateForAdult()}
              onChange={(event) => updateClientForm('birthday', event.target.value)}
              required
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
            <div className="beauty-space-registration">
              <span className="eyebrow">Beauty space</span>
              <strong>¿En qué espacio ofrecerás tus servicios?</strong>
              <div className="beauty-space-options">
                <label className={`beauty-space-choice${artistForm.beautySpaces.includes(BEAUTY_SPACES.BEAUTY_AND_PERSONAL_CARE) ? ' is-active' : ''}`}>
                  <input checked={artistForm.beautySpaces.includes(BEAUTY_SPACES.BEAUTY_AND_PERSONAL_CARE)} type="checkbox" onChange={() => toggleBeautySpace(BEAUTY_SPACES.BEAUTY_AND_PERSONAL_CARE)} />
                  <span>Salones de belleza y cuidado personal</span>
                </label>
                <label className={`beauty-space-choice${artistForm.beautySpaces.includes(BEAUTY_SPACES.SPA_AND_ADVANCED_AESTHETICS) ? ' is-active' : ''}`}>
                  <input checked={artistForm.beautySpaces.includes(BEAUTY_SPACES.SPA_AND_ADVANCED_AESTHETICS)} type="checkbox" onChange={() => toggleBeautySpace(BEAUTY_SPACES.SPA_AND_ADVANCED_AESTHETICS)} />
                  <span>Spa y estética avanzada</span>
                </label>
              </div>
              {artistForm.beautySpaces.includes(BEAUTY_SPACES.SPA_AND_ADVANCED_AESTHETICS) && (
                <div className="health-officer-fields">
                  <label className="location-toggle-row">
                    <input checked={artistForm.hasHealthOfficer} type="checkbox" onChange={(event) => updateArtistForm('hasHealthOfficer', event.target.checked)} />
                    <span>Tengo responsable sanitario</span>
                  </label>
                  <Input label="Nombre completo del responsable sanitario" value={artistForm.healthOfficerName} onChange={(event) => updateArtistForm('healthOfficerName', event.target.value)} required />
                  <Input label="Título profesional del responsable sanitario" value={artistForm.healthOfficerTitle} onChange={(event) => updateArtistForm('healthOfficerTitle', event.target.value)} required />
                  <Input label="Cédula profesional del responsable sanitario" value={artistForm.healthOfficerLicense} onChange={(event) => updateArtistForm('healthOfficerLicense', event.target.value)} required />
                </div>
              )}
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
              label="Fecha de nacimiento"
              type="date"
              value={artistForm.birthday}
              max={getMaxBirthDateForAdult()}
              onChange={(event) => updateArtistForm('birthday', event.target.value)}
              required
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
