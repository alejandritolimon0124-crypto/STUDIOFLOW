import { useNavigate } from 'react-router-dom'
import AuthLayout from '../../layouts/AuthLayout'
import BrandLogo from '../../components/BrandLogo'
import Button from '../../components/Button'
import { useApp } from '../../contexts/appContextCore'
import { ROLES } from '../../modules/permissions/rolePermissions'
import { paths } from '../../routes/paths'

function getOnboardingDestination(session) {
  const role = session.role || session.user?.role

  if (role === ROLES.CLIENT) return paths.client
  if (role === ROLES.ARTIST) return paths.artistSettings
  return paths.admin
}

function Onboarding() {
  const navigate = useNavigate()
  const { session } = useApp()
  const role = session.role || session.user?.role
  const destination = getOnboardingDestination(session)
  const isArtist = role === ROLES.ARTIST
  const isClient = role === ROLES.CLIENT

  return (
    <AuthLayout>
      <div className="auth-card">
        <div style={{ display: 'grid', gap: '18px', justifyItems: 'center', textAlign: 'center' }}>
          <BrandLogo hero />
        </div>

        <div className="form-stack">
          <div className="studio-validation-note">
            <span className="eyebrow">Onboarding</span>
            <strong>{isArtist ? 'Perfil profesional' : isClient ? 'Perfil cliente' : 'Workspace'}</strong>
            <p>
              Tu cuenta ya esta conectada. Completa los datos minimos desde tu espacio para mantener separados auth,
              perfiles y modulos operativos.
            </p>
          </div>

          <Button className="full-width" onClick={() => navigate(destination)}>
            Continuar
          </Button>
        </div>
      </div>
    </AuthLayout>
  )
}

export default Onboarding
