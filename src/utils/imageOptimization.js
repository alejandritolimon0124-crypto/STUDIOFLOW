const DEFAULT_MAX_BYTES = 20 * 1024 * 1024

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

export async function optimizeImageFile(file, {
  maxWidth = 1200,
  maxHeight = 1200,
  quality = 0.78,
  maxBytes = DEFAULT_MAX_BYTES,
} = {}) {
  if (!file) throw new Error('Selecciona una fotografia.')
  if (!String(file.type || '').startsWith('image/')) throw new Error('El archivo seleccionado no es una imagen.')
  if (file.size > maxBytes) throw new Error('La fotografia supera 20 MB. Elige una imagen mas pequena.')

  const source = await readAsDataUrl(file)
  const image = await loadImage(source)
  const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight)
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { alpha: false })

  if (!context) throw new Error('Este dispositivo no pudo optimizar la fotografia.')

  canvas.width = width
  canvas.height = height
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, width, height)

  const optimized = canvas.toDataURL('image/webp', quality)
  if (!optimized.startsWith('data:image/webp')) throw new Error('Este navegador no permite convertir fotografias a WebP.')

  return optimized
}

