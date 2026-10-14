import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import BirthdayCardView from '../../components/BirthdayCardView'
import { requireSupabase } from '../../lib/supabaseClient'
import { paths } from '../../routes/paths'

export default function BirthdayCard() {
  const { id } = useParams()
  const [card, setCard] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    requireSupabase().rpc('studio_flow_get_birthday_card', { p_notice_id: id })
      .then(({ data, error }) => { if (error) throw error; if (active) setCard(data) })
      .catch(() => { if (active) setCard(null) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [id])
  return <main className="birthday-page" style={{ minHeight: '100vh', padding: 'clamp(22px, 5vw, 50px) 15px', background: '#fff7f6' }}>
    <div style={{ maxWidth: 540, margin: '0 auto 18px' }}><Link to={paths.clientRewards}>Volver a Studio Flow</Link></div>
    {loading ? <p role="status">Preparando tu felicitación...</p> : card ? <BirthdayCardView {...card} /> : <p role="alert">Esta felicitación no está disponible en tu perfil.</p>}
  </main>
}
