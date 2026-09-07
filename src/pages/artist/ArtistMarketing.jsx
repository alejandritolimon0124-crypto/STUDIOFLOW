import { useEffect, useMemo, useState } from 'react'
import Button from '../../components/Button'
import { useRef } from 'react'
import Card from '../../components/Card'
import Input from '../../components/Input'
import MetricCard from '../../components/MetricCard'
import PanelHeader from '../../components/PanelHeader'
import StatusPill from '../../components/StatusPill'
import { useApp } from '../../contexts/appContextCore'
import { calculateWeeklyOccupancy } from '../../modules/marketing/occupancyEngine'
import { calculateClientTier } from '../../modules/marketing/loyaltyEngine'
import { canUseOperationalFeature, getStudioStatusLabel, getStudioStatusTone } from '../../modules/governance/studioGovernance'
import {
  deriveMembershipsFromLegacyData,
  getCurrentArtist,
  getMembershipForArtist,
  getStudioForArtist,
} from '../../modules/entities/entitySelectors'
import {
  fetchArtistMarketingSettings,
  deleteArtistFlowPointReward,
  saveArtistFlowPointReward,
  saveArtistHappyHourPromotion,
  setArtistFlowPointsEnabled,
  setArtistFlowPointRedemptionScope,
  setArtistDoublePointsPromotion,
  setArtistLowOccupancyAutomation,
  sendArtistMarketingNotification,
} from '../../services/artistMarketingService'

const automations = [
  { name: 'Recordatorio cumpleaños', active: true },
  { name: 'Reactivación 30 días', active: false },
  { name: 'Mensaje post cita', active: true },
  { name: 'Recordatorio mantenimiento', active: false },
  { name: 'Campañas automáticas', active: true },
]


function ArtistMarketing() {
  const { adminState, artistState, session } = useApp()
  const [happyHour, setHappyHour] = useState(false)
  const [loyaltyActive, setLoyaltyActive] = useState(true)
  const [visitsRequired, setVisitsRequired] = useState(5)
  const [automationStates, setAutomationStates] = useState(
    automations.reduce((acc, auto) => ({ ...acc, [auto.name]: auto.active }), {})
  )
  const [toasts, setToasts] = useState([])
  const [marketingSettings, setMarketingSettings] = useState({ rewards: [], doublePoints: { status: 'paused', rules: {} }, happyHour: { status: 'paused', rules: {} } })
  const [rewardDraft, setRewardDraft] = useState({ discountPercent: 10, pointsCost: '' })
  const [happyHourDraft, setHappyHourDraft] = useState({ discountPercent: 10, weekdays: [1, 2, 3, 4, 5], startTime: '14:00', endTime: '17:00' })
  const [lowOccupancyDraft, setLowOccupancyDraft] = useState({ active: false, period: 'week', threshold: 40 })
  const [maintenanceDays, setMaintenanceDays] = useState(14)
  const [isMarketingSaving, setIsMarketingSaving] = useState(false)
  const toastIdRef = useRef(0)
  const marketingSettingsRequestRef = useRef(0)
  const localProfiles = session.user ? [{ ...session.user, id: session.user.id }] : []
  const artistStudioMemberships = deriveMembershipsFromLegacyData({ artists: adminState.artists })
  const selectorArtists = adminState.artists.map((artist) => (
    getMembershipForArtist({
      artistId: artist.id,
      studioId: session.user?.studioId,
      artistStudioMemberships,
    })
      ? { ...artist, profileId: session.user?.id }
      : artist
  ))
  const primaryArtist = getCurrentArtist({ session, profiles: localProfiles, artists: selectorArtists }) || selectorArtists[0]
  const primaryMembership = getMembershipForArtist({
    artistId: primaryArtist?.id,
    artistStudioMemberships,
  })
  const currentStudio = getStudioForArtist({
    artistId: primaryArtist?.id,
    studios: adminState.studios,
    artistStudioMemberships,
    preferredStudioId: primaryMembership?.studioId,
  }) || adminState.studios[0]
  const canUseMarketing = !primaryMembership?.studioId || canUseOperationalFeature(currentStudio, 'marketing')
  const marketingArtistId = primaryArtist?.id || session.artist?.id || session.user?.artistId || null
  const loadedClients = Array.isArray(artistState.clients) ? artistState.clients : []
  const loadedAppointments = Array.isArray(artistState.appointments) ? artistState.appointments : []
  const loadedServices = Array.isArray(artistState.services) ? artistState.services : []
  const premiumClients = loadedClients
    .map((client) => ({
      ...client,
      visits: Number(client.visits || client.history?.length || 0),
      tier: calculateClientTier(Number(client.visits || client.history?.length || 0)),
    }))
    .filter((client) => client.visits >= visitsRequired)
  const activePromotionsCount = [
    marketingSettings.flowPointsEnabled,
    marketingSettings.doublePoints?.status === 'active',
    marketingSettings.happyHour?.status === 'active',
    lowOccupancyDraft.active,
  ].filter(Boolean).length

  const { weeklyOccupancy } = calculateWeeklyOccupancy(loadedAppointments)
  const monthlyOccupancy = useMemo(() => {
    const now = new Date()
    const monthAppointments = loadedAppointments.filter((appointment) => {
      const dateValue = appointment.startsAt || appointment.starts_at || appointment.date
      if (!dateValue) return false
      const appointmentDate = new Date(dateValue)
      return appointmentDate.getMonth() === now.getMonth() && appointmentDate.getFullYear() === now.getFullYear()
    })

    return Math.min(Math.round((monthAppointments.length / 80) * 100), 100)
  }, [loadedAppointments])
  const lowOccupancyRate = lowOccupancyDraft.period === 'month' ? monthlyOccupancy : weeklyOccupancy
  const doublePointsActive = marketingSettings.doublePoints?.status === 'active'
  const happyHourActive = marketingSettings.happyHour?.status === 'active'
  const flowPointsEnabled = Boolean(marketingSettings.flowPointsEnabled)
  const flowPointRedemptionScope = marketingSettings.flowPointRedemptionScope || 'exclusive'
  const weekdayOptions = [
    { value: 1, label: 'Lun' },
    { value: 2, label: 'Mar' },
    { value: 3, label: 'Mie' },
    { value: 4, label: 'Jue' },
    { value: 5, label: 'Vie' },
    { value: 6, label: 'Sab' },
    { value: 0, label: 'Dom' },
  ]

  const triggerToast = (message) => {
    toastIdRef.current += 1
    const id = toastIdRef.current
    setToasts((prev) => [...prev, { id, message }])
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 3200)
  }


  const loadMarketingSettings = async () => {
    const requestId = marketingSettingsRequestRef.current + 1
    marketingSettingsRequestRef.current = requestId

    try {
      const settings = await fetchArtistMarketingSettings({ artistId: marketingArtistId })
      if (requestId !== marketingSettingsRequestRef.current) return

      const rules = settings.happyHour?.rules || {}
      setMarketingSettings(settings)
      setLowOccupancyDraft({
        active: Boolean(settings.lowOccupancy?.active),
        period: settings.lowOccupancy?.period || 'week',
        threshold: Math.min(Number(settings.lowOccupancy?.threshold || 40), 40),
      })
      setMaintenanceDays(Number(settings.maintenanceReminderDays || 14))
      setHappyHour(settings.happyHour?.status === 'active')
      setHappyHourDraft({
        discountPercent: Number(rules.discountPercent || 10),
        weekdays: Array.isArray(rules.weekdays) ? rules.weekdays.map(Number) : [1, 2, 3, 4, 5],
        startTime: rules.startTime || '14:00',
        endTime: rules.endTime || '17:00',
      })
    } catch (error) {
      triggerToast(error.message || 'No se pudo cargar marketing.')
    }
  }

  useEffect(() => {
    loadMarketingSettings()
  }, [marketingArtistId])

  const addFlowPointReward = async () => {
    setIsMarketingSaving(true)
    try {
      const reward = await saveArtistFlowPointReward({ ...rewardDraft, artistId: marketingArtistId })
      setMarketingSettings((current) => ({ ...current, rewards: [...current.rewards, reward].sort((a, b) => a.pointsCost - b.pointsCost) }))
      setRewardDraft({ discountPercent: 10, pointsCost: '' })
      triggerToast('Beneficio Flow Points agregado')
    } catch (error) {
      triggerToast(error.message || 'No se pudo agregar el beneficio')
    } finally {
      setIsMarketingSaving(false)
    }
  }

  const toggleFlowPointsEnabled = async () => {
    const nextActive = !flowPointsEnabled
    const previousSettings = marketingSettings
    setIsMarketingSaving(true)
    setMarketingSettings((current) => ({ ...current, flowPointsEnabled: nextActive }))
    try {
      const settings = await setArtistFlowPointsEnabled({ active: nextActive, artistId: marketingArtistId })
      setMarketingSettings(settings)
      triggerToast(nextActive ? 'Flow Points activos para reservas' : 'Flow Points pausados')
    } catch (error) {
      setMarketingSettings(previousSettings)
      triggerToast(error.message || 'No se pudo actualizar Flow Points')
    } finally {
      setIsMarketingSaving(false)
    }
  }

  const changeFlowPointRedemptionScope = async (scope) => {
    const previousSettings = marketingSettings
    setIsMarketingSaving(true)
    setMarketingSettings((current) => ({ ...current, flowPointRedemptionScope: scope }))
    try {
      const settings = await setArtistFlowPointRedemptionScope({ scope, artistId: marketingArtistId })
      setMarketingSettings(settings)
      triggerToast(scope === 'open' ? 'Acepta puntos libres' : 'Acepta solo puntos exclusivos')
    } catch (error) {
      setMarketingSettings(previousSettings)
      triggerToast(error.message || 'No se pudo actualizar el tipo de puntos')
    } finally {
      setIsMarketingSaving(false)
    }
  }

  const toggleDoublePoints = async () => {
    const nextActive = !doublePointsActive
    const previousSettings = marketingSettings
    const nextDoublePoints = {
      ...(marketingSettings.doublePoints || {}),
      status: nextActive ? 'active' : 'paused',
      rules: { ...(marketingSettings.doublePoints?.rules || {}), multiplier: 2 },
    }
    setIsMarketingSaving(true)
    setMarketingSettings((current) => ({ ...current, doublePoints: nextDoublePoints }))
    try {
      const settings = await setArtistDoublePointsPromotion({ active: nextActive, artistId: marketingArtistId })
      setMarketingSettings((current) => ({
        ...current,
        ...settings,
        doublePoints: {
          ...(settings.doublePoints || {}),
          status: nextActive ? 'active' : 'paused',
          rules: { ...(settings.doublePoints?.rules || {}), multiplier: 2 },
        },
      }))
      triggerToast(nextActive ? 'Puntos dobles activados' : 'Puntos dobles desactivados')
    } catch (error) {
      setMarketingSettings(previousSettings)
      triggerToast(error.message || 'No se pudo actualizar puntos dobles')
    } finally {
      setIsMarketingSaving(false)
    }
  }

  const deleteFlowPointReward = async (rewardId) => {
    if (!window.confirm('Eliminar este beneficio Flow Points?')) return

    const previousSettings = marketingSettings
    setIsMarketingSaving(true)
    setMarketingSettings((current) => ({
      ...current,
      rewards: current.rewards.filter((reward) => reward.id !== rewardId),
    }))

    try {
      const settings = await deleteArtistFlowPointReward({ rewardId, artistId: marketingArtistId })
      setMarketingSettings(settings)
      triggerToast('Beneficio eliminado')
    } catch (error) {
      setMarketingSettings(previousSettings)
      triggerToast(error.message || 'No se pudo eliminar el beneficio')
    } finally {
      setIsMarketingSaving(false)
    }
  }

  const toggleHappyHourDay = (weekday) => {
    setHappyHourDraft((draft) => ({
      ...draft,
      weekdays: draft.weekdays.includes(weekday)
        ? draft.weekdays.filter((day) => day !== weekday)
        : [...draft.weekdays, weekday].sort((first, second) => first - second),
    }))
  }

  const saveHappyHour = async (active = true) => {
    const previousSettings = marketingSettings
    setIsMarketingSaving(true)
    setMarketingSettings((current) => ({
      ...current,
      happyHour: {
        ...current.happyHour,
        status: active ? 'active' : 'paused',
        rules: {
          discountPercent: happyHourDraft.discountPercent,
          weekdays: happyHourDraft.weekdays,
          startTime: happyHourDraft.startTime,
          endTime: happyHourDraft.endTime,
        },
      },
    }))
    try {
      const settings = await saveArtistHappyHourPromotion({ ...happyHourDraft, active, artistId: marketingArtistId })
      setMarketingSettings(settings)
      setHappyHour(active)
      triggerToast(active ? 'Happy Hour actualizado' : 'Happy Hour pausado')
    } catch (error) {
      setMarketingSettings(previousSettings)
      triggerToast(error.message || 'No se pudo guardar Happy Hour')
    } finally {
      setIsMarketingSaving(false)
    }
  }

  const toggleLowOccupancyAutomation = async () => {
    const nextActive = !lowOccupancyDraft.active
    const previousDraft = lowOccupancyDraft
    const nextDraft = { ...lowOccupancyDraft, active: nextActive }
    marketingSettingsRequestRef.current += 1
    setIsMarketingSaving(true)
    setLowOccupancyDraft(nextDraft)
    try {
      const settings = await setArtistLowOccupancyAutomation({ ...nextDraft, artistId: marketingArtistId })
      setMarketingSettings((current) => ({
        ...current,
        ...settings,
        lowOccupancy: {
          ...(settings.lowOccupancy || {}),
          active: nextActive,
          period: nextDraft.period,
          threshold: Math.min(Number(nextDraft.threshold || 40), 40),
        },
      }))
      setLowOccupancyDraft((draft) => ({
        ...draft,
        active: nextActive,
        period: nextDraft.period,
        threshold: Math.min(Number(nextDraft.threshold || 40), 40),
      }))
      triggerToast(nextActive ? 'Baja ocupacion lista para automatizar' : 'Baja ocupacion pausada')
    } catch (error) {
      setLowOccupancyDraft(previousDraft)
      triggerToast(error.message || 'No se pudo actualizar baja ocupacion')
    } finally {
      setIsMarketingSaving(false)
    }
  }

  const sendMarketingNotification = async (type) => {
    setIsMarketingSaving(true)
    try {
      const result = await sendArtistMarketingNotification({ type, maintenanceDays, artistId: marketingArtistId })
      triggerToast(result.insertedCount > 0 ? `Aviso enviado a ${result.insertedCount} clientas` : 'No hay clientas elegibles para este aviso')
    } catch (error) {
      triggerToast(error.message || 'No se pudo enviar el aviso')
    } finally {
      setIsMarketingSaving(false)
    }
  }

  const toggleAutomation = (name) => {
    setAutomationStates((prev) => ({ ...prev, [name]: !prev[name] }))
    triggerToast(`✓ Automatización ${name} ${automationStates[name] ? 'desactivada' : 'activada'}`)
  }


  if (!canUseMarketing) {
    return (
      <main className="dashboard-grid artist-grid">
        <section className="hero-panel studio-hero mobile-screen premium-hero">
          <div>
            <span className="eyebrow">Modulo Marketplace</span>
            <h2>Marketplace preparado para tu aprobacion</h2>
            <p>Tu estudio esta siendo validado para mantener la calidad premium de Studio Flow. Mientras tanto puedes dejar listos beneficios, puntos y promociones.</p>
          </div>
          <div className="hero-summary">
            <span>Estado del estudio</span>
            <strong>Review</strong>
            <small>{getStudioStatusLabel(currentStudio?.studioStatus)}</small>
          </div>
        </section>

        <Card className="wide-card studio-access-card">
          <PanelHeader title="Herramientas reservadas" eyebrow="Gobernanza premium" />
          <div className="access-guard-grid">
            {[
              ['Marketplace', 'Disponible al completar la validacion del estudio.'],
              ['Automatizaciones', 'Se activaran cuando la experiencia este aprobada.'],
              ['Economia', 'Revenue y comisiones quedan en modo preparacion.'],
              ['Agenda publica', 'Tu estudio no aparece en busqueda hasta finalizar revision.'],
            ].map(([title, description]) => (
              <div key={title}>
                <strong>{title}</strong>
                <small>{description}</small>
              </div>
            ))}
          </div>
          <StatusPill tone={getStudioStatusTone(currentStudio?.studioStatus)}>
            {getStudioStatusLabel(currentStudio?.studioStatus)}
          </StatusPill>
        </Card>
      </main>
    )
  }

  return (
    <main className="dashboard-grid artist-grid">
      <section className="hero-panel studio-hero mobile-screen premium-hero">
        <div>
          <span className="eyebrow">Studio Flow</span>
          <h2>Modulo Marketplace</h2>
          <p>Configura beneficios Flow Points, puntos dobles y Happy Hour.</p>
        </div>
        <div className="hero-summary">
          <span>{happyHour ? 'Horario activo' : 'Lista para lanzar'}</span>
          <strong>Premium</strong>
          <small>{flowPointsEnabled ? 'Flow Points activo' : 'Configura tus beneficios'}</small>
        </div>
      </section>

      <MetricCard label="Clientes recurrentes" value={premiumClients.length} trend={loyaltyActive ? 'Programa activo' : 'Programa pausado'} className="mobile-compact" />
      <MetricCard label="Citas cargadas" value={loadedAppointments.length} trend={loadedAppointments.length > 0 ? 'Con agenda' : 'Sin citas'} tone="nude" className="mobile-compact" />
      <MetricCard label="Promociones activas" value={activePromotionsCount} trend={silentPromo ? 'Silenciosa' : 'Configuradas'} tone="sage" className="mobile-compact" />
      <MetricCard label="Servicios activos" value={loadedServices.filter((service) => service.status === 'Activo').length} trend="Catalogo real" tone="rose" className="mobile-compact" />

      <Card className="wide-card mobile-screen primary-panel flow-points-benefits-panel">
        <PanelHeader
          title="Beneficios Flow Points"
          eyebrow="Canje de puntos"
          action={<Button disabled={isMarketingSaving || !rewardDraft.pointsCost} size="sm" onClick={addFlowPointReward}>Agregar beneficio Flow Points</Button>}
        />
        <div className={`marketplace-switch-card ${flowPointsEnabled ? 'active' : ''}`}>
          <div className="toggle-row marketplace-main-toggle">
            <span>
              <strong>Flow Points activos para clientas</strong>
              <small>{flowPointsEnabled ? 'Las clientas pueden ganar y canjear puntos.' : 'Los puntos estan pausados para este perfil.'}</small>
            </span>
          </div>
          <Button disabled={isMarketingSaving} size="sm" variant={flowPointsEnabled ? 'danger' : 'success'} onClick={toggleFlowPointsEnabled}>
            {flowPointsEnabled ? 'Desactivar Flow Points' : 'Activar Flow Points'}
          </Button>
        </div>
        <div className="flow-points-scope-options">
          <button
            className={flowPointRedemptionScope === 'exclusive' ? 'is-active exclusive' : 'exclusive'}
            disabled={isMarketingSaving}
            onClick={() => changeFlowPointRedemptionScope('exclusive')}
            type="button"
          >
            <strong>★ Puntos exclusivos</strong>
            <small>Solo acepta puntos generados contigo.</small>
          </button>
          <button
            className={flowPointRedemptionScope === 'open' ? 'is-active open' : 'open'}
            disabled={isMarketingSaving}
            onClick={() => changeFlowPointRedemptionScope('open')}
            type="button"
          >
            <strong>★ Puntos libres</strong>
            <small>Acepta puntos de otros perfiles.</small>
          </button>
        </div>
        <div className="location-form-grid">
          <label className="input-field">
            <span>Descuento</span>
            <select
              value={rewardDraft.discountPercent}
              onChange={(event) => setRewardDraft((draft) => ({ ...draft, discountPercent: Number(event.target.value) }))}
            >
              {[5, 10, 15, 20, 25, 30].map((percent) => (
                <option value={percent} key={percent}>{percent}%</option>
              ))}
            </select>
          </label>
          <Input
            label="Puntos necesarios"
            min="1"
            type="number"
            value={rewardDraft.pointsCost}
            onChange={(event) => setRewardDraft((draft) => ({ ...draft, pointsCost: event.target.value }))}
          />
        </div>
        <div className="compact-list">
          {marketingSettings.rewards.length > 0 ? marketingSettings.rewards.map((reward) => (
            <div className="list-row elevated-row" key={reward.id}>
              <div>
                <strong>{reward.discountPercent}% de descuento</strong>
                <small>Disponible con {reward.pointsCost} Flow Points</small>
              </div>
              <Button disabled={isMarketingSaving} size="sm" variant="danger" onClick={() => deleteFlowPointReward(reward.id)}>
                Eliminar
              </Button>
            </div>
          )) : (
            <div className="list-row elevated-row">
              <div>
                <strong>Sin beneficios activos.</strong>
                <small>Agrega el primer beneficio para que tus clientas puedan canjear puntos.</small>
              </div>
              <StatusPill tone="neutral">Vacio</StatusPill>
            </div>
          )}
        </div>
      </Card>

      <Card className="mobile-screen primary-panel double-points-panel">
        <PanelHeader title="PUNTOS DOBLES!" eyebrow="Promocion inmediata" />
        <div className="list-row elevated-row">
          <div>
            <strong>{doublePointsActive ? 'Puntos dobles activos' : 'Puntos dobles pausados'}</strong>
            <small>Cuando se activa, las citas acreditan el doble al presionar Otorgar puntos.</small>
          </div>
          <Button disabled={isMarketingSaving} size="sm" variant={doublePointsActive ? 'danger' : 'success'} onClick={toggleDoublePoints}>
            {doublePointsActive ? 'Desactivar' : 'Activar'}
          </Button>
        </div>
      </Card>

      <Card className="wide-card mobile-screen primary-panel happy-hour-panel">
        <PanelHeader title="Happy Hour" eyebrow="Horarios con descuento" />
        <div className="location-form-grid">
          <label className="input-field">
            <span>Descuento</span>
            <select
              value={happyHourDraft.discountPercent}
              onChange={(event) => setHappyHourDraft((draft) => ({ ...draft, discountPercent: Number(event.target.value) }))}
            >
              {[5, 10, 15, 20, 25, 30].map((percent) => (
                <option value={percent} key={percent}>{percent}%</option>
              ))}
            </select>
          </label>
          <Input label="Desde" type="time" value={happyHourDraft.startTime} onChange={(event) => setHappyHourDraft((draft) => ({ ...draft, startTime: event.target.value }))} />
          <Input label="Hasta" type="time" value={happyHourDraft.endTime} onChange={(event) => setHappyHourDraft((draft) => ({ ...draft, endTime: event.target.value }))} />
        </div>
        <div className="weekday-toggle-row">
          {weekdayOptions.map((day) => (
            <button
              className={happyHourDraft.weekdays.includes(day.value) ? 'active' : ''}
              key={day.value}
              type="button"
              onClick={() => toggleHappyHourDay(day.value)}
            >
              {day.label}
            </button>
          ))}
        </div>
        <div className="row-actions">
          <Button disabled={isMarketingSaving} size="sm" variant={happyHourActive ? 'danger' : 'success'} onClick={() => saveHappyHour(!happyHourActive)}>
            {happyHourActive ? 'Desactivar Happy Hour' : 'Activar Happy Hour'}
          </Button>
          <Button disabled={isMarketingSaving} size="sm" variant="ghost" onClick={() => saveHappyHour(true)}>
            Guardar ajustes
          </Button>
        </div>
      </Card>

      <Card className="wide-card mobile-screen primary-panel">
        <PanelHeader title="Baja ocupacion" eyebrow="Automatizacion" />
        <div className="location-form-grid">
          <label className="input-field">
            <span>Medir por</span>
            <select
              value={lowOccupancyDraft.period}
              onChange={(event) => setLowOccupancyDraft((draft) => ({ ...draft, period: event.target.value }))}
            >
              <option value="week">Semana</option>
              <option value="month">Mes</option>
            </select>
          </label>
          <Input
            label="Activar con menos de"
            max="40"
            min="1"
            type="number"
            value={lowOccupancyDraft.threshold}
            onChange={(event) => setLowOccupancyDraft((draft) => ({ ...draft, threshold: Math.min(Number(event.target.value) || 40, 40) }))}
          />
        </div>
        <div className="list-row elevated-row">
          <div>
            <strong>{lowOccupancyDraft.active ? 'Automatizacion activa' : 'Automatizacion pausada'}</strong>
            <small>
              Ocupacion actual: {lowOccupancyRate}%. Se aplica solo si baja de {lowOccupancyDraft.threshold}% sin duplicar promociones manuales.
            </small>
          </div>
          <Button disabled={isMarketingSaving} size="sm" variant={lowOccupancyDraft.active ? 'danger' : 'success'} onClick={toggleLowOccupancyAutomation}>
            {lowOccupancyDraft.active ? 'Desactivar' : 'Activar'}
          </Button>
        </div>
      </Card>

      <Card className="wide-card mobile-screen primary-panel">
        <PanelHeader title="Marketing inteligente" eyebrow="Solo clientas atendidas" />
        <div className="compact-list">
          <div className="list-row elevated-row">
            <div>
              <strong>Recordatorio de cumpleaños</strong>
              <small>Envia una felicitacion firmada por la artista o estudio solo a clientas que ya asistieron.</small>
            </div>
            <label className="toggle-row">
              <input type="checkbox" checked={automationStates['Recordatorio cumpleaños']} onChange={() => toggleAutomation('Recordatorio cumpleaños')} />
            </label>
            <Button disabled={isMarketingSaving || !automationStates['Recordatorio cumpleaños']} size="sm" variant="ghost" onClick={() => sendMarketingNotification('birthday')}>
              Enviar ahora
            </Button>
          </div>
          <div className="list-row elevated-row">
            <div>
              <strong>Reactivacion 30 dias</strong>
              <small>Invita a regresar a clientas sin cita nueva despues de 30 dias.</small>
            </div>
            <label className="toggle-row">
              <input type="checkbox" checked={automationStates['Reactivación 30 días']} onChange={() => toggleAutomation('Reactivación 30 días')} />
            </label>
            <Button disabled={isMarketingSaving || !automationStates['Reactivación 30 días']} size="sm" variant="ghost" onClick={() => sendMarketingNotification('reactivation')}>
              Enviar ahora
            </Button>
          </div>
          <div className="list-row elevated-row">
            <div>
              <strong>Recordatorio de mantenimiento</strong>
              <small>Se envia despues de la ultima cita, solo si la clienta ya asistio.</small>
            </div>
            <label className="input-field inline-select">
              <span>Dias</span>
              <select value={maintenanceDays} onChange={(event) => setMaintenanceDays(Number(event.target.value))}>
                <option value={7}>7</option>
                <option value={14}>14</option>
                <option value={30}>30</option>
              </select>
            </label>
            <Button disabled={isMarketingSaving} size="sm" variant="ghost" onClick={() => sendMarketingNotification('maintenance')}>
              Enviar ahora
            </Button>
          </div>
        </div>
      </Card>








      <div className="premium-toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className="premium-toast">
            {toast.message}
          </div>
        ))}
      </div>
    </main>
  )
}

export default ArtistMarketing


