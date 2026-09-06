const GEOLOCATION_TIMEOUT_MS = 20000

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
    let watchId
    let bestPosition
    const finish = (error) => {
      clearTimeout(timer)
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId)
      if (bestPosition && bestPosition.coords.accuracy <= 200) {
        resolve({
          latitude: formatDetectedCoordinate(bestPosition.coords.latitude),
          longitude: formatDetectedCoordinate(bestPosition.coords.longitude),
          accuracy: Math.round(bestPosition.coords.accuracy),
        })
      } else {
        reject(error || new Error('La ubicacion recibida es poco precisa. Activa la ubicacion precisa del dispositivo e intenta nuevamente.'))
      }
    }
    const timer = setTimeout(() => finish(), GEOLOCATION_TIMEOUT_MS)
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (!bestPosition || position.coords.accuracy < bestPosition.coords.accuracy) bestPosition = position
        if (position.coords.accuracy <= 50) finish()
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          finish(new Error('Permite el acceso a tu ubicacion para detectar las coordenadas.'))
          return
        }

        if (error.code === error.POSITION_UNAVAILABLE) {
          finish(new Error('No se pudo detectar tu ubicacion actual.'))
          return
        }

        if (error.code === error.TIMEOUT) {
          finish(new Error('La deteccion de ubicacion tardo demasiado.'))
          return
        }

        finish(new Error('No se pudo usar la ubicacion actual.'))
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: GEOLOCATION_TIMEOUT_MS,
      },
    )
  })
}
