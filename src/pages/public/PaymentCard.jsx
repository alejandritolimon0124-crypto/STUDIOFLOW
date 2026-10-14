import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Check, Copy, CreditCard, Sparkles } from 'lucide-react'
import { fetchPublicPaymentCard, formatPayment } from '../../services/depositService'
import studioFlowLogo from '../../assets/studioflowlogo2.png'
import '../../styles/appointment-deposits.css'

export default function PaymentCard() {
  const { token } = useParams()
  const [searchParams] = useSearchParams()
  const [card, setCard] = useState(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const stage = searchParams.get('etapa') === 'balance' ? 'balance' : 'deposit'
  useEffect(() => {
    const tag = document.querySelector('meta[name="robots"]') || document.createElement('meta')
    const previous = tag.getAttribute('content')
    tag.setAttribute('name', 'robots')
    tag.setAttribute('content', 'noindex, nofollow')
    if (!tag.parentNode) document.head.appendChild(tag)
    return () => { if (previous === null) tag.remove(); else tag.setAttribute('content', previous) }
  }, [])
  useEffect(() => {
    let active = true
    fetchPublicPaymentCard(token).then((data) => {
      if (active) { if (data) setCard(data); else setError('Esta tarjeta no está disponible.') }
    }).catch(() => { if (active) setError('No pudimos abrir esta tarjeta.') })
    return () => { active = false }
  }, [token])
  const copy = async () => {
    try { await navigator.clipboard.writeText(card.clabe); setCopied(true) }
    catch { setError('No se pudo copiar. Mantén presionado el número para seleccionarlo.') }
  }
  const amount = stage === 'balance' ? card?.balance : card?.deposit
  const received = stage === 'balance' ? card?.balanceReceivedAt : card?.depositReceivedAt
  return <main className="payment-card-page"><header className="payment-card-header"><img src={studioFlowLogo} alt="Studio Flow" /></header>
    <article className="payment-card-shell"><div className="payment-card-eyebrow"><Sparkles size={18} /> TU CITA, A TU RITMO</div>
      {error ? <p role="alert">{error}</p> : !card ? <p>Preparando tu tarjeta de pago...</p> : <>
        <h1>{stage === 'deposit' ? 'Tu anticipo' : 'Saldo de tu cita'}</h1><p>Transfiere directamente a <strong>{card.businessName}</strong>.</p>
        {card.cancelled ? <div className="payment-card-state">Esta cita fue cancelada. No realices ningún pago.</div>
          : received ? <div className="payment-card-state"><Check size={20} /> Este pago ya fue confirmado por el negocio.</div>
            : stage === 'balance' && !card.depositReceivedAt ? <div className="payment-card-state">Primero debe confirmarse el anticipo.</div>
              : <><div className="payment-card-amount">{formatPayment(amount)}<small>MXN · {stage === 'deposit' ? 'anticipo' : 'saldo restante'}</small></div>
                <dl className="payment-card-bank"><div><dt>Banco</dt><dd>{card.bankName}</dd></div><div><dt>Titular</dt><dd>{card.accountHolder}</dd></div><div><dt>CLABE</dt><dd className="payment-card-clabe">{card.clabe}</dd></div></dl>
                <button type="button" className="payment-card-copy" onClick={copy}>{copied ? <Check size={20} /> : <Copy size={20} />}{copied ? 'CLABE copiada' : 'Copiar CLABE'}</button>
                <div className="payment-card-total"><CreditCard size={18} /><span>Total de la cita: <strong>{formatPayment(card.total)}</strong></span></div>
                {stage === 'deposit' && <p className="payment-card-remaining">Después de este anticipo quedarán {formatPayment(card.balance)} por pagar.</p>}
                <p className="payment-card-disclaimer">Cuando transfieras, avisa al negocio. Solo él puede verificar la recepción en su cuenta y confirmar el pago.</p></>}
        {card.terms && <p className="payment-card-terms">{card.terms}</p>}
      </>}
    </article><footer>Studio Flow · Los pagos se hacen directamente al negocio.</footer>
  </main>
}
