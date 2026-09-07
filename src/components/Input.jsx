import { useId, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

function Input({ label, helper, className = '', type, id, ...props }) {
  const generatedId = useId()
  const inputId = id || generatedId
  const [passwordVisible, setPasswordVisible] = useState(false)
  const isPassword = type === 'password'
  const visibilityLabel = passwordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'
  return (
    <label className={`input-field ${className}`} htmlFor={inputId}>
      <span>{label}</span>
      {isPassword ? (
        <span className="password-input-wrapper">
          <input {...props} id={inputId} type={passwordVisible ? 'text' : 'password'} />
          <button
            type="button"
            className="password-visibility-toggle"
            aria-label={visibilityLabel}
            aria-controls={inputId}
            aria-pressed={passwordVisible}
            title={visibilityLabel}
            disabled={props.disabled}
            onClick={() => setPasswordVisible((visible) => !visible)}
          >
            {passwordVisible ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
          </button>
        </span>
      ) : <input {...props} id={inputId} type={type} />}
      {helper && <small>{helper}</small>}
    </label>
  )
}

export default Input
