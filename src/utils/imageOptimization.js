const DEFAULT_MAX_BYTES = 10 * 1024 * 1024
const DEFAULT_OUTPUT_BYTES = 180 * 1024

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('No se pudo leer la fotografia.'))
    reader.readAsDataURL(file)
  })
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('El formato de esta fotografia no es compatible. Usa JPG, PNG o WebP.'))
    image.src = source
  })
}

function encodeCanvas(canvas, type, quality) {
  try {
    const encoded = canvas.toDataURL(type, quality)
    return encoded.startsWith(`data:${type}`) ? encoded : null
  } catch {
    return null
  }
}

export async function optimizeImageFile(file, {
  maxWidth = 960,
  maxHeight = 960,
  quality = 0.78,
  maxBytes = DEFAULT_MAX_BYTES,
  maxOutputBytes = DEFAULT_OUTPUT_BYTES,
} = {}) {
  if (!file) throw new Error('Selecciona una fotografia.')
  if (!String(file.type || '').startsWith('image/')) throw new Error('El archivo seleccionado no es una imagen.')
  if (file.size > maxBytes) throw new Error('La imagen es demasiado pesada. El tamaño maximo permitido es de 10 MB. Selecciona otra imagen.')

  const source = await readAsDataUrl(file)
  const image = await loadImage(source)
  const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight)
  let width = Math.max(1, Math.round(image.naturalWidth * scale))
  let height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { alpha: false })

  if (!context) throw new Error('Este dispositivo no pudo optimizar la fotografia.')

  for (let sizeAttempt = 0; sizeAttempt < 6; sizeAttempt += 1) {
    canvas.width = width
    canvas.height = height
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(image, 0, 0, width, height)

    for (const currentQuality of [quality, Math.min(quality, 0.68), Math.min(quality, 0.58)]) {
      const optimized = encodeCanvas(canvas, 'image/webp', currentQuality)
        || encodeCanvas(canvas, 'image/jpeg', currentQuality)
      if (!optimized) break
      const encodedLength = optimized.length - optimized.indexOf(',') - 1
      if (Math.ceil(encodedLength * 3 / 4) <= maxOutputBytes) return optimized
    }

    width = Math.max(1, Math.round(width * 0.8))
    height = Math.max(1, Math.round(height * 0.8))
  }

  throw new Error('No se pudo reducir esta fotografia. Selecciona otra imagen.')
}
