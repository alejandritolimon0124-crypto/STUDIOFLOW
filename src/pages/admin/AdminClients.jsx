import { useEffect, useMemo, useState } from 'react'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Input from '../../components/Input'
import PanelHeader from '../../components/PanelHeader'
import { useApp } from '../../contexts/appContextCore'
import { paths } from '../../routes/paths'
import { filterByStudioAccess, hasPermission, permissions, ROLES } from '../../modules/permissions/rolePermissions'
import {
  deriveMembershipsFromLegacyData,
  getArtistsForStudio,
  getStudiosForArtist,
} from '../../modules/entities/entitySelectors'
import {
  fetchStudioOwnerAppointmentClients,
  fetchStudioOwnerClientAppointments,
} from '../../services/studioOwnerAppointmentService'
import { useNavigate } from 'react-router-dom'

const uniqueById = (items = []) => Array.from(new Map(items.filter(Boolean).map((item) => [item.id, item])).values())

function formatAppointmentDate(value = '') {
  if (!value) return 'Fecha por confirmar'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10)
  return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })
}

function formatAppointmentTime(value = '') {
  if (!value) return 'Hora por confirmar'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value).slice(11, 16)
  return date.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })
}

function AdminClients() {
  const navigate = useNavigate()
  const {
    adminState,
    session,
    updateManagedClientProfile,
  } = useApp()
  const [query, setQuery] = useState('')
  const [realClientResults, setRealClientResults] = useState([])
  const [isSearchingClients, setIsSearchingClients] = useState(false)
  const [clientSearchStatus, setClientSearchStatus] = useState('')
  const [profileClient, setProfileClient] = useState(null)
  const [appointmentPanel, setAppointmentPanel] = useState({
    client: null,
    mode: '',
    items: [],
    isLoading: false,
    message: '',
  })
  const studioOwnerAssignments = (session.roles || []).filter((assignment) => (
    assignment.role === ROLES.STUDIO_OWNER
    && (assignment.status || 'active') !== 'inactive'
    && (assignment.status || 'active') !== 'revoked'
    && (assignment.studioId || assignment.studio_id)
  ))
  const primaryStudioOwnerAssignment = studioOwnerAssignments[0]
  const activeStudioId = session.activeSessionContext?.studioId
    || session.activeSessionContext?.studio_id
    || session.user?.studioId
    || session.user?.studio_id
    || primaryStudioOwnerAssignment?.studioId
    || primaryStudioOwnerAssignment?.studio_id
    || null
  const hasActiveStudioOwnerAssignment = studioOwnerAssignments.some((assignment) => (
    (assignment.studioId || assignment.studio_id) === activeStudioId
  ))
  const isStudioOwnerContext = Boolean(
    activeStudioId
    && (
      session.activeSessionContext?.role === ROLES.STUDIO_OWNER
      || session.activeSessionContext?.role === 'studio_owner'
      || session.user?.role === ROLES.STUDIO_OWNER
      || hasActiveStudioOwnerAssignment
    ),
  )
  const normalizedRole = isStudioOwnerContext
    ? ROLES.STUDIO_OWNER
    : session.user?.role === 'admin' ? ROLES.PLATFORM_OWNER : session.user?.role
  const isPlatformOwner = normalizedRole === ROLES.PLATFORM_OWNER
  const artistStudioMemberships = useMemo(
    () => deriveMembershipsFromLegacyData({ artists: adminState.artists }),
    [adminState.artists],
  )
  const artistsOwnedByUser = useMemo(
    () => adminState.artists.filter((artist) => artist.owner === session.user?.name || artist.name === session.user?.name),
    [adminState.artists, session.user?.name],
  )
  const accessibleStudios = useMemo(
    () => (
      isPlatformOwner
        ? adminState.studios
        : uniqueById(artistsOwnedByUser.flatMap((artist) => getStudiosForArtist({
          artistId: artist.id,
          studios: adminState.studios,
          artistStudioMemberships,
        })))
    ),
    [adminState.studios, artistStudioMemberships, artistsOwnedByUser, isPlatformOwner],
  )
  const accessibleStudioIds = accessibleStudios.map((studio) => studio.id)
  const accessibleArtists = useMemo(
    () => (
      isPlatformOwner
        ? adminState.artists
        : uniqueById(accessibleStudioIds.flatMap((studioId) => getArtistsForStudio({
          studioId,
          artists: adminState.artists,
          artistStudioMemberships,
        })))
    ),
    [accessibleStudioIds, adminState.artists, artistStudioMemberships, isPlatformOwner],
  )
  const accessibleClientStudioIds = isPlatformOwner
    ? accessibleStudioIds
    : uniqueById(accessibleArtists.flatMap((artist) => getStudiosForArtist({
      artistId: artist.id,
      studios: adminState.studios,
      artistStudioMemberships,
    }))).map((studio) => studio.id)

  const searchClients = async (nextQuery = query) => {
    if (!isStudioOwnerContext) return
    if (!activeStudioId) {
      setRealClientResults([])
      setClientSearchStatus('No hay un estudio activo resuelto.')
      return
    }

    setIsSearchingClients(true)
    setClientSearchStatus('')

    try {
      const clients = await fetchStudioOwnerAppointmentClients({
        studioId: activeStudioId,
        query: nextQuery,
        limit: 5,
      })
      setRealClientResults(clients)
      setClientSearchStatus(clients.length === 0
        ? nextQuery
          ? 'No se encontraron clientas con ese nombre o correo en este estudio.'
          : 'Este estudio aun no tiene clientas con citas.'
        : '')
    } catch (error) {
      setRealClientResults([])
      setClientSearchStatus(error.message || 'No se pudo buscar clientas.')
    } finally {
      setIsSearchingClients(false)
    }
  }

  useEffect(() => {
    if (!isStudioOwnerContext || !activeStudioId) return

    searchClients('')
  }, [activeStudioId, isStudioOwnerContext])

  const filteredClients = useMemo(() => {
    if (isStudioOwnerContext) {
      return realClientResults.slice(0, 5)
    }

    return filterByStudioAccess(adminState.clients, session.user, accessibleClientStudioIds)
        .filter((client) => {
          const searchable = `${client.name} ${client.email}`.toLowerCase()
          return searchable.includes(query.toLowerCase())
        })
        .sort((firstClient, secondClient) => {
          const firstDate = firstClient.lastAppointmentAt || firstClient.lastVisit || firstClient.createdAt || ''
          const secondDate = secondClient.lastAppointmentAt || secondClient.lastVisit || secondClient.createdAt || ''
          return String(secondDate).localeCompare(String(firstDate))
        })
        .slice(0, 5)
  }, [accessibleClientStudioIds, adminState.clients, isStudioOwnerContext, query, realClientResults, session.user])
  const canSeeStudioRevenue = hasPermission(session.user, permissions.STUDIO_REVENUE)

  const openOwnerAppointmentFlow = (client = null) => {
    if (!isStudioOwnerContext) return

    navigate(`${paths.adminStudio}?section=schedule`, {
      state: {
        ownerAppointment: {
          client,
        },
      },
    })
  }

  const saveClientProfile = async () => {
    if (!profileClient) return

    await updateManagedClientProfile(profileClient.id, profileClient)
    setProfileClient(null)
  }

  const openClientAppointments = async (client, mode) => {
    if (!isStudioOwnerContext || !activeStudioId || !client?.id) return

    setAppointmentPanel({
      client,
      mode,
      items: [],
      isLoading: true,
      message: '',
    })

    try {
      const items = await fetchStudioOwnerClientAppointments({
        studioId: activeStudioId,
        clientId: client.id,
        upcomingOnly: mode === 'upcoming',
        limit: mode === 'upcoming' ? 5 : 20,
      })

      setAppointmentPanel({
        client,
        mode,
        items,
        isLoading: false,
        message: items.length === 0
          ? mode === 'upcoming'
            ? 'Esta clienta no tiene proximas citas en este estudio.'
            : 'Esta clienta no tiene historial de citas en este estudio.'
          : '',
      })
    } catch (error) {
      setAppointmentPanel({
        client,
        mode,
        items: [],
        isLoading: false,
        message: error.message || 'No se pudieron cargar las citas de esta clienta.',
      })
    }
  }

  return (
    <main className="dashboard-grid admin-grid">
        <Card className="wide-card mobile-screen primary-panel">
          <PanelHeader
            title="Gestion de clientes"
            eyebrow="Estudio"
            action={<Button disabled={!isStudioOwnerContext} size="sm" onClick={() => openOwnerAppointmentFlow()}>Nueva clienta</Button>}
          />
          <div className="admin-search">
            <div className="location-form-grid">
              <Input
                label="Buscar clienta"
                type="search"
                placeholder="Nombre o correo..."
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setClientSearchStatus('')
                }}
              />
              <div style={{ alignSelf: 'end' }}>
                <Button disabled={!isStudioOwnerContext || isSearchingClients} size="sm" onClick={() => searchClients()}>
                  {isSearchingClients ? 'Buscando...' : 'Buscar'}
                </Button>
              </div>
            </div>
          </div>
          <div className="master-list">
            {filteredClients.length === 0 ? (
              <article className="master-row">
                <div>
                  <strong>{clientSearchStatus || 'Este estudio aun no tiene clientas con citas.'}</strong>
                  <small>Las clientas apareceran aqui cuando existan citas reales dentro del estudio activo.</small>
                </div>
              </article>
            ) : filteredClients.map((client) => (
              <article className="master-row" key={client.id || client.name}>
                <div>
                  <strong>{client.name}</strong>
                  <small>{client.email || client.phone || 'Sin contacto'} / {Number(client.appointments) || 0} citas{canSeeStudioRevenue && client.spend ? ` / ${client.spend}` : ''}</small>
                </div>
                <div className="row-actions">
                  {isStudioOwnerContext && (
                    <button type="button" onClick={() => openOwnerAppointmentFlow(client)}>Generar cita</button>
                  )}
                  <button type="button" onClick={() => openClientAppointments(client, 'upcoming')}>Proximas citas</button>
                  <button type="button" onClick={() => openClientAppointments(client, 'history')}>Ver historial</button>
                  <button type="button" onClick={() => setProfileClient(client)}>Ver perfil</button>
                </div>
              </article>
            ))}
          </div>
        </Card>

        {profileClient && (
          <Card className="mobile-screen">
            <PanelHeader title="Perfil cliente" eyebrow="Edicion" />
            <div className="form-stack compact-form">
              <Input
                label="Nombre"
                value={profileClient.name}
                onChange={(event) => setProfileClient({ ...profileClient, name: event.target.value })}
              />
              <Input
                label="Correo"
                value={profileClient.email}
                onChange={(event) => setProfileClient({ ...profileClient, email: event.target.value })}
              />
              <Input
                label="Telefono"
                value={profileClient.phone}
                onChange={(event) => setProfileClient({ ...profileClient, phone: event.target.value })}
              />
              <label className="input-field">
                <span>Notas</span>
                <textarea
                  value={profileClient.notes}
                  onChange={(event) => setProfileClient({ ...profileClient, notes: event.target.value })}
                  rows="3"
                />
              </label>
              <div className="row-actions">
                <button type="button" onClick={saveClientProfile}>Guardar cambios</button>
                <button type="button" onClick={() => setProfileClient(null)}>Cerrar</button>
              </div>
            </div>
          </Card>
        )}

        {appointmentPanel.client && (
          <Card className="mobile-screen">
            <PanelHeader
              title={appointmentPanel.mode === 'upcoming' ? 'Proximas citas' : 'Historial cliente'}
              eyebrow={appointmentPanel.client.name}
            />
            <div className="compact-list">
              {appointmentPanel.isLoading && (
                <div className="list-row elevated-row">
                  <div>
                    <strong>Cargando citas...</strong>
                    <small>Consultando citas reales del estudio activo.</small>
                  </div>
                </div>
              )}
              {!appointmentPanel.isLoading && appointmentPanel.items.map((item) => (
                <div className="list-row elevated-row" key={item.id}>
                  <div>
                    <strong>{formatAppointmentDate(item.startsAt)} / {formatAppointmentTime(item.startsAt)}</strong>
                    <small>{item.service} / {item.artist}</small>
                  </div>
                  <small>{item.status}</small>
                </div>
              ))}
              {!appointmentPanel.isLoading && appointmentPanel.items.length === 0 && (
                <div className="list-row elevated-row">
                  <div>
                    <strong>{appointmentPanel.message || 'Sin citas en este estudio.'}</strong>
                    <small>Solo se muestran citas vinculadas al estudio activo.</small>
                  </div>
                </div>
              )}
            </div>
            <div className="row-actions">
              <button type="button" onClick={() => setAppointmentPanel({
                client: null,
                mode: '',
                items: [],
                isLoading: false,
                message: '',
              })}>Cerrar</button>
            </div>
          </Card>
        )}
    </main>
  )
}

export default AdminClients
