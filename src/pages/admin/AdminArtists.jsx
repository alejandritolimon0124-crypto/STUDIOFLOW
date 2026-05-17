import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../../components/Button'
import Card from '../../components/Card'
import Input from '../../components/Input'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import { useApp } from '../../contexts/appContextCore'
import { paths } from '../../routes/paths'
import { filterByStudioAccess, hasPermission, permissions } from '../../modules/permissions/rolePermissions'

function AdminArtists() {
  const navigate = useNavigate()
  const {
    adminState,
    session,
    toggleManagedArtistStatus,
    updateManagedArtistProfile,
  } = useApp()
  const [query, setQuery] = useState('')
  const [editingArtist, setEditingArtist] = useState(null)
  const [dashboardArtist, setDashboardArtist] = useState(null)

  const filteredArtists = useMemo(
    () =>
      filterByStudioAccess(adminState.artists, session.user).filter((artist) => {
        const searchable = `${artist.name} ${artist.owner} ${artist.city} ${artist.plan}`.toLowerCase()
        return searchable.includes(query.toLowerCase())
      }),
    [adminState.artists, query, session.user],
  )
  const canSeeStudioRevenue = hasPermission(session.user, permissions.STUDIO_REVENUE)

  const openDashboard = (artist) => {
    setDashboardArtist(artist)
    navigate(paths.adminArtists, { state: { dashboardArtistId: artist.id } })
  }

  const saveArtistProfile = () => {
    if (!editingArtist) return

    updateManagedArtistProfile(editingArtist.id, editingArtist)
    setEditingArtist(null)
  }

  return (
    <main className="dashboard-grid admin-grid">
        <Card className="wide-card mobile-screen primary-panel">
          <PanelHeader title="Gestion de artistas" eyebrow="Admin" action={<Button size="sm">Nueva artista</Button>} />
          <div className="admin-search">
            <Input
              label="Buscar artista"
              type="search"
              placeholder="Nombre, ciudad o plan..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="master-list">
            {filteredArtists.map((artist) => (
              <article className="master-row" key={artist.name}>
                <div>
                  <strong>{artist.name}</strong>
                  <small>{artist.owner} / {artist.city} / {artist.plan}</small>
                </div>
                <StatusPill tone={artist.status === 'Activo' ? 'success' : 'neutral'}>{artist.status}</StatusPill>
                <div className="row-actions">
                  <button type="button" onClick={() => toggleManagedArtistStatus(artist.id)}>
                    {artist.status === 'Activo' ? 'Inactivar' : 'Activar'}
                  </button>
                  <button type="button" onClick={() => openDashboard(artist)}>Ver dashboard</button>
                  <button type="button" onClick={() => setEditingArtist(artist)}>Editar perfil</button>
                </div>
              </article>
            ))}
          </div>
        </Card>

        {dashboardArtist && (
          <Card className="mobile-screen">
            <PanelHeader title="Dashboard artista" eyebrow="Vista admin" />
            <div className="compact-list">
              <div className="list-row elevated-row">
                <div>
                  <strong>{dashboardArtist.name}</strong>
                  <small>{dashboardArtist.description}</small>
                </div>
                <StatusPill tone={dashboardArtist.status === 'Activo' ? 'success' : 'neutral'}>
                  {dashboardArtist.status}
                </StatusPill>
              </div>
              <div className="list-row elevated-row">
                <div>
                  <strong>{dashboardArtist.city}</strong>
                  <small>{dashboardArtist.plan} / {dashboardArtist.services}</small>
                </div>
                {canSeeStudioRevenue && <span>{dashboardArtist.revenue}</span>}
              </div>
            </div>
          </Card>
        )}

        {editingArtist && (
          <Card className="mobile-screen">
            <PanelHeader title="Editar perfil" eyebrow="Artista" />
            <div className="form-stack compact-form">
              <Input
                label="Nombre"
                value={editingArtist.name}
                onChange={(event) => setEditingArtist({ ...editingArtist, name: event.target.value })}
              />
              <Input
                label="Ciudad"
                value={editingArtist.city}
                onChange={(event) => setEditingArtist({ ...editingArtist, city: event.target.value })}
              />
              <Input
                label="Plan"
                value={editingArtist.plan}
                onChange={(event) => setEditingArtist({ ...editingArtist, plan: event.target.value })}
              />
              <Input
                label="Servicios"
                value={editingArtist.services}
                onChange={(event) => setEditingArtist({ ...editingArtist, services: event.target.value })}
              />
              <label className="input-field">
                <span>Descripcion</span>
                <textarea
                  value={editingArtist.description}
                  onChange={(event) => setEditingArtist({ ...editingArtist, description: event.target.value })}
                  rows="3"
                />
              </label>
              <div className="row-actions">
                <button type="button" onClick={saveArtistProfile}>Guardar cambios</button>
                <button type="button" onClick={() => setEditingArtist(null)}>Cancelar</button>
              </div>
            </div>
          </Card>
        )}
    </main>
  )
}

export default AdminArtists
