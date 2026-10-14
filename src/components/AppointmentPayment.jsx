export default function AppointmentPayment({ appointment, compact = false }) {
  const payment = appointment?.paymentDetails
  if (!payment) return <small>Importe por confirmar</small>
  const money = (value) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: payment.currency || 'MXN' }).format(value)
  const row = compact ? { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'baseline' } : { display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }
  const happyHourDiscount = Number(payment.happyHourDiscount || 0)
  const pointsDiscount = Number(payment.pointsDiscount || 0)
  const otherDiscount = Math.max(0, Number(payment.original || 0) - Number(payment.total || 0) - happyHourDiscount - pointsDiscount)
  return (
    <dl className={compact ? 'appointment-payment-compact' : undefined} style={{ margin: compact ? 0 : '12px 0 0', minWidth: 0, fontSize: 14, lineHeight: compact ? 1.4 : 1.6 }}>
      {payment.original != null && <div style={row}><dt>Costo original</dt><dd style={{ margin: 0 }}>{money(payment.original)}</dd></div>}
      {happyHourDiscount > 0 && <div style={row}><dt>Happy Hour ({payment.happyHourPercent}%)</dt><dd style={{ margin: 0 }}>-{money(happyHourDiscount)}</dd></div>}
      {pointsDiscount > 0 && <div style={row}><dt>Flow Points ({payment.points} FP)</dt><dd style={{ margin: 0 }}>-{money(pointsDiscount)}</dd></div>}
      {otherDiscount > 0.009 && <div style={row}><dt>Beneficio aplicado</dt><dd style={{ margin: 0 }}>-{money(otherDiscount)}</dd></div>}
      <div style={{ ...row, fontWeight: 800 }}><dt>{appointment.appointmentStatus === 'cancelled' ? 'Importe de la cita cancelada' : 'Total a pagar'}</dt><dd style={{ margin: 0 }}>{money(payment.total)}</dd></div>
    </dl>
  )
}
