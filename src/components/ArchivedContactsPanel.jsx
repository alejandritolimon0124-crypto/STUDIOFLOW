import { useEffect, useState } from 'react'
import { ArchiveRestore, RotateCcw } from 'lucide-react'
import { fetchArchivedManualContacts, restoreManualClientContact } from '../services/artistClientService'
import './archive-contact-dialog.css'

function ArchivedContactsPanel({ studioId = null, onRestored }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(false)
  const [restoringId, setRestoringId] = useState('')
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    if (!open) return undefined
    let active = true
    const timer = setTimeout(() => {
      setLoading(true)
      setError('')
      fetchArchivedManualContacts({ studioId, query })
        .then((result) => { if (active) setContacts(result) })
        .catch((requestError) => { if (active) setError(requestError.message || 'No se pudieron cargar los contactos archivados.') })
        .finally(() => { if (active) setLoading(false) })
    }, query ? 250 : 0)
    return () => { active = false; clearTimeout(timer) }
  }, [open, query, studioId])

  const restore = async (contact) => {
    setRestoringId(contact.id)
    setError('')
    setFeedback('')
    try {
      await restoreManualClientContact({ clientId: contact.id, studioId })
      setContacts((current) => current.filter((item) => item.id !== contact.id))
      setFeedback(`${contact.name} volvió a tus búsquedas.`)
      onRestored?.()
    } catch (restoreError) {
      setError(restoreError.message || 'No se pudo restaurar el contacto.')
    } finally {
      setRestoringId('')
    }
  }

  return (
    <section className="archived-contacts" aria-label="Contactos archivados">
      <button className="archived-contacts-toggle" type="button" aria-expanded={open} onClick={() => { setLoading(!open); setOpen((current) => !current); setFeedback('') }}>
        <ArchiveRestore size={17} aria-hidden="true" /> {open ? 'Ocultar archivados' : 'Contactos archivados'}
      </button>
      {open && (
        <div className="archived-contacts-content">
          <p>Estos contactos no aparecen al buscar ni al agendar. Puedes restaurarlos aquí sin perder sus citas anteriores.</p>
          <label className="input-field">
            <span>Buscar entre archivados</span>
            <input type="search" value={query} placeholder="Nombre, celular o correo" onChange={(event) => { setLoading(true); setQuery(event.target.value) }} />
          </label>
          {feedback && <p className="archived-contacts-feedback" role="status">{feedback}</p>}
          {error && <p className="archive-contact-error" role="alert">{error}</p>}
          {loading && <p role="status">Buscando contactos...</p>}
          {!loading && !error && contacts.length === 0 && <p>No hay contactos archivados que coincidan.</p>}
          {!loading && contacts.map((contact) => (
            <div className="archived-contact-row" key={contact.id}>
              <div>
                <strong>{contact.name}</strong>
                <small>{contact.phone || contact.email || 'Sin datos de contacto'}</small>
              </div>
              <button type="button" disabled={Boolean(restoringId)} onClick={() => restore(contact)}>
                <RotateCcw size={16} aria-hidden="true" /> {restoringId === contact.id ? 'Restaurando...' : 'Restaurar'}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export default ArchivedContactsPanel
