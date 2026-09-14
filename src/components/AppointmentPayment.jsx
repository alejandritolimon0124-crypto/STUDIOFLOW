export default function AppointmentPayment({ appointment, compact = false }) {
  const payment = appointment?.paymentDetails
  if (!payment) return <small>Importe por confirmar</small>
  const money = (value) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: payment.currency || 'MXN' }).format(value)
  const row = compact ? { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'baseline' } : { display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }
  return (
    <dl className={compact ? 'appointment-payment-compact' : undefined} style={{ margin: compact ? 0 : '12px 0 0', minWidth: 0, fontSize: 14, lineHeight: compact ? 1.4 : 1.6 }}>
      {payment.original != null && <div style={row}><dt>Costo original</dt><dd style={{ margin: 0 }}>{money(payment.original)}</dd></div>}
      {payment.discountPercent > 0 && <div style={row}><dt>{payment.points > 0 ? `Flow Points (${payment.points} pts)` : 'Descuento promocional'}</dt><dd style={{ margin: 0 }}>{payment.discountPercent}%{payment.original != null ? ` / -${money(payment.original - payment.total)}` : ''}</dd></div>}
      <div style={{ ...row, fontWeight: 800 }}><dt>{appointment.appointmentStatus === 'cancelled' ? 'Importe de la cita cancelada' : 'Total a pagar'}</dt><dd style={{ margin: 0 }}>{money(payment.total)}</dd></div>
    </dl>
  )
}
