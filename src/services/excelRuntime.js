let pendingRuntime

export function loadExcelRuntime() {
  if (globalThis.ExcelJS?.Workbook) return Promise.resolve(globalThis.ExcelJS)
  if (pendingRuntime) return pendingRuntime

  pendingRuntime = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = '/vendor/exceljs.js'
    script.async = true
    const finish = (error) => {
      window.clearTimeout(timeout)
      script.onload = null
      script.onerror = null
      if (error) {
        script.remove()
        reject(error)
      } else {
        resolve(globalThis.ExcelJS)
      }
    }
    const fail = () => finish(new Error('No se pudo cargar la herramienta de Excel. Revisa tu conexion e intenta descargar nuevamente.'))
    const timeout = window.setTimeout(fail, 30000)
    script.onload = () => globalThis.ExcelJS?.Workbook ? finish() : fail()
    script.onerror = fail
    document.head.appendChild(script)
  }).catch((error) => {
    pendingRuntime = undefined
    throw error
  })
  return pendingRuntime
}
