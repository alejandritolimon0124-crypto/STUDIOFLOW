import { useEffect, useState } from 'react'
import { CreditCard, Save } from 'lucide-react'
import { fetchPaymentSettings, savePaymentSettings } from '../services/depositService'
import '../styles/appointment-deposits.css'

const percentOptions = [10, 20, 30, 50]
const empty = { enabled: false, kind: 'percent', value: 10, bankName: '', accountHolder: '', clabe: '', terms: '' }

export default function BusinessPaymentSettings({ scopeType, scopeId }) {
  const [draft, setDraft] = useState(empty)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  useEffect(() => {
    if (!scopeId) return undefined
    let active = true
    fetchPaymentSettings(scopeType, scopeId).then((settings) => {
      if (active) setDraft({
        enabled: Boolean(settings.deposit_enabled), kind: settings.deposit_kind || 'percent',
        value: settings.deposit_value || (settings.deposit_kind === 'fixed' ? '' : 10), bankName: settings.bank_name || '',
        accountHolder: settings.account_holder || '', clabe: settings.clabe || '',
        terms: settings.payment_terms || '',
      })
    }).catch((error) => { if (active) setFeedback(error.message) })
    return () => { active = false }
  }, [scopeType, scopeId])

  const update = (field, value) => setDraft((current) => ({ ...current, [field]: value }))
  const changeKind = (kind) => setDraft((current) => ({ ...current, kind, value: kind === 'percent' ? 10 : '' }))
  const customPercent = draft.kind === 'percent' && Number(draft.value) > 0 && !percentOptions.includes(Number(draft.value))
  const save = async () => {
    setBusy(true); setFeedback('')
    try {
      await savePaymentSettings(scopeType, scopeId, draft)
      setFeedback(draft.enabled ? 'Anticipos activados para nuevas reservas.' : 'Datos guardados. Las clientas podrán consultar la tarjeta de pago en sus citas, sin anticipo automático.')
    } catch (error) { setFeedback(error.message || 'No se pudo guardar.') }
    finally { setBusy(false) }
  }

  if (!scopeId) return null
  return <section className="profile-foundation-card business-payment-settings">
    <div className="deposit-section-heading"><CreditCard size={24} aria-hidden="true" /><div><span className="eyebrow">COBROS DIRECTOS</span><h3>Datos para cobrar tus citas</h3><small>Tu clienta te transfiere directamente. Tú confirmas cuando recibas el pago.</small></div></div>
    <label className="deposit-toggle"><input type="checkbox" checked={draft.enabled} onChange={(event) => update('enabled', event.target.checked)} /><span>Solicitar anticipo en nuevas reservas</span></label>
    {!draft.enabled && <small className="deposit-settings-note">Si guardas banco, titular y CLABE, tus clientas podrán consultar los datos desde sus citas. No se solicitará anticipo automático.</small>}
    <div className="deposit-field-grid">
      <label className="input-field"><span>Tipo de anticipo</span><select value={draft.kind} onChange={(event) => changeKind(event.target.value)}><option value="percent">Porcentaje</option><option value="fixed">Importe fijo</option></select></label>
      <label className="input-field"><span>{draft.kind === 'percent' ? 'Porcentaje (%)' : 'Importe (MXN)'}</span>{draft.kind === 'percent'
        ? <select value={draft.value} onChange={(event) => update('value', Number(event.target.value))}>{customPercent && <option value={draft.value}>{draft.value}% (configurado)</option>}{percentOptions.map((percent) => <option key={percent} value={percent}>{percent}%</option>)}</select>
        : <input type="number" min="0" step="0.01" value={draft.value} onChange={(event) => update('value', event.target.value)} />}</label>
    </div>
    <div className="deposit-field-grid"><label className="input-field"><span>Banco</span><input value={draft.bankName} onChange={(event) => update('bankName', event.target.value)} /></label><label className="input-field"><span>Titular de la cuenta</span><input value={draft.accountHolder} onChange={(event) => update('accountHolder', event.target.value)} /></label></div>
    <label className="input-field"><span>CLABE interbancaria</span><input inputMode="numeric" maxLength={18} value={draft.clabe} onChange={(event) => update('clabe', event.target.value.replace(/\D/g, ''))} /><small>Se mostrará únicamente en la tarjeta de pago de cada cita.</small></label>
    <label className="input-field"><span>Indicaciones de pago</span><textarea rows="2" maxLength={500} value={draft.terms} onChange={(event) => update('terms', event.target.value)} placeholder="Por ejemplo: avísame por WhatsApp después de transferir." /></label>
    <button type="button" className="deposit-save-button" disabled={busy} onClick={save}><Save size={18} />{busy ? 'Guardando...' : 'Guardar cobros'}</button>
    {feedback && <small role="status" className="deposit-feedback">{feedback}</small>}
  </section>
}
