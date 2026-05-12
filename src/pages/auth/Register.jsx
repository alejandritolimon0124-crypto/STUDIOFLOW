import { useNavigate } from 'react-router-dom'
import AuthLayout from '../../layouts/AuthLayout'
import Button from '../../components/Button'
import Input from '../../components/Input'
import { paths } from '../../routes/paths'

function Register() {
  const navigate = useNavigate()

  return (
    <AuthLayout mode="register">
      <div className="auth-card">
        <span className="eyebrow">Nuevo estudio</span>
        <h2>Crea tu cuenta</h2>
        <p>Prepara tu espacio digital para reservas, servicios y clientas.</p>

        <form className="form-stack">
          <Input label="Nombre del estudio" type="text" placeholder="Valeria Moon Studio" />
          <Input label="Correo" type="email" placeholder="contacto@tustudio.mx" />
          <label className="input-field">
            <span>Tipo de perfil</span>
            <select defaultValue="artist">
              <option value="artist">Artista independiente</option>
              <option value="studio">Estudio de belleza</option>
              <option value="client">Cliente</option>
            </select>
          </label>
          <Button className="full-width" onClick={() => navigate(paths.artistAgenda)}>
            Crear workspace
          </Button>
        </form>
      </div>
    </AuthLayout>
  )
}

export default Register
