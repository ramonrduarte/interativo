import React from 'react'
import ContentRenderer from './ContentRenderer.jsx'

export default function ZoneRenderer({ item, zoneLabel }) {
  if (!item) {
    return (
      <div style={{
        width: '100%', height: '100%', background: '#111',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#333', fontSize: 14,
      }}>
        {zoneLabel || 'Zona'}
      </div>
    )
  }

  return (
    <div className="layout-zone" style={{ position: 'relative', width: '100%', height: '100%' }}>
      <ContentRenderer key={item.type + '-' + (item.url || item.content)} item={item} />
    </div>
  )
}
