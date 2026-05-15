import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthLayout from '../../layouts/AuthLayout'
import BrandLogo from '../../components/BrandLogo'
import Button from '../../components/Button'
import Input from '../../components/Input'
import { paths } from '../../routes/paths'
import { getDefaultStudioStatus, getStudioStatusLabel } from '../../modules/governance/studioGovernance'

function Register() {
  const navigate = useNavigate()
  const [accountType, setAccountType] = useState(null)
  const defaultStudioStatus = getDefaultStudioStatus()

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
              ¿Ya tienes cuenta? Inicia sesión
            </button>
          </div>
        )}

        {accountType === 'client' && (
          <form className="form-stack">
            <Input label="Nombre completo" type="text" placeholder="Mariana Lopez" />
            <Input label="Correo electrónico" type="email" placeholder="mariana@email.com" />
            <Input label="Número celular" type="tel" placeholder="55 1234 5678" />
            <Input label="Crear contraseña" type="password" placeholder="********" />
            <Input label="Confirmar contraseña" type="password" placeholder="********" />

            <Button className="full-width" variant="ghost">Continuar con Google</Button>
            <Button className="full-width" onClick={() => navigate(paths.client)}>Crear cuenta cliente</Button>
            <button className="text-link center-link" type="button" onClick={() => navigate(paths.login)}>
              ¿Ya tienes cuenta? Inicia sesión
            </button>
          </form>
        )}

        {accountType === 'artist' && (
          <form className="form-stack">
            <div className="studio-validation-note">
              <span className="eyebrow">Acceso curado</span>
              <strong>{getStudioStatusLabel(defaultStudioStatus)}</strong>
              <p>Tu estudio entrara a validacion para mantener la calidad premium de Studio Flow.</p>
              <input type="hidden" name="studioStatus" value={defaultStudioStatus} />
            </div>
            <Input label="Nombre artístico o estudio" type="text" placeholder="Valeria Moon Studio" />
            <Input label="Nombre completo" type="text" placeholder="Valeria Hernandez" />
            <Input label="Correo electrónico" type="email" placeholder="contacto@studio.com" />
            <Input label="Número celular" type="tel" placeholder="55 1234 5678" />
            <Input label="Crear contraseña" type="password" placeholder="********" />
            <Input label="Confirmar contraseña" type="password" placeholder="********" />

            <div style={{ borderTop: '1px solid var(--line)', display: 'grid', gap: '14px', paddingTop: '18px' }}>
              <div>
                <span className="eyebrow">Información profesional</span>
                <p style={{ color: 'var(--muted)', fontSize: '14px', lineHeight: 1.45 }}>
                  Datos visibles para preparar tu perfil público más adelante.
                </p>
              </div>

              <Input label="Dirección del estudio" type="text" placeholder="Av. Horacio 123, Polanco" />
              <Input label="Ciudad" type="text" placeholder="Ciudad de México" />

              <div className="input-field">
                <span>Métodos de pago</span>
                <label style={{ alignItems: 'center', display: 'flex', gap: '10px', fontWeight: 700 }}>
                  <input type="checkbox" /> Efectivo
                </label>
                <label style={{ alignItems: 'center', display: 'flex', gap: '10px', fontWeight: 700 }}>
                  <input type="checkbox" /> Transferencia
                </label>
                <label style={{ alignItems: 'center', display: 'flex', gap: '10px', fontWeight: 700 }}>
                  <input type="checkbox" /> Tarjeta
                </label>
              </div>

              <label
                className="input-field"
                style={{
                  border: '1px dashed var(--rose)',
                  borderRadius: '16px',
                  color: 'var(--muted)',
                  padding: '18px',
                  textAlign: 'center',
                }}
              >
                <span>Foto del artista o estudio</span>
                <input type="file" accept="image/*" />
              </label>
            </div>

            <Button className="full-width" onClick={() => navigate(paths.artistAgenda)}>Crear cuenta artista</Button>
            <button className="text-link center-link" type="button" onClick={() => navigate(paths.login)}>
              ¿Ya tienes cuenta? Inicia sesión
            </button>
          </form>
        )}
      </div>
    </AuthLayout>
  )
}

export default Register
