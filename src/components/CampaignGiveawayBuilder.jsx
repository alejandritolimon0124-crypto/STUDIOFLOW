import { Plus, Trash2 } from 'lucide-react'
import Button from './Button'
import Input from './Input'

const cleanSlug = (value) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const makeChannel = () => ({ id: crypto.randomUUID(), name: '', slug: '' })
const makeRaffle = () => ({ id: crypto.randomUUID(), name: '', groupType: 'all', channelSlug: '', eventType: '', winnerCount: 1, allowRepeat: false })

export default function CampaignGiveawayBuilder({ draft, setDraft }) {
  const channels = draft.channels || []
  const raffles = draft.raffles || []
  const eventTypes = draft.eventTypes || []
  const updateChannel = (index, changes) => setDraft((current) => ({ ...current, channels: current.channels.map((channel, itemIndex) => itemIndex === index ? { ...channel, ...changes } : channel) }))
  const updateRaffle = (index, changes) => setDraft((current) => ({ ...current, raffles: current.raffles.map((raffle, itemIndex) => itemIndex === index ? { ...raffle, ...changes } : raffle) }))

  return <section className="campaign-giveaway-builder">
    <div className="campaign-builder-heading">
      <div><span className="campaign-eyebrow">PASO 2</span><h3>Canales de difusión</h3><p>Cada canal genera un enlace y QR diferente para identificar de dónde llegó cada registro.</p></div>
      <Button type="button" variant="secondary" onClick={() => setDraft((current) => ({ ...current, channels: [...current.channels, makeChannel()] }))}><Plus size={17} /> Agregar canal</Button>
    </div>
    <div className="campaign-channel-editors">
      {channels.map((channel, index) => <article key={channel.id}><Input label={`Canal ${index + 1}`} placeholder="Instagram, TikTok, Facebook..." value={channel.name} onChange={(event) => updateChannel(index, { name: event.target.value, slug: cleanSlug(event.target.value) })} required /><small>Identificador: {channel.slug || 'pendiente'}</small><button type="button" aria-label="Eliminar canal" onClick={() => setDraft((current) => ({ ...current, channels: current.channels.filter((_, itemIndex) => itemIndex !== index), raffles: current.raffles.map((raffle) => raffle.channelSlug === channel.slug ? { ...raffle, channelSlug: '', groupType: 'all' } : raffle) }))}><Trash2 size={17} /></button></article>)}
      {!channels.length && <p className="campaign-builder-empty">El enlace general seguirá disponible. Agrega canales para medir Instagram, TikTok, Facebook u otros medios.</p>}
    </div>

    <div className="campaign-builder-heading campaign-prize-heading">
      <div><span className="campaign-eyebrow">PASO 3</span><h3>Premios y sorteos</h3><p>Configura cada premio y define quiénes participarán en su tómbola.</p></div>
      <Button type="button" variant="secondary" onClick={() => setDraft((current) => ({ ...current, raffles: [...current.raffles, makeRaffle()] }))}><Plus size={17} /> Agregar premio</Button>
    </div>
    <div className="campaign-raffle-editors">
      {raffles.map((raffle, index) => <article key={raffle.id}><header><strong>{index === 0 ? 'Premio principal' : `${index + 1}.° premio`}</strong>{raffles.length > 1 && <button type="button" aria-label="Eliminar premio" onClick={() => setDraft((current) => ({ ...current, raffles: current.raffles.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 size={17} /></button>}</header><Input label="Premio" placeholder="Paquete completo de pestañas" value={raffle.name} onChange={(event) => updateRaffle(index, { name: event.target.value })} required /><label className="input-field"><span>Grupo de participantes</span><select value={raffle.groupType} onChange={(event) => updateRaffle(index, { groupType: event.target.value, channelSlug: event.target.value === 'channel' ? raffle.channelSlug : '', eventType: ['event_type', 'hired_event_type'].includes(event.target.value) ? raffle.eventType : '' })}><option value="all">Todas las participantes</option><option value="channel" disabled={!channels.length}>Un canal específico</option><option value="event_type">Un tipo de evento</option><option value="hired">Solo quienes contrataron</option><option value="hired_event_type">Quienes contrataron + tipo de evento</option><option value="not_hired">Solo registradas que no contrataron</option></select></label>{raffle.groupType === 'channel' && <label className="input-field"><span>Canal</span><select required value={raffle.channelSlug} onChange={(event) => updateRaffle(index, { channelSlug: event.target.value })}><option value="">Selecciona un canal</option>{channels.filter((channel) => channel.name && channel.slug).map((channel) => <option value={channel.slug} key={channel.id}>{channel.name}</option>)}</select></label>}{['event_type', 'hired_event_type'].includes(raffle.groupType) && <label className="input-field"><span>Tipo de evento</span><select required value={raffle.eventType} onChange={(event) => updateRaffle(index, { eventType: event.target.value })}><option value="">Selecciona un tipo</option>{eventTypes.filter(Boolean).map((eventType) => <option value={eventType} key={eventType}>{eventType}</option>)}</select></label>}<Input label="Número de ganadoras" type="number" min="1" max="20" value={raffle.winnerCount} onChange={(event) => updateRaffle(index, { winnerCount: Math.max(1, Math.min(20, Number(event.target.value) || 1)) })} /><label className="campaign-required-toggle"><input type="checkbox" checked={raffle.allowRepeat} onChange={(event) => updateRaffle(index, { allowRepeat: event.target.checked })} /><span>Permitir que una ganadora participe en otros premios</span></label></article>)}
    </div>
  </section>
}
