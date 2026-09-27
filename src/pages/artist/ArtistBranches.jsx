import { useEffect, useState } from 'react'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Input from '../../components/Input'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import { fetchArtistBranches, saveArtistBranch } from '../../services/artistBranchService'

const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

function createSchedule() {
  return WEEKDAYS.map((day, index) => ({ day, active: index < 6, start: '09:00', end: '18:00' }))
}

function createEmptyBranch() {
  return {
    id: '', name: '', description: '', phone: '',
    location: { address: '', city: '', state: '', postalCode: '', latitude: '', longitude: '' },
    services: [], weeklySchedule: createSchedule(),
  }
}

function ArtistBranches() {
  const [branches, setBranches] = useState([])
  const [draft, setDraft] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const loadBranches = async () => {
    setLoading(true)
    try { setBranches(await fetchArtistBranches()) }
    catch (error) { setMessage(error.message || 'No se pudieron cargar las sucursales.') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    let active = true
    fetchArtistBranches()
      .then((items) => { if (active) setBranches(items) })
      .catch((error) => { if (active) setMessage(error.message || 'No se pudieron cargar las sucursales.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const update = (field, value) => setDraft((current) => ({ ...current, [field]: value }))
  const updateLocation = (field, value) => setDraft((current) => ({ ...current, location: { ...current.location, [field]: value } }))
  const addService = () => setDraft((current) => ({ ...current, services: [...current.services, { id: crypto.randomUUID(), name: '', price: '', durationMinutes: 60 }] }))
  const updateService = (id, field, value) => setDraft((current) => ({ ...current, services: current.services.map((service) => service.id === id ? { ...service, [field]: value } : service) }))
  const removeService = (id) => setDraft((current) => ({ ...current, services: current.services.filter((service) => service.id !== id) }))
  const updateDay = (day, field, value) => setDraft((current) => ({ ...current, weeklySchedule: current.weeklySchedule.map((item) => item.day === day ? { ...item, [field]: value } : item) }))

  const save = async () => {
    setMessage('')
    if (!draft.name.trim() || !draft.location.address.trim() || !draft.location.city.trim() || !draft.location.state.trim()) {
      setMessage('Completa nombre, dirección, ciudad y estado de la sucursal.')
      return
    }
    setSaving(true)
    try {
      await saveArtistBranch(draft)
      await loadBranches()
      setDraft(null)
      setMessage('Sucursal guardada. Sus servicios y horarios permanecen separados del perfil principal.')
      window.dispatchEvent(new Event('studioflow:branches-changed'))
    } catch (error) {
      setMessage(error.message || 'No se pudo guardar la sucursal.')
    } finally { setSaving(false) }
  }

  return (
    <main className="dashboard-grid artist-grid">
      <Card className="wide-card mobile-screen primary-panel">
        <PanelHeader title="Sucursales" eyebrow="Subperfiles" action={<Button size="sm" onClick={() => setDraft(createEmptyBranch())}>Agregar sucursal</Button>} />
        <p className="branch-intro">Cada sucursal tiene ubicación, servicios y horarios propios. Los cambios no modifican tu perfil principal ni otras sucursales.</p>
        {message && <StatusPill tone={message.includes('No se') || message.includes('Completa') ? 'warm' : 'success'}>{message}</StatusPill>}
        <div className="artist-branch-list">
          {loading && <div className="list-row"><strong>Cargando sucursales...</strong></div>}
          {!loading && branches.length === 0 && <div className="list-row"><div><strong>Sin sucursales adicionales</strong><small>Agrega otra ubicación para crear su subperfil.</small></div></div>}
          {branches.map((branch) => (
            <article className="artist-branch-card" key={branch.id}>
              <div><span className="eyebrow">Sucursal</span><h3>{branch.name}</h3><p>{[branch.location?.address, branch.location?.city, branch.location?.state].filter(Boolean).join(', ')}</p><small>{branch.services?.length || 0} servicios configurados</small></div>
              <Button variant="ghost" size="sm" onClick={() => setDraft({ ...branch, weeklySchedule: branch.weeklySchedule?.length ? branch.weeklySchedule : createSchedule() })}>Abrir subperfil</Button>
            </article>
          ))}
        </div>
      </Card>

      {draft && <Card className="wide-card mobile-screen branch-editor-card">
        <PanelHeader title={draft.id ? draft.name : 'Nueva sucursal'} eyebrow="Perfil independiente" action={<Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Cerrar</Button>} />
        <section className="branch-editor-section"><h3>Información y ubicación</h3>
          <Input label="Nombre de la sucursal" value={draft.name} onChange={(event) => update('name', event.target.value)} />
          <Input label="Descripción" value={draft.description} onChange={(event) => update('description', event.target.value)} />
          <Input label="Celular" value={draft.phone} onChange={(event) => update('phone', event.target.value)} />
          <Input label="Dirección" value={draft.location.address} onChange={(event) => updateLocation('address', event.target.value)} />
          <div className="location-form-grid"><Input label="Ciudad" value={draft.location.city} onChange={(event) => updateLocation('city', event.target.value)} /><Input label="Estado" value={draft.location.state} onChange={(event) => updateLocation('state', event.target.value)} /></div>
          <div className="location-form-grid"><Input label="Código postal" value={draft.location.postalCode} onChange={(event) => updateLocation('postalCode', event.target.value)} /><Input label="Latitud" value={draft.location.latitude ?? ''} onChange={(event) => updateLocation('latitude', event.target.value)} /></div>
          <Input label="Longitud" value={draft.location.longitude ?? ''} onChange={(event) => updateLocation('longitude', event.target.value)} />
        </section>

        <section className="branch-editor-section"><div className="branch-section-heading"><h3>Servicios de esta sucursal</h3><Button size="sm" variant="ghost" onClick={addService}>Agregar servicio</Button></div>
          <div className="branch-services-list">{draft.services.map((service) => <div className="branch-service-row" key={service.id}><Input label="Servicio" value={service.name} onChange={(event) => updateService(service.id, 'name', event.target.value)} /><Input label="Precio" type="number" value={service.price} onChange={(event) => updateService(service.id, 'price', event.target.value)} /><Input label="Duración (min)" type="number" value={service.durationMinutes} onChange={(event) => updateService(service.id, 'durationMinutes', event.target.value)} /><button type="button" aria-label="Quitar servicio" onClick={() => removeService(service.id)}>×</button></div>)}</div>
        </section>

        <section className="branch-editor-section"><h3>Horarios de esta sucursal</h3><div className="branch-schedule-list">{draft.weeklySchedule.map((item) => <div className="branch-schedule-row" key={item.day}><label><input type="checkbox" checked={item.active} onChange={(event) => updateDay(item.day, 'active', event.target.checked)} /> {item.day}</label>{item.active ? <><input type="time" value={item.start} onChange={(event) => updateDay(item.day, 'start', event.target.value)} /><input type="time" value={item.end} onChange={(event) => updateDay(item.day, 'end', event.target.value)} /></> : <span>No disponible</span>}</div>)}</div></section>
        <Button className="full-width" disabled={saving} onClick={save}>{saving ? 'Guardando...' : 'Guardar subperfil de sucursal'}</Button>
      </Card>}
    </main>
  )
}

export default ArtistBranches
