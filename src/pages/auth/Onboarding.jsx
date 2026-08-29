import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthLayout from '../../layouts/AuthLayout'
import BrandLogo from '../../components/BrandLogo'
import Button from '../../components/Button'
import Input from '../../components/Input'
import { useApp } from '../../contexts/appContextCore'
import { ROLES } from '../../modules/permissions/rolePermissions'
import { paths } from '../../routes/paths'
import { getMaxBirthDateForAdult, validateBirthDate } from '../../utils/birthdayValidation'

const destinationByRole = {
  [ROLES.CLIENT]: paths.client,
  [ROLES.ARTIST]: paths.artistSettings,
  [ROLES.PLATFORM_OWNER]: paths.admin,
  [ROLES.STUDIO_OWNER]: paths.admin,
  [ROLES.STUDIO_MANAGER]: paths.admin,
}

function getInitialDisplayName(session) {
  return session.profile?.display_name
    || session.user?.name
    || session.authUser?.user_metadata?.full_name
    || session.authUser?.user_metadata?.name
    || ''
}

function Onboarding() {
  const navigate = useNavigate()
  const { authError, completeGoogleOnboarding, isAuthLoading, session } = useApp()
  const currentRole = session.role || session.user?.role
  const [accountType, setAccountType] = useState(currentRole || '')
  const [form, setForm] = useState({
    displayName: getInitialDisplayName(session),
    phone: session.profile?.phone || session.user?.phone || '',
    birthday: '',
    artisticName: getInitialDisplayName(session),
    city: '',
  })
  const [localError, setLocalError] = useState('')

  const updateForm = (field, value) => {
    setForm((currentForm) => ({ ...currentForm, [field]: value }))
  }

  const handleExistingSessionContinue = () => {
    navigate(destinationByRole[currentRole] || paths.login, { replace: true })
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLocalError('')

    if (!accountType) {
      setLocalError('Elige si tu cuenta sera de clienta o artista.')
      return
    }

    const birthdayError = validateBirthDate(form.birthday)
    if (birthdayError) {
      setLocalError(birthdayError)
      return
    }

    if (!form.displayName.trim()) {
      setLocalError('Escribe tu nombre completo.')
      return
    }

    if (accountType === ROLES.ARTIST && !form.artisticName.trim()) {
      setLocalError('Escribe tu nombre artistico o estudio.')
      return
    }

    try {
      const nextSession = await completeGoogleOnboarding({
        accountType,
        displayName: form.displayName.trim(),
        phone: form.phone.trim(),
        birthday: form.birthday,
        artisticName: form.artisticName.trim(),
        city: form.city.trim(),
      })

      navigate(destinationByRole[nextSession.role] || paths.login, { replace: true })
    } catch {
      setLocalError('No se pudo completar tu cuenta.')
    }
  }

  if (currentRole) {
    return (
      <AuthLayout>
        <div className="auth-card">
          <div style={{ display: 'grid', gap: '18px', justifyItems: 'center', textAlign: 'center' }}>
            <BrandLogo hero />
          </div>

          <div className="form-stack">
            <div className="studio-validation-note">
              <span className="eyebrow">Cuenta lista</span>
              <strong>Tu perfil ya esta conectado</strong>
              <p>Continua a tu espacio de Studio Flow.</p>
            </div>

            <Button className="full-width" onClick={handleExistingSessionContinue}>
              Continuar
            </Button>
          </div>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <div className="auth-card">
        <div style={{ display: 'grid', gap: '18px', justifyItems: 'center', textAlign: 'center' }}>
          <BrandLogo hero />
        </div>

        <form className="form-stack" onSubmit={handleSubmit}>
          <div className="studio-validation-note">
            <span className="eyebrow">Cuenta Google</span>
            <strong>Completa tu perfil</strong>
            <p>Elige como usaras Studio Flow para crear tu perfil interno.</p>
          </div>

          <div className="login-actions">
            <button
              type="button"
              className={accountType === ROLES.CLIENT ? 'onboarding-choice active' : 'onboarding-choice'}
              onClick={() => setAccountType(ROLES.CLIENT)}
            >
              <strong>Clienta</strong>
              <small>Reservar citas, guardar favoritos y consultar historial.</small>
            </button>
            <button
              type="button"
              className={accountType === ROLES.ARTIST ? 'onboarding-choice active' : 'onboarding-choice'}
              onClick={() => setAccountType(ROLES.ARTIST)}
            >
              <strong>Artista</strong>
              <small>Crear perfil profesional para revision y aprobacion.</small>
            </button>
          </div>

          <Input
            label="Nombre completo"
            type="text"
            placeholder="ejemplo Mariana Lopez"
            value={form.displayName}
            onChange={(event) => updateForm('displayName', event.target.value)}
            required
          />
          <Input
            label="Numero celular"
            type="tel"
            placeholder="coloca aqui tu numero"
            value={form.phone}
            onChange={(event) => updateForm('phone', event.target.value)}
          />
          <Input
            label="Fecha de nacimiento"
            type="date"
            value={form.birthday}
            max={getMaxBirthDateForAdult()}
            onChange={(event) => updateForm('birthday', event.target.value)}
            required
          />

          {accountType === ROLES.ARTIST && (
            <>
              <Input
                label="Nombre artistico o estudio"
                type="text"
                placeholder="ejemplo Valeria Moon Studio"
                value={form.artisticName}
                onChange={(event) => updateForm('artisticName', event.target.value)}
                required
              />
              <Input
                label="Ciudad"
                type="text"
                placeholder="Ciudad donde trabajas"
                value={form.city}
                onChange={(event) => updateForm('city', event.target.value)}
              />
            </>
          )}

          {(localError || authError) && (
            <small style={{ color: 'var(--rose-dark)', fontWeight: 800 }}>{authError || localError}</small>
          )}

          <Button className="full-width" type="submit" disabled={isAuthLoading}>
            {isAuthLoading ? 'Guardando...' : 'Continuar'}
          </Button>
        </form>
      </div>
    </AuthLayout>
  )
}

export default Onboarding
