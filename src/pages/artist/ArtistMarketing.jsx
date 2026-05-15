import { useMemo, useState } from 'react'
import Button from '../../components/Button'
import { useRef } from 'react'
import Card from '../../components/Card'
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

const vipClients = [
  { name: 'Mariana Lopez', visits: 12, benefits: ['Prioridad agenda', 'Promociones privadas'] },
  { name: 'Camila Ruiz', visits: 9, benefits: ['Reserva anticipada'] },
  { name: 'Renata Morales', visits: 7, benefits: ['Prioridad agenda'] },
]

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
  const { adminState, artistState, selectedDate } = useApp()
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
  const toastIdRef = useRef(0)
  const currentStudio = adminState.artists.find((artist) => artist.owner === 'Valeria Moon') || adminState.artists[0]
  const canUseMarketing = canUseOperationalFeature(currentStudio, 'marketing')

  const premiumClients = [
    { name: 'Ana López', tier: 'VIP', visits: 15 },
    { name: 'María Fernanda', tier: 'Gold', visits: 9 },
    { name: 'Camila Torres', tier: 'Frequent', visits: 5 },
  ]

  const { weeklyOccupancy, lowSlots, busyDays } = calculateWeeklyOccupancy()
  const promotionSummary = generateAutomaticPromotion(weeklyOccupancy)
  const inactiveClients = detectInactiveClients()
  const loyaltyTier = calculateClientTier(12)
  const baseInsights = generateInsights({
    weeklyOccupancy,
    lowSlots,
    busyDays,
    inactiveCount: inactiveClients.length,
    happyHourActive: happyHour,
  })
  const artistAutomations = generateArtistAutomations(artistState, selectedDate)

  const loyaltyPreview = `${visitsRequired} visitas = ${discountPercent}% OFF por ${validityDays} días`

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
      description: happyHour ? 'Happy Hour suaviza la baja ocupación y atrae nuevas reservas.' : '78% promedio / +5% vs semana anterior',
      tone: happyHour ? 'success' : lowOccupancy ? 'warm' : 'nude',
      label: happyHour ? 'Optimizado' : 'Estable',
    },
    {
      title: 'Retorno clientes',
      description: loyaltyActive ? 'El programa de lealtad impulsa la recurrencia.' : 'Recupera clientas con beneficios adicionales.',
      tone: loyaltyActive ? 'success' : 'rose',
      label: loyaltyActive ? 'Fuerte' : 'Reactivar',
    },
    {
      title: 'Promociones activas',
      description: silentPromo ? 'Silenciosa y directa para clientas VIP.' : '3 campañas en ejecución.',
      tone: silentPromo ? 'sage' : 'nude',
      label: silentPromo ? 'Exclusivo' : 'Visible',
    },
    {
      title: 'Crecimiento mensual',
      description: happyHour || loyaltyActive ? '+18% impulso premium' : '+8% ingresos',
      tone: happyHour || loyaltyActive ? 'success' : 'rose',
      label: happyHour || loyaltyActive ? 'Creciente' : 'Atento',
    },
  ]

  if (!canUseMarketing) {
    return (
      <main className="dashboard-grid artist-grid">
        <section className="hero-panel studio-hero mobile-screen premium-hero">
          <div>
            <span className="eyebrow">Studio Flow Curated Access</span>
            <h2>Growth preparado para tu aprobacion</h2>
            <p>Tu estudio esta siendo validado para mantener la calidad premium de Studio Flow. Mientras tanto puedes dejar listos servicios, horarios y perfil.</p>
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
              ['Marketing', 'Disponible al completar la validacion del estudio.'],
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
          <h2>Marketing & Growth</h2>
          <p>Automatiza promociones, fidelización y crecimiento inteligente.</p>
        </div>
        <div className="hero-summary">
          <span>{happyHour ? 'Horario activo' : 'Lista para lanzar'}</span>
          <strong>Premium</strong>
          <small>{silentPromo ? 'Promoción confidencial' : 'Performance estratégica'}</small>
        </div>
      </section>

      <MetricCard label="Clientes recurrentes" value="24" trend={loyaltyActive ? '+18%' : '+12%'} className="mobile-compact" />
      <MetricCard label="Ocupación semanal" value="78%" trend={happyHour ? '+12%' : '+5%'} tone="nude" className="mobile-compact" />
      <MetricCard label="Promociones activas" value="3" trend={silentPromo ? 'Silenciosa' : 'Activas'} tone="sage" className="mobile-compact" />
      <MetricCard label="Recompensas utilizadas" value="18" trend={loyaltyActive ? '+12%' : '+8%'} tone="rose" className="mobile-compact" />

      {artistAutomations.length > 0 && (
        <Card className="wide-card mobile-screen primary-panel automations-panel">
          <PanelHeader title="Automatizaciones inteligentes" eyebrow="Insights en tiempo real" />
          <div className="automations-artist-stack">
            {artistAutomations.map((automation) => (
              <div key={automation.type} className="automation-insight">
                <div className="insight-header">
                  <h4>{automation.title}</h4>
                  <span className={`insight-badge priority-${automation.priority}`}>
                    {automation.priority === 'critical' && '🔴'}
                    {automation.priority === 'high' && '🟠'}
                    {automation.priority === 'medium' && '🟡'}
                    {automation.priority === 'low' && '🟢'}
                  </span>
                </div>
                <p>{automation.message}</p>
                {automation.ctaText && (
                  <Button variant="text" onClick={() => {}}>{automation.ctaText}</Button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="wide-card mobile-screen primary-panel">
        <PanelHeader title="Promociones inteligentes" eyebrow="Automatización" />
        <div className="compact-list">
          <div className="list-row elevated-row">
            <div>
              <strong>Happy Hour</strong>
              <small>Descuentos automáticos en horarios de baja ocupación.</small>
            </div>
            <div className="toggle-meta">
              <StatusPill tone={happyHour ? 'success' : 'nude'}>{happyHour ? 'Activo' : 'Inactivo'}</StatusPill>
              <label className="toggle-row">
                <input type="checkbox" checked={happyHour} onChange={() => handleToggle('happyHour', setHappyHour, !happyHour)} />
              </label>
            </div>
          </div>
          <div className="list-row elevated-row">
            <div>
              <strong>Baja ocupación</strong>
              <small>Activar promoción cuando ocupación sea menor a 40%.</small>
            </div>
            <div className="toggle-meta">
              <StatusPill tone={lowOccupancy ? 'warm' : 'nude'}>{lowOccupancy ? 'Monitoreo' : 'Desactivado'}</StatusPill>
              <label className="toggle-row">
                <input type="checkbox" checked={lowOccupancy} onChange={() => handleToggle('lowOccupancy', setLowOccupancy, !lowOccupancy)} />
              </label>
            </div>
          </div>
          <div className="list-row elevated-row">
            <div>
              <strong>Promoción silenciosa</strong>
              <small>Visible solo para clientes frecuentes.</small>
            </div>
            <div className="toggle-meta">
              <StatusPill tone={silentPromo ? 'sage' : 'nude'}>{silentPromo ? 'Exclusivo' : 'Off'}</StatusPill>
              <label className="toggle-row">
                <input type="checkbox" checked={silentPromo} onChange={() => handleToggle('silentPromo', setSilentPromo, !silentPromo)} />
              </label>
            </div>
          </div>
          <div className="list-row elevated-row">
            <div>
              <strong>Servicio destacado</strong>
              <small>Impulsar un servicio específico semanalmente.</small>
            </div>
            <Button size="sm">Configurar</Button>
          </div>
          <div className="list-row elevated-row">
            <div>
              <strong>{promotionSummary.name}</strong>
              <small>{promotionSummary.message}</small>
            </div>
            <StatusPill tone={promotionSummary.status === 'Activo' ? 'success' : 'neutral'}>{promotionSummary.status}</StatusPill>
          </div>
        </div>
      </Card>

      <Card className="mobile-screen primary-panel">
        <PanelHeader title="Sistema de lealtad" eyebrow="Recompensas" />
        <div className="form-stack compact-form">
          <label className="input-field">
            <span>Visitas requeridas</span>
            <select value={visitsRequired} onChange={(e) => setVisitsRequired(Number(e.target.value))}>
              <option value={3}>3</option>
              <option value={5}>5</option>
              <option value={10}>10</option>
            </select>
          </label>
          <label className="input-field">
            <span>Porcentaje descuento</span>
            <select value={discountPercent} onChange={(e) => setDiscountPercent(Number(e.target.value))}>
              <option value={5}>5%</option>
              <option value={10}>10%</option>
              <option value={15}>15%</option>
              <option value={20}>20%</option>
              <option value={25}>25%</option>
              <option value={35}>35%</option>
            </select>
          </label>
          <label className="input-field">
            <span>Vigencia</span>
            <select value={validityDays} onChange={(e) => setValidityDays(Number(e.target.value))}>
              <option value={30}>30 días</option>
              <option value={45}>45 días</option>
              <option value={60}>60 días</option>
              <option value={90}>90 días</option>
            </select>
          </label>
          <div className="list-row elevated-row">
            <div>
              <strong>Preview</strong>
              <small>{loyaltyPreview}</small>
            </div>
          </div>
          <div className="list-row elevated-row">
            <div>
              <strong>Nivel actual</strong>
              <small>{loyaltyTier}</small>
            </div>
          </div>
          <label className="toggle-row">
            Programa activo
            <input type="checkbox" checked={loyaltyActive} onChange={() => handleToggle('loyaltyActive', setLoyaltyActive, !loyaltyActive)} />
          </label>
        </div>
      </Card>

      <Card className="mobile-screen primary-panel">
        <PanelHeader title="Clientes VIP" eyebrow="Beneficios premium" />
        <div className="compact-list">
          {vipClients.map((client) => (
            <div className="list-row elevated-row" key={client.name}>
              <div>
                <strong>{client.name}</strong>
                <small>{client.visits} visitas / {client.benefits.join(', ')}</small>
              </div>
              <StatusPill tone="rose">VIP</StatusPill>
            </div>
          ))}
        </div>
        <Button className="full-width" variant="ghost" onClick={() => setIsPremiumModalOpen(true)}>
          Gestionar beneficios
        </Button>
      </Card>

      <Card className="mobile-screen primary-panel">
        <PanelHeader title="Automatizaciones" eyebrow="Marketing inteligente" />
        <div className="compact-list">
          {automations.map((auto) => (
            <div className="list-row elevated-row" key={auto.name}>
              <div>
                <strong>{auto.name}</strong>
                <small>Automatización de comunicación.</small>
              </div>
              <label className="toggle-row">
                <input type="checkbox" checked={automationStates[auto.name]} onChange={() => toggleAutomation(auto.name)} />
              </label>
            </div>
          ))}
        </div>
      </Card>

      <Card className="wide-card mobile-screen primary-panel">
        <PanelHeader title="Studio Flow te recomienda" eyebrow="Insights inteligentes" />
        <div className="compact-list">
          {dynamicInsights.map((insight) => (
            <div className="list-row elevated-row" key={insight.title}>
              <div>
                <strong>{insight.title}</strong>
                <small>{insight.message}</small>
              </div>
              <StatusPill tone={insight.tone}>{insight.tone === 'success' ? 'OK' : insight.tone === 'rose' ? 'Alerta' : 'Aviso'}</StatusPill>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mobile-screen primary-panel">
        <PanelHeader title="Analytics rápidos" eyebrow="Métricas clave" />
        <div className="compact-list">
          {analyticsRows.map((row) => (
            <div className="list-row elevated-row" key={row.title}>
              <div>
                <strong>{row.title}</strong>
                <small>{row.description}</small>
              </div>
              <StatusPill tone={row.tone}>{row.label}</StatusPill>
            </div>
          ))}
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
                  {premiumClients.map((client) => (
                    <div key={client.name} className="vip-card">
                      <div>
                        <strong>{client.name}</strong>
                        <small>{client.tier} • {client.visits} visitas</small>
                      </div>
                      <span className="vip-card-badge">{client.tier}</span>
                    </div>
                  ))}
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
