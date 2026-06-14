export function getMaxBirthDateForAdult(referenceDate = new Date()) {
  const date = new Date(referenceDate)
  date.setFullYear(date.getFullYear() - 18)
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 10)
}

export function validateBirthDate(value, { required = true } = {}) {
  const birthDate = String(value || '').trim()

  if (!birthDate) {
    return required ? 'La fecha de nacimiento es obligatoria.' : ''
  }

  const parsed = new Date(`${birthDate}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return 'La fecha de nacimiento no es valida.'
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (parsed > today) {
    return 'La fecha de nacimiento no puede ser futura.'
  }

  if (birthDate > getMaxBirthDateForAdult(today)) {
    return 'Debes tener al menos 18 anos.'
  }

  return ''
}
