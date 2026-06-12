import { useMemo, useState } from 'react'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Input from '../../components/Input'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import { useApp } from '../../contexts/appContextCore'
import { filterByStudioAccess, hasPermission, permissions, ROLES } from '../../modules/permissions/rolePermissions'
import {
  deriveMembershipsFromLegacyData,
  getArtistsForStudio,
  getStudiosForArtist,
} from '../../modules/entities/entitySelectors'

const uniqueById = (items = []) => Array.from(new Map(items.filter(Boolean).map((item) => [item.id, item])).values())

function AdminClients() {
  const {
    adminState,
    session,
    toggleManagedClientStatus,
    updateManagedClientProfile,
  } = useApp()
  const [query, setQuery] = useState('')
  const [profileClient, setProfileClient] = useState(null)
  const [historyClient, setHistoryClient] = useState(null)
  const normalizedRole = session.user?.role === 'admin' ? ROLES.PLATFORM_OWNER : session.user?.role
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

  const filteredClients = useMemo(
    () =>
      filterByStudioAccess(adminState.clients, session.user, accessibleClientStudioIds).filter((client) => {
        const searchable = `${client.name} ${client.segment} ${client.status}`.toLowerCase()
        return searchable.includes(query.toLowerCase())
      }),
    [accessibleClientStudioIds, adminState.clients, query, session.user],
  )
  const canSeeStudioRevenue = hasPermission(session.user, permissions.STUDIO_REVENUE)

  const saveClientProfile = async () => {
    if (!profileClient) return

    await updateManagedClientProfile(profileClient.id, profileClient)
    setProfileClient(null)
  }

  return (
    <main className="dashboard-grid admin-grid">
        <Card className="wide-card mobile-screen primary-panel">
          <PanelHeader title="Gestion de clientes" eyebrow="Admin" action={<Button size="sm">Nueva clienta</Button>} />
          <div className="admin-search">
            <Input
              label="Buscar clienta"
              type="search"
              placeholder="Nombre, segmento o estado..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="master-list">
            {filteredClients.length === 0 ? (
              <article className="master-row">
                <div>
                  <strong>No hay clientas en este scope.</strong>
                  <small>Cuando Supabase devuelva clientas reales, apareceran aqui.</small>
                </div>
              </article>
            ) : filteredClients.map((client) => (
              <article className="master-row" key={client.name}>
                <div>
                  <strong>{client.name}</strong>
                  <small>{client.segment} / {client.appointments} citas{canSeeStudioRevenue ? ` / ${client.spend}` : ''}</small>
                </div>
                <StatusPill tone={client.status === 'Activo' ? 'success' : 'neutral'}>{client.status}</StatusPill>
                <div className="row-actions">
                  <button type="button" onClick={() => toggleManagedClientStatus(client.id)}>
                    {client.status === 'Activo' ? 'Inactivar' : 'Activar'}
                  </button>
                  <button type="button" onClick={() => setHistoryClient(client)}>Ver historial</button>
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
              <Input
                label="Segmento"
                value={profileClient.segment}
                onChange={(event) => setProfileClient({ ...profileClient, segment: event.target.value })}
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

        {historyClient && (
          <Card className="mobile-screen">
            <PanelHeader title="Historial cliente" eyebrow={historyClient.name} />
            <div className="compact-list">
              {(historyClient.history || []).map((item) => (
                <div className="list-row elevated-row" key={item.id}>
                  <div>
                    <strong>{item.service}</strong>
                    <small>{item.artist} / {item.date}</small>
                  </div>
                  <StatusPill tone="success">{item.status}</StatusPill>
                </div>
              ))}
            </div>
            <div className="row-actions">
              <button type="button" onClick={() => setHistoryClient(null)}>Cerrar historial</button>
            </div>
          </Card>
        )}
    </main>
  )
}

export default AdminClients
