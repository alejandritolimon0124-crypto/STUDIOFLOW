import { useEffect, useMemo, useState } from 'react'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Input from '../../components/Input'
import MetricCard from '../../components/MetricCard'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import { useApp } from '../../contexts/appContextCore'
import { paths } from '../../routes/paths'
import { filterByStudioAccess, ROLES } from '../../modules/permissions/rolePermissions'
import {
  deriveMembershipsFromLegacyData,
  getArtistsForStudio,
  getStudiosForArtist,
} from '../../modules/entities/entitySelectors'
import {
  fetchStudioOwnerAppointmentClients,
  fetchStudioOwnerClientAppointments,
  createStudioOwnerAppointment,
} from '../../services/studioOwnerAppointmentService'
import {
  fetchStudioMembershipOperations,
  fetchStudioMemberships,
} from '../../services/studioMembershipService'
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
    adminClientsError,
    toggleManagedClientStatus,
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
  const [inlinePanel, setInlinePanel] = useState({ clientId: '', mode: '' })
  const [studioMemberships, setStudioMemberships] = useState([])
  const [membershipOperationsById, setMembershipOperationsById] = useState({})
  const [ownerAppointmentDraft, setOwnerAppointmentDraft] = useState({
    membershipId: '',
    serviceOfferingId: '',
    availabilitySlotId: '',
    notes: '',
  })
  const [isOwnerAppointmentSaving, setIsOwnerAppointmentSaving] = useState(false)
  const [ownerAppointmentFeedback, setOwnerAppointmentFeedback] = useState({ tone: 'neutral', message: '' })
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

    if (String(nextQuery || '').trim().length < 2) {
      setRealClientResults([])
      setClientSearchStatus('Busca una clienta por nombre, correo o celular para ver coincidencias.')
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

  const filteredClients = useMemo(() => {
    if (isStudioOwnerContext) {
      if (query.trim().length < 2) return []
      return realClientResults.slice(0, 5)
    }

    return filterByStudioAccess(adminState.clients, session.user, accessibleClientStudioIds)
        .filter((client) => {
          const searchable = `${client.name} ${client.email} ${client.phone}`.toLowerCase()
          return searchable.includes(query.toLowerCase())
        })
        .sort((firstClient, secondClient) => {
          const firstDate = firstClient.lastAppointmentAt || firstClient.lastVisit || firstClient.createdAt || ''
          const secondDate = secondClient.lastAppointmentAt || secondClient.lastVisit || secondClient.createdAt || ''
          return String(secondDate).localeCompare(String(firstDate))
        })
        .slice(0, 5)
  }, [accessibleClientStudioIds, adminState.clients, isStudioOwnerContext, query, realClientResults, session.user])
  const activeClientsCount = adminState.clients.filter((client) => client.status === 'Activo').length
  const suspendedClientsCount = adminState.clients.filter((client) => client.status !== 'Activo').length
  const selectedMembershipOperations = membershipOperationsById[ownerAppointmentDraft.membershipId] || null
  const selectedOwnerServices = (selectedMembershipOperations?.services || []).filter((service) => ['active', 'activo'].includes(String(service.status || '').toLowerCase()))
  const selectedOwnerSlots = (selectedMembershipOperations?.upcomingSlots || []).filter((slot) => slot.status === 'available')

  useEffect(() => {
    if (!isStudioOwnerContext || !activeStudioId) return undefined

    let isActive = true

    fetchStudioMemberships(activeStudioId)
      .then((payload) => {
        if (!isActive) return
        const activeMemberships = payload.memberships.filter((membership) => membership.active)
        setStudioMemberships(activeMemberships)
        if (!ownerAppointmentDraft.membershipId && activeMemberships[0]?.id) {
          setOwnerAppointmentDraft((currentDraft) => ({ ...currentDraft, membershipId: activeMemberships[0].id }))
        }
      })
      .catch(() => {
        if (isActive) setStudioMemberships([])
      })

    return () => {
      isActive = false
    }
  }, [activeStudioId, isStudioOwnerContext, ownerAppointmentDraft.membershipId])

  useEffect(() => {
    if (!activeStudioId || !ownerAppointmentDraft.membershipId || membershipOperationsById[ownerAppointmentDraft.membershipId]) return undefined

    let isActive = true
    fetchStudioMembershipOperations({ studioId: activeStudioId, membershipId: ownerAppointmentDraft.membershipId })
      .then((operations) => {
        if (!isActive) return
        setMembershipOperationsById((currentOperations) => ({
          ...currentOperations,
          [ownerAppointmentDraft.membershipId]: operations,
        }))
      })
      .catch(() => null)

    return () => {
      isActive = false
    }
  }, [activeStudioId, membershipOperationsById, ownerAppointmentDraft.membershipId])

  useEffect(() => {
    if (!ownerAppointmentDraft.serviceOfferingId && selectedOwnerServices[0]?.id) {
      setOwnerAppointmentDraft((currentDraft) => ({ ...currentDraft, serviceOfferingId: selectedOwnerServices[0].id }))
    }
  }, [ownerAppointmentDraft.serviceOfferingId, selectedOwnerServices])

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

  const closeInlinePanel = () => {
    setInlinePanel({ clientId: '', mode: '' })
    setProfileClient(null)
    setAppointmentPanel({
      client: null,
      mode: '',
      items: [],
      isLoading: false,
      message: '',
    })
  }

  const openInlineAppointmentInfo = (client) => {
    setProfileClient(null)
    setAppointmentPanel({
      client: null,
      mode: '',
      items: [],
      isLoading: false,
      message: '',
    })
    setInlinePanel((current) => (
      current.clientId === client.id && current.mode === 'appointment'
        ? { clientId: '', mode: '' }
        : { clientId: client.id, mode: 'appointment' }
    ))
    setOwnerAppointmentFeedback({ tone: 'neutral', message: '' })
  }

  const updateOwnerAppointmentDraft = (patch) => {
    setOwnerAppointmentDraft((currentDraft) => ({
      ...currentDraft,
      ...patch,
      ...(Object.prototype.hasOwnProperty.call(patch, 'membershipId') ? { serviceOfferingId: '', availabilitySlotId: '' } : {}),
      ...(Object.prototype.hasOwnProperty.call(patch, 'serviceOfferingId') ? { availabilitySlotId: '' } : {}),
    }))
    setOwnerAppointmentFeedback({ tone: 'neutral', message: '' })
  }

  const saveInlineOwnerAppointment = async (client) => {
    if (!activeStudioId || !client?.id || !ownerAppointmentDraft.membershipId || !ownerAppointmentDraft.serviceOfferingId || !ownerAppointmentDraft.availabilitySlotId) {
      setOwnerAppointmentFeedback({ tone: 'warm', message: 'Selecciona artista, servicio y horario disponible.' })
      return
    }

    setIsOwnerAppointmentSaving(true)
    setOwnerAppointmentFeedback({ tone: 'neutral', message: '' })

    try {
      await createStudioOwnerAppointment({
        studioId: activeStudioId,
        membershipId: ownerAppointmentDraft.membershipId,
        serviceOfferingId: ownerAppointmentDraft.serviceOfferingId,
        availabilitySlotId: ownerAppointmentDraft.availabilitySlotId,
        clientId: client.id,
        clientName: client.name,
        clientPhone: client.phone,
        clientEmail: client.email,
        notes: ownerAppointmentDraft.notes,
      })
      const operations = await fetchStudioMembershipOperations({ studioId: activeStudioId, membershipId: ownerAppointmentDraft.membershipId })
      setMembershipOperationsById((currentOperations) => ({ ...currentOperations, [ownerAppointmentDraft.membershipId]: operations }))
      setOwnerAppointmentFeedback({ tone: 'success', message: 'Cita generada con exito.' })
      setOwnerAppointmentDraft((currentDraft) => ({ ...currentDraft, availabilitySlotId: '', notes: '' }))
      await openClientAppointments(client, 'upcoming')
    } catch (error) {
      setOwnerAppointmentFeedback({ tone: 'warm', message: error.message || 'No se pudo generar la cita.' })
    } finally {
      setIsOwnerAppointmentSaving(false)
    }
  }

  const openInlineProfile = (client) => {
    setAppointmentPanel({
      client: null,
      mode: '',
      items: [],
      isLoading: false,
      message: '',
    })
    setProfileClient(client)
    setInlinePanel((current) => (
      current.clientId === client.id && current.mode === 'profile'
        ? { clientId: '', mode: '' }
        : { clientId: client.id, mode: 'profile' }
    ))
  }

  const openClientAppointments = async (client, mode) => {
    if (!isStudioOwnerContext || !activeStudioId || !client?.id) return
    if (inlinePanel.clientId === client.id && inlinePanel.mode === mode) {
      closeInlinePanel()
      return
    }

    setAppointmentPanel({
      client,
      mode,
      items: [],
      isLoading: true,
      message: '',
    })
    setProfileClient(null)
    setInlinePanel((current) => (
      current.clientId === client.id && current.mode === mode
        ? { clientId: '', mode: '' }
        : { clientId: client.id, mode }
    ))

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
      {!isStudioOwnerContext && (
        <>
        <MetricCard label="Clientas activas" value={activeClientsCount} trend={`${suspendedClientsCount} suspendidas`} tone={suspendedClientsCount ? 'warm' : 'success'} />
        <MetricCard label="Clientas suspendidas" value={suspendedClientsCount} trend={`${activeClientsCount} activas`} tone={suspendedClientsCount ? 'warm' : 'neutral'} />
        </>
      )}

        <Card className="wide-card mobile-screen primary-panel">
          <PanelHeader
            title="Clientes"
            eyebrow={isStudioOwnerContext ? 'Clientas del estudio' : 'Suspension y reactivacion'}
            action={isStudioOwnerContext ? <Button disabled={!isStudioOwnerContext} size="sm" onClick={() => openOwnerAppointmentFlow()}>Nueva clienta</Button> : null}
          />
          <div className="admin-search">
            <div className="location-form-grid">
              <Input
                label="Buscar clienta"
                type="search"
                placeholder="Nombre, correo o celular..."
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setClientSearchStatus('')
                  setRealClientResults([])
                  closeInlinePanel()
                }}
              />
              <div style={{ alignSelf: 'end' }}>
                <Button disabled={!isStudioOwnerContext || isSearchingClients} size="sm" onClick={() => searchClients()}>
                  {isSearchingClients ? 'Buscando...' : 'Buscar'}
                </Button>
              </div>
            </div>
          </div>
          {adminClientsError && <small className="form-error">{adminClientsError}</small>}
          <div className="master-list">
            {filteredClients.length === 0 ? (
              <article className="master-row">
                <div>
                  <strong>{clientSearchStatus || 'Este estudio aun no tiene clientas con citas.'}</strong>
                  <small>Las clientas apareceran aqui cuando existan citas reales dentro del estudio activo.</small>
                </div>
              </article>
            ) : filteredClients.map((client) => (
              <div className="client-result-block" key={client.id || client.name}>
                <article className="master-row">
                  <div>
                    <strong>{client.name}</strong>
                    <small>{client.email || client.phone || 'Sin contacto'} / {Number(client.appointments) || 0} citas</small>
                  </div>
                  <StatusPill tone={isStudioOwnerContext ? 'neutral' : client.status === 'Activo' ? 'success' : 'warm'}>
                    {isStudioOwnerContext ? 'Clienta' : client.status === 'Activo' ? 'Activo' : 'Suspendido'}
                  </StatusPill>
                  <div className="row-actions">
                    {!isStudioOwnerContext && (
                      <>
                        <button disabled={client.status !== 'Activo'} type="button" onClick={() => toggleManagedClientStatus(client.id)}>Suspender</button>
                        <button disabled={client.status === 'Activo'} type="button" onClick={() => toggleManagedClientStatus(client.id)}>Reactivar</button>
                      </>
                    )}
                    {isStudioOwnerContext && (
                      <button type="button" onClick={() => openInlineAppointmentInfo(client)}>Generar cita</button>
                    )}
                    <button type="button" onClick={() => openClientAppointments(client, 'upcoming')}>Proximas citas</button>
                    <button type="button" onClick={() => openClientAppointments(client, 'history')}>Ver historial</button>
                    <button type="button" onClick={() => openInlineProfile(client)}>Ver perfil</button>
                  </div>
                </article>
                {isStudioOwnerContext && inlinePanel.clientId === client.id && (
                  <div className="client-inline-info-panel">
                    <PanelHeader
                      title={inlinePanel.mode === 'appointment' ? 'Generar cita' : inlinePanel.mode === 'upcoming' ? 'Proximas citas' : inlinePanel.mode === 'history' ? 'Historial cliente' : 'Perfil cliente'}
                      eyebrow={client.name}
                      action={<Button size="sm" variant="ghost" onClick={closeInlinePanel}>Ocultar info</Button>}
                    />
                    {ownerAppointmentFeedback.message && (
                      <div className={`list-row elevated-row ${ownerAppointmentFeedback.tone === 'success' ? 'booking-success-row' : 'booking-error-row'}`}>
                        <div>
                          <strong>{ownerAppointmentFeedback.tone === 'success' ? 'Cita generada con exito' : 'Aviso'}</strong>
                          <small>{ownerAppointmentFeedback.message}</small>
                        </div>
                        <StatusPill tone={ownerAppointmentFeedback.tone === 'success' ? 'success' : 'neutral'}>Cita</StatusPill>
                      </div>
                    )}
                    {inlinePanel.mode === 'appointment' && (
                      <div className="form-stack compact-form">
                        <div className="list-row elevated-row">
                          <div>
                            <strong>{client.name}</strong>
                            <small>{client.phone || client.email || 'Sin contacto'} / clienta seleccionada</small>
                          </div>
                          <StatusPill tone="success">Lista</StatusPill>
                        </div>
                        <section className="owner-artist-picker" aria-label="Seleccion de artista">
                          <div>
                            <span className="eyebrow">Artista asignada</span>
                            <h4>Selecciona quien atiende la cita</h4>
                          </div>
                          <div className="owner-artist-grid owner-artist-grid-highlight">
                            {studioMemberships.length > 0 ? studioMemberships.map((membership) => {
                              const isSelected = ownerAppointmentDraft.membershipId === membership.id
                              const photoUrl = membership.studioPhotoUrl || membership.photoUrl || ''

                              return (
                                <button
                                  className={`owner-artist-card${isSelected ? ' active' : ''}`}
                                  key={membership.id}
                                  type="button"
                                  onClick={() => updateOwnerAppointmentDraft({ membershipId: membership.id })}
                                >
                                  <span className="owner-artist-avatar">
                                    {photoUrl ? <img src={photoUrl} alt={`Foto de ${membership.name}`} /> : String(membership.name || 'A').slice(0, 2)}
                                  </span>
                                  <strong>{membership.name}</strong>
                                  <small>{membership.email || 'Artista del estudio'}</small>
                                </button>
                              )
                            }) : (
                              <div className="list-row elevated-row">
                                <div>
                                  <strong>Sin artistas activas</strong>
                                  <small>Vincula artistas al estudio para generar citas.</small>
                                </div>
                              </div>
                            )}
                          </div>
                        </section>
                        <label className="input-field">
                          <span>Servicio</span>
                          <select
                            value={ownerAppointmentDraft.serviceOfferingId}
                            onChange={(event) => updateOwnerAppointmentDraft({ serviceOfferingId: event.target.value })}
                          >
                            <option value="">Selecciona servicio</option>
                            {selectedOwnerServices.map((service) => (
                              <option key={service.id} value={service.id}>{service.name} / {service.duration || `${service.durationMinutes} min`}</option>
                            ))}
                          </select>
                        </label>
                        <label className="input-field">
                          <span>Horario disponible</span>
                          <select
                            value={ownerAppointmentDraft.availabilitySlotId}
                            onChange={(event) => updateOwnerAppointmentDraft({ availabilitySlotId: event.target.value })}
                          >
                            <option value="">Selecciona horario</option>
                            {selectedOwnerSlots.map((slot) => (
                              <option key={slot.id} value={slot.id}>{slot.date} / {slot.time} - {slot.end}</option>
                            ))}
                          </select>
                        </label>
                        <label className="input-field">
                          <span>Notas</span>
                          <textarea
                            rows="3"
                            value={ownerAppointmentDraft.notes}
                            onChange={(event) => updateOwnerAppointmentDraft({ notes: event.target.value })}
                          />
                        </label>
                        <div className="row-actions">
                          <Button className="full-width appointment-primary-action" disabled={isOwnerAppointmentSaving} onClick={() => saveInlineOwnerAppointment(client)}>
                            {isOwnerAppointmentSaving ? 'Guardando cita...' : 'Guardar cita'}
                          </Button>
                        </div>
                      </div>
                    )}
                    {(inlinePanel.mode === 'upcoming' || inlinePanel.mode === 'history') && (
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
                    )}
                    {inlinePanel.mode === 'profile' && profileClient && (
                      <div className="form-stack compact-form">
                        <Input label="Nombre" value={profileClient.name} onChange={(event) => setProfileClient({ ...profileClient, name: event.target.value })} />
                        <Input label="Correo" value={profileClient.email} onChange={(event) => setProfileClient({ ...profileClient, email: event.target.value })} />
                        <Input label="Telefono" value={profileClient.phone} onChange={(event) => setProfileClient({ ...profileClient, phone: event.target.value })} />
                        <label className="input-field">
                          <span>Notas</span>
                          <textarea value={profileClient.notes} onChange={(event) => setProfileClient({ ...profileClient, notes: event.target.value })} rows="3" />
                        </label>
                        <div className="row-actions">
                          <button type="button" onClick={saveClientProfile}>Guardar cambios</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>

        {profileClient && !isStudioOwnerContext && (
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

        {appointmentPanel.client && !isStudioOwnerContext && (
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
