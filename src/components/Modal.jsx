import Button from './Button'

function Modal({ title, description, children, primaryAction = 'Guardar', secondaryAction = 'Cancelar' }) {
  return (
    <div className="modal-shell" aria-label={title}>
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <span className="eyebrow">Vista previa</span>
            <h3>{title}</h3>
          </div>
          <button className="modal-close" type="button" aria-label="Cerrar">x</button>
        </div>
        {description && <p>{description}</p>}
        {children && <div className="modal-body">{children}</div>}
        <div className="modal-actions">
          <Button variant="ghost" size="sm">{secondaryAction}</Button>
          <Button size="sm">{primaryAction}</Button>
        </div>
      </div>
    </div>
  )
}

export default Modal
