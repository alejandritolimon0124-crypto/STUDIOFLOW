import { useEffect, useState } from 'react'
import { Search, UserRoundCheck } from 'lucide-react'
import { requireSupabase } from '../lib/supabaseClient'

export default function CardRecipientPicker({ studioId, selected, onSelect }) {
  const [query, setQuery] = useState('')
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (query.trim().length < 2) return undefined
    let active = true
    const timer = window.setTimeout(async () => {
      setLoading(true)
      try {
        const { data, error: failure } = await requireSupabase().rpc('studio_flow_search_card_clients', {
          p_studio_id: studioId, p_query: query.trim(), p_limit: 10,
        })
        if (failure) throw failure
        if (active) { setClients(Array.isArray(data) ? data : []); setError('') }
      } catch (failure) { if (active) setError(failure.message || 'No pudimos buscar clientas.') }
      finally { if (active) setLoading(false) }
    }, 280)
    return () => { active = false; window.clearTimeout(timer) }
  }, [query, studioId])

  return <div className="card-recipient-picker">
    <div className="card-recipient-heading"><UserRoundCheck size={20} /><div><strong>Para una clienta especial</strong><small>Busca entre quienes ya atendiste en este negocio.</small></div></div>
    {selected ? <div className="card-recipient-selected"><strong>{selected.name}</strong><button type="button" onClick={() => { onSelect(null); setQuery(''); setClients([]) }}>Cambiar</button></div>
      : <><label className="card-recipient-search"><Search size={19} /><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setClients([]) }} placeholder="Nombre o celular de la clienta" /></label>
        {loading && <small>Buscando...</small>}{error && <small role="alert">{error}</small>}
        {query.trim().length >= 2 && !loading && !error && <div className="card-recipient-results">{clients.length ? clients.map((client) => <button key={client.id} type="button" onClick={() => onSelect(client)}><span><strong>{client.name}</strong><small>{client.phone || 'Perfil activo en Studio Flow'}</small></span><span>Crear tarjeta especial</span></button>) : <small>No encontramos clientas atendidas con esa búsqueda.</small>}</div>}</>}
  </div>
}
