import { useState } from 'react'
import { Check, Copy, CreditCard, Share2 } from 'lucide-react'
import { confirmAppointmentPayment, formatPayment, prepareExistingAppointmentPayment } from '../services/depositService'
import '../styles/appointment-deposits.css'

export default function AppointmentDeposit({ appointment, audience = 'client', onUpdated }) {
  const deposit = appointment?.depositPlan
  const account = deposit || appointment?.paymentAccount
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [copied, setCopied] = useState(false)
  const prepare = async () => {
    if (!window.confirm('¿Quieres mostrar los datos de anticipo a la clienta para esta cita ya reservada?')) return
    setBusy(true); setMessage('')
    try { await prepareExistingAppointmentPayment(appointment.id); onUpdated?.() }
    catch (error) { setMessage(error.message || 'No se pudo preparar la tarjeta de pago.') }
    finally { setBusy(false) }
  }
  const cancelled = appointment?.appointmentStatus === 'cancelled'
  const stage = deposit?.depositReceivedAt ? 'balance' : 'deposit'
  const paid = Boolean(deposit?.balanceReceivedAt)
  const amountAvailable = deposit || appointment?.paymentDetails?.total != null
  const amount = deposit ? (stage === 'deposit' ? deposit.deposit : deposit.balance) : Number(appointment?.paymentDetails?.total || 0)
  const url = deposit ? `${window.location.origin}/pago/${deposit.shareToken}?etapa=${stage}` : ''
  const share = async () => {
    const label = stage === 'deposit' ? 'anticipo' : 'saldo de tu cita'
    const text = `Hola, te comparto con gusto los datos para el ${label} de tu cita. El importe es ${formatPayment(amount)} y aquí puedes abrir tu tarjeta de pago y copiar la CLABE: ${url}`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
  }
  const copyClabe = async () => {
    try {
      await navigator.clipboard.writeText(account.clabe)
      setCopied(true)
      setMessage('CLABE copiada. Verifica el titular antes de transferir.')
    } catch {
      setMessage('No se pudo copiar. Mantén presionada la CLABE para seleccionarla.')
    }
  }
  const confirm = async () => {
    if (!window.confirm(`¿Ya verificaste en tu banco que recibiste ${formatPayment(amount)}?`)) return
    setBusy(true); setMessage('')
    try { await confirmAppointmentPayment(appointment.id, stage); setMessage('Pago registrado.'); onUpdated?.() }
    catch (error) { setMessage(error.message || 'No se pudo registrar el pago.') }
    finally { setBusy(false) }
  }
  if (!deposit && audience === 'business') return appointment?.appointmentStatus === 'scheduled'
    ? <div className="appointment-deposit appointment-deposit-prepare"><button type="button" disabled={busy} onClick={prepare}>{busy ? 'Preparando...' : 'Preparar tarjeta de pago'}</button>{message && <small role="status">{message}</small>}</div>
    : null
  if (!deposit && !account) return audience === 'client' && appointment?.appointmentStatus === 'scheduled'
    ? <small className="appointment-payment-unavailable">Este negocio aún no ha compartido datos para transferir.</small>
    : null
  if (audience === 'client' && !deposit) return <details id={`client-payment-card-${appointment.id}`} className="appointment-deposit appointment-deposit-disclosure">
    <summary><span><CreditCard size={19} aria-hidden="true" />Ver tarjeta de pago</span><strong>{amountAvailable ? formatPayment(amount) : 'Importe por confirmar'}</strong></summary>
    <small>{amountAvailable ? 'Este es el total de tu cita. ' : 'El importe se confirmará con el negocio. '}El negocio no solicita anticipo automático.</small>
    <div className="appointment-deposit-bank" aria-label="Datos para transferir al negocio"><div><span>Banco</span><strong>{account.bankName}</strong></div><div><span>Titular</span><strong>{account.accountHolder}</strong></div><div><span>CLABE</span><strong className="appointment-deposit-clabe">{account.clabe}</strong></div><button type="button" onClick={copyClabe}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'CLABE copiada' : 'Copiar CLABE'}</button></div>
    <small>Transfiere directamente al negocio solo cuando acuerdes el pago con él. Studio Flow no procesa ni confirma transferencias.</small>
    {account.terms && <small>{account.terms}</small>}
    {message && <small role="status">{message}</small>}
  </details>
  if (audience === 'client') return <details id={`client-payment-card-${appointment.id}`} className="appointment-deposit appointment-deposit-disclosure">
    <summary><span><CreditCard size={19} aria-hidden="true" />{cancelled ? 'Cita cancelada' : paid ? 'Pago completado' : stage === 'deposit' ? 'Ver tarjeta de anticipo' : 'Ver tarjeta de saldo'}</span><strong>{formatPayment(paid ? deposit.total : amount)}</strong></summary>
    {!cancelled && !paid && <><div className="appointment-deposit-bank" aria-label="Datos para transferir al negocio"><div><span>Banco</span><strong>{deposit.bankName}</strong></div><div><span>Titular</span><strong>{deposit.accountHolder}</strong></div><div><span>CLABE</span><strong className="appointment-deposit-clabe">{deposit.clabe}</strong></div><button type="button" onClick={copyClabe}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'CLABE copiada' : 'Copiar CLABE'}</button></div><small>Transfiere directamente al negocio y avísale cuando lo hagas. El negocio verificará el pago en su cuenta.{stage === 'deposit' ? ` Después quedarán ${formatPayment(deposit.balance)} por pagar.` : ''}</small></>}
    {cancelled && deposit.depositReceivedAt && <small>El anticipo recibido queda registrado. Cualquier devolución se acuerda directamente con el negocio.</small>}
    {deposit.terms && <small>{deposit.terms}</small>}
    {message && <small role="status">{message}</small>}
  </details>
  return <div className="appointment-deposit">
    <div className="appointment-deposit-summary"><span>{cancelled ? 'Cita cancelada' : paid ? 'Cita liquidada' : stage === 'deposit' ? 'Pendiente de anticipo' : 'Anticipo recibido · saldo pendiente'}</span><strong>{formatPayment(paid ? deposit.total : amount)}</strong></div>
    {audience === 'business' && !cancelled && !paid && <div className="appointment-deposit-actions"><button type="button" onClick={share}><Share2 size={16} /> {`Compartir ${stage === 'deposit' ? 'anticipo' : 'saldo'}`}</button><button type="button" disabled={busy} onClick={confirm}><Check size={16} /> {busy ? 'Guardando...' : 'Confirmar recibido'}</button></div>}
    {message && <small role="status">{message}</small>}
  </div>
}
