import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const pages = {
  '/': {
    title: 'Studio Flow | Salones de belleza, spa y citas en una app',
    description: 'Encuentra salones de belleza y spa, artistas de uñas, maquillaje, pestañas y más. Compara servicios y horarios, reserva tu cita en una sola app y gana Flow Points.',
    canonical: 'https://studioflow.vip/',
  },
  '/para-clientas': {
    title: 'Studio Flow | Citas de belleza, uñas, maquillaje y spa',
    description: 'Descubre artistas y estudios de belleza en Studio Flow. Explora servicios de uñas, maquillaje, pestañas, faciales, spa y estética; consulta horarios y reserva tu cita.',
    canonical: 'https://studioflow.vip/para-clientas',
  },
  '/profesionales': {
    title: 'Studio Flow para artistas y estudios de belleza | Agenda y clientas',
    description: 'Organiza citas y servicios de uñas, maquillaje, spa y estética en Studio Flow. Muestra tu trabajo, recibe reservas y crea beneficios para tus clientas.',
    canonical: 'https://studioflow.vip/profesionales',
  },
}

function setMeta(selector, attribute, value) {
  let element = document.head.querySelector(selector)
  if (!element) {
    element = document.createElement('meta')
    const match = selector.match(/meta\[(name|property)="([^"]+)"\]/)
    element.setAttribute(match[1], match[2])
    document.head.appendChild(element)
  }
  element.setAttribute(attribute, value)
}

export default function SeoMeta() {
  const { pathname } = useLocation()

  useEffect(() => {
    const page = pages[pathname]
    document.title = page?.title || 'Studio Flow'
    setMeta('meta[name="robots"]', 'content', page ? 'index, follow' : 'noindex, follow')
    setMeta('meta[name="description"]', 'content', page?.description || 'Studio Flow: belleza, citas y beneficios en un solo lugar.')
    setMeta('meta[property="og:title"]', 'content', page?.title || 'Studio Flow')
    setMeta('meta[property="og:description"]', 'content', page?.description || 'Studio Flow: belleza, citas y beneficios en un solo lugar.')
    setMeta('meta[property="og:url"]', 'content', page?.canonical || `https://studioflow.vip${pathname}`)

    let canonical = document.head.querySelector('link[rel="canonical"]')
    if (page) {
      if (!canonical) {
        canonical = document.createElement('link')
        canonical.rel = 'canonical'
        document.head.appendChild(canonical)
      }
      canonical.href = page.canonical
    } else {
      canonical?.remove()
    }
  }, [pathname])

  return null
}
