import { useState } from 'react'
import studioFlowLogo from '../assets/studioflow-logo.png'

function BrandLogo({ compact = false, hero = false, className = '' }) {
  const [logoReady, setLogoReady] = useState(true)

  return (
    <span className={`brand-logo ${compact ? 'brand-logo-compact' : ''} ${hero ? 'brand-logo-hero' : ''} ${className}`}>
      {logoReady && (
        <img
          src={studioFlowLogo}
          alt="Studio Flow"
          onError={() => setLogoReady(false)}
        />
      )}
      {!logoReady && <span className="brand-logo-fallback">SF</span>}
      {!hero && <strong>Studio Flow</strong>}
    </span>
  )
}

export default BrandLogo
