import AuthLayout from '../../layouts/AuthLayout'
import Button from '../../components/Button'
import { navigateTo } from '../../routes/routerUtils'
import { paths } from '../../routes/paths'

function Register() {
  return (
    <AuthLayout mode="register">
      <div className="auth-card">
        <span className="eyebrow">Nuevo estudio</span>
        <h2>Crea tu cuenta</h2>
        <p>Prepara tu espacio digital para reservas, servicios y clientas.</p>

        <form className="form-stack">
          <label>
            Nombre del estudio
            <input type="text" placeholder="Valeria Moon Studio" />
          </label>
          <label>
            Correo
            <input type="email" placeholder="contacto@tustudio.mx" />
          </label>
          <label>
            Tipo de perfil
            <select defaultValue="artist">
              <option value="artist">Artista independiente</option>
              <option value="studio">Estudio de belleza</option>
              <option value="client">Cliente</option>
            </select>
          </label>
          <Button className="full-width" onClick={() => navigateTo(paths.artist)}>
            Crear workspace
          </Button>
        </form>
      </div>
    </AuthLayout>
  )
}

export default Register
