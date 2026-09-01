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
import { generateAutomaticPromotion } from '../../modules/marketing/promotionEngine'
import { detectInactiveClients } from '../../modules/marketing/reactivationEngine'
import { calculateClientTier } from '../../modules/marketing/loyaltyEngine'
import { generateInsights } from '../../modules/marketing/smartInsights'
import { generateArtistAutomations } from '../../modules/automation/smartAutomationEngine'
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

const toastLabels = {
  happyHour: '✓ Happy Hour activado',
  lowOccupancy: '✓ Ajuste de baja ocupación aplicado',
  silentPromo: '✓ Promoción silenciosa actualizada',
  loyaltyActive: '✓ Programa de lealtad actualizado',
}

function ArtistMarketing() {
  const { adminState, artistState, session, selectedDate } = useApp()
  const [happyHour, setHappyHour] = useState(false)
  const [lowOccupancy, setLowOccupancy] = useState(true)
  const [silentPromo, setSilentPromo] = useState(false)
  const [loyaltyActive, setLoyaltyActive] = useState(true)
  const [visitsRequired, setVisitsRequired] = useState(5)
  const [discountPercent, setDiscountPercent] = useState(15)
  const [validityDays, setValidityDays] = useState(45)
  const [automationStates, setAutomationStates] = useState(
    automations.reduce((acc, auto) => ({ ...acc, [auto.name]: auto.active }), {})
  )
  const [priorityAgenda, setPriorityAgenda] = useState(true)
  const [privatePromos, setPrivatePromos] = useState(true)
  const [earlyBooking, setEarlyBooking] = useState(false)
  const [vipBadgeActive, setVipBadgeActive] = useState(true)
  const [preferentialSupport, setPreferentialSupport] = useState(true)
  const [toasts, setToasts] = useState([])
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false)
  const [marketingSettings, setMarketingSettings] = useState({ rewards: [], doublePoints: { status: 'paused', rules: {} }, happyHour: { status: 'paused', rules: {} } })
  const [rewardDraft, setRewardDraft] = useState({ discountPercent: 10, pointsCost: '' })
  const [happyHourDraft, setHappyHourDraft] = useState({ discountPercent: 10, weekdays: [1, 2, 3, 4, 5], startTime: '14:00', endTime: '17:00' })
  const [lowOccupancyDraft, setLowOccupancyDraft] = useState({ active: false, period: 'week', threshold: 40 })
  const [maintenanceDays, setMaintenanceDays] = useState(14)
  const [isMarketingSaving, setIsMarketingSaving] = useState(false)
  const toastIdRef = useRef(0)
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

  const { weeklyOccupancy, lowSlots, busyDays } = calculateWeeklyOccupancy(loadedAppointments)
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
  const promotionSummary = generateAutomaticPromotion(weeklyOccupancy)
  const inactiveClients = detectInactiveClients(loadedClients)
  const loyaltyTier = calculateClientTier(premiumClients[0]?.visits || 0)
  const baseInsights = generateInsights({
    weeklyOccupancy,
    lowSlots,
    busyDays,
    inactiveCount: inactiveClients.length,
    happyHourActive: happyHour,
  })
  const artistAutomations = generateArtistAutomations(artistState, selectedDate)

  const loyaltyPreview = `${visitsRequired} visitas = ${discountPercent}% OFF por ${validityDays} días`
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

  const handleToggle = (key, setter, nextValue) => {
    setter(nextValue)
    triggerToast(toastLabels[key])
  }

  const loadMarketingSettings = async () => {
    try {
      const settings = await fetchArtistMarketingSettings({ artistId: marketingArtistId })
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
          period: settings.lowOccupancy?.period || nextDraft.period,
          threshold: Math.min(Number(settings.lowOccupancy?.threshold || nextDraft.threshold), 40),
        },
      }))
      setLowOccupancyDraft((draft) => ({
        ...draft,
        active: nextActive,
        period: settings.lowOccupancy?.period || nextDraft.period,
        threshold: Math.min(Number(settings.lowOccupancy?.threshold || nextDraft.threshold), 40),
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

  const dynamicInsights = useMemo(() => {
    const extras = []

    if (happyHour) {
      extras.push({
        title: 'Happy Hour activo',
        message: 'Tu tarifa inteligente se aplica en horarios de baja ocupación.',
        tone: 'success',
      })
    }

    if (lowOccupancy) {
      extras.push({
        title: 'Espacios disponibles',
        message: 'Aprovecha el inventario libre con una oferta exclusiva.',
        tone: 'warm',
      })
    }

    if (silentPromo) {
      extras.push({
        title: 'Promoción silenciosa lista',
        message: 'Clientes frecuentes verán una oferta privada primero.',
        tone: 'success',
      })
    }

    if (priorityAgenda) {
      extras.push({
        title: 'Prioridad agenda activa',
        message: 'Tus clientas VIP saltan a la cima de la lista de reservas.',
        tone: 'success',
      })
    }

    if (privatePromos) {
      extras.push({
        title: 'Promociones privadas listas',
        message: 'Solo las mejores clientas reciben estas ofertas.',
        tone: 'success',
      })
    }

    if (earlyBooking) {
      extras.push({
        title: 'Reserva anticipada habilitada',
        message: 'Tus clientas premium reservan primero los mejores horarios.',
        tone: 'success',
      })
    }

    if (vipBadgeActive) {
      extras.push({
        title: 'Badge VIP en uso',
        message: 'Identifica rápidamente a tus clientas más valiosas.',
        tone: 'success',
      })
    }

    if (preferentialSupport) {
      extras.push({
        title: 'Atención preferencial',
        message: 'Studio Flow prioriza el seguimiento VIP automáticamente.',
        tone: 'success',
      })
    }

    if (loyaltyActive) {
      extras.push({
        title: 'Fidelidad en marcha',
        message: 'Tu programa de lealtad mantiene a las clientas premium conectadas.',
        tone: 'success',
      })
    }

    if (!loyaltyActive) {
      extras.push({
        title: 'Lealtad pausada',
        message: 'Activa el programa para aumentar retención premium.',
        tone: 'rose',
      })
    }

    return [...extras, ...baseInsights].slice(0, 4)
  }, [happyHour, lowOccupancy, silentPromo, loyaltyActive, priorityAgenda, privatePromos, earlyBooking, vipBadgeActive, preferentialSupport, baseInsights])

  const analyticsRows = [
    {
      title: 'Ocupación semanal',
      description: loadedAppointments.length > 0 ? `${loadedAppointments.length} citas cargadas` : 'Sin citas cargadas esta semana.',
      tone: happyHour ? 'success' : lowOccupancy ? 'warm' : 'nude',
      label: loadedAppointments.length > 0 ? 'Con datos' : 'Sin datos',
    },
    {
      title: 'Retorno clientes',
      description: loyaltyActive ? 'El programa de lealtad impulsa la recurrencia.' : 'Recupera clientas con beneficios adicionales.',
      tone: loyaltyActive ? 'success' : 'rose',
      label: loyaltyActive ? 'Fuerte' : 'Reactivar',
    },
    {
      title: 'Promociones activas',
      description: `${activePromotionsCount} configuraciones activas.`,
      tone: silentPromo ? 'sage' : 'nude',
      label: activePromotionsCount > 0 ? 'Activas' : 'Sin activar',
    },
    {
      title: 'Crecimiento mensual',
      description: loadedServices.length > 0 ? `${loadedServices.length} servicios cargados.` : 'Sin servicios cargados.',
      tone: happyHour || loyaltyActive ? 'success' : 'rose',
      label: loadedServices.length > 0 ? 'Con datos' : 'Pendiente',
    },
  ]

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







      {isPremiumModalOpen && (
        <div className="marketing-modal-overlay">
          <div className="marketing-modal-card">
            <div className="marketing-modal-header">
              <div>
                <span className="eyebrow">Premium</span>
                <h3>Beneficios exclusivos</h3>
              </div>
              <button className="marketing-modal-close" type="button" onClick={() => setIsPremiumModalOpen(false)}>
                ×
              </button>
            </div>
            <div className="marketing-modal-body">
              <p>Tus mejores clientas merecen beneficios especiales.</p>
              <p className="marketing-modal-note">Activa ventajas exclusivas para fidelizar y hacer regresar a tus clientas VIP.</p>

              <div className="marketing-modal-benefits">
                <div className="marketing-benefit-row">
                  <div>
                    <strong>Prioridad agenda</strong>
                    <small>Tus clientas VIP aparecerán primero al reservar.</small>
                  </div>
                  <div className="benefit-actions">
                    <StatusPill tone={priorityAgenda ? 'success' : 'nude'}>{priorityAgenda ? 'Activo' : 'Off'}</StatusPill>
                    <label className="toggle-row">
                      <input type="checkbox" checked={priorityAgenda} onChange={() => setPriorityAgenda(!priorityAgenda)} />
                    </label>
                  </div>
                </div>
                <div className="marketing-benefit-row">
                  <div>
                    <strong>Promociones privadas</strong>
                    <small>Solo tus mejores clientas recibirán promociones exclusivas.</small>
                  </div>
                  <div className="benefit-actions">
                    <StatusPill tone={privatePromos ? 'success' : 'nude'}>{privatePromos ? 'Activo' : 'Off'}</StatusPill>
                    <label className="toggle-row">
                      <input type="checkbox" checked={privatePromos} onChange={() => setPrivatePromos(!privatePromos)} />
                    </label>
                  </div>
                </div>
                <div className="marketing-benefit-row">
                  <div>
                    <strong>Reserva anticipada</strong>
                    <small>Permite reservar horarios premium antes que otras clientas.</small>
                  </div>
                  <div className="benefit-actions">
                    <StatusPill tone={earlyBooking ? 'success' : 'nude'}>{earlyBooking ? 'Activo' : 'Off'}</StatusPill>
                    <label className="toggle-row">
                      <input type="checkbox" checked={earlyBooking} onChange={() => setEarlyBooking(!earlyBooking)} />
                    </label>
                  </div>
                </div>
                <div className="marketing-benefit-row">
                  <div>
                    <strong>Badge VIP</strong>
                    <small>Las clientas VIP tendrán insignia especial.</small>
                  </div>
                  <div className="benefit-actions">
                    <StatusPill tone={vipBadgeActive ? 'success' : 'nude'}>{vipBadgeActive ? 'Activo' : 'Off'}</StatusPill>
                    <label className="toggle-row">
                      <input type="checkbox" checked={vipBadgeActive} onChange={() => setVipBadgeActive(!vipBadgeActive)} />
                    </label>
                  </div>
                </div>
                <div className="marketing-benefit-row">
                  <div>
                    <strong>Atención preferencial</strong>
                    <small>Studio Flow priorizará seguimiento y recordatorios VIP.</small>
                  </div>
                  <div className="benefit-actions">
                    <StatusPill tone={preferentialSupport ? 'success' : 'nude'}>{preferentialSupport ? 'Activo' : 'Off'}</StatusPill>
                    <label className="toggle-row">
                      <input type="checkbox" checked={preferentialSupport} onChange={() => setPreferentialSupport(!preferentialSupport)} />
                    </label>
                  </div>
                </div>
              </div>

              <div className="marketing-modal-vip-section">
                <div className="modal-section-header">
                  <div>
                    <span className="eyebrow">TUS CLIENTAS VIP</span>
                    <h4>Conecta con quienes regresan más seguido</h4>
                  </div>
                  <Button variant="ghost" size="sm">Agregar a VIP</Button>
                </div>
                <div className="vip-card-grid">
                  {premiumClients.length > 0 ? premiumClients.map((client) => (
                    <div key={client.name} className="vip-card">
                      <div>
                        <strong>{client.name}</strong>
                        <small>{client.tier} / {client.visits} visitas</small>
                      </div>
                      <span className="vip-card-badge">{client.tier}</span>
                    </div>
                  )) : (
                    <div className="vip-card">
                      <div>
                        <strong>Sin clientas VIP.</strong>
                        <small>Se mostraran con historial real.</small>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <p className="marketing-modal-note">Studio Flow detecta automáticamente clientas frecuentes según visitas y recurrencia.</p>
            </div>
            <div className="marketing-modal-actions">
              <Button variant="ghost" size="sm" onClick={() => setIsPremiumModalOpen(false)}>
                Cerrar
              </Button>
              <Button size="sm" onClick={() => setIsPremiumModalOpen(false)}>
                Guardar configuración
              </Button>
            </div>
          </div>
        </div>
      )}

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


