import { useEffect, useRef } from 'react'
import { Archive, SearchX } from 'lucide-react'
import './archive-contact-dialog.css'

function ArchiveContactDialog({ contact, busy = false, error = '', onCancel, onConfirm }) {
  const cancelRef = useRef(null)
  const confirmRef = useRef(null)

  useEffect(() => {
    if (!contact) return undefined
    const previousFocus = document.activeElement
    cancelRef.current?.focus()
    return () => previousFocus?.focus?.()
  }, [contact])

  if (!contact) return null

  const handleKeyDown = (event) => {
    if (event.key === 'Escape' && !busy) {
      event.preventDefault()
      onCancel()
    }
    if (event.key !== 'Tab') return
    const first = cancelRef.current
    const last = confirmRef.current
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  return (
    <div className="archive-contact-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onCancel()
    }}>
      <section className="archive-contact-dialog" role="alertdialog" aria-modal="true" aria-labelledby="archive-contact-title" aria-describedby="archive-contact-description" onKeyDown={handleKeyDown}>
        <div className="archive-contact-symbol"><SearchX size={24} aria-hidden="true" /></div>
        <span className="archive-contact-eyebrow">CONTACTO MANUAL</span>
        <h2 id="archive-contact-title">¿Quitar de tus búsquedas?</h2>
        <strong className="archive-contact-name">{contact.name}</strong>
        <p id="archive-contact-description">Al archivarlo, este contacto ya no aparecerá cuando busques clientas o generes una cita. Sus citas anteriores se conservarán en el historial; no se borrarán.</p>
        {error && <p className="archive-contact-error" role="alert">{error}</p>}
        <div className="archive-contact-actions">
          <button type="button" ref={cancelRef} disabled={busy} onClick={onCancel}>Conservar contacto</button>
          <button type="button" className="archive-contact-confirm" ref={confirmRef} disabled={busy} onClick={onConfirm}>
            <Archive size={17} aria-hidden="true" /> {busy ? 'Archivando...' : 'Archivar contacto'}
          </button>
        </div>
      </section>
    </div>
  )
}

export default ArchiveContactDialog
