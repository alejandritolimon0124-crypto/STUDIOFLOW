const GEOLOCATION_TIMEOUT_MS = 12000

export function isBrowserGeolocationAvailable() {
  return typeof navigator !== 'undefined' && Boolean(navigator.geolocation)
}

export function formatDetectedCoordinate(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number.toFixed(7) : ''
}

export function getCurrentBrowserCoordinates() {
  if (!isBrowserGeolocationAvailable()) {
    return Promise.reject(new Error('Tu navegador no permite detectar ubicacion automaticamente.'))
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: formatDetectedCoordinate(position.coords.latitude),
          longitude: formatDetectedCoordinate(position.coords.longitude),
        })
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(new Error('Permite el acceso a tu ubicacion para detectar las coordenadas.'))
          return
        }

        if (error.code === error.POSITION_UNAVAILABLE) {
          reject(new Error('No se pudo detectar tu ubicacion actual.'))
          return
        }

        if (error.code === error.TIMEOUT) {
          reject(new Error('La deteccion de ubicacion tardo demasiado.'))
          return
        }

        reject(new Error('No se pudo usar la ubicacion actual.'))
      },
      {
        enableHighAccuracy: true,
        maximumAge: 60000,
        timeout: GEOLOCATION_TIMEOUT_MS,
      },
    )
  })
}
