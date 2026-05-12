function Input({ label, helper, className = '', ...props }) {
  return (
    <label className={`input-field ${className}`}>
      <span>{label}</span>
      <input {...props} />
      {helper && <small>{helper}</small>}
    </label>
  )
}

export default Input
