import React from 'react'

export default function Ticker({ ticker }) {
  if (!ticker) return null

  const messages = ticker?.messages?.length
    ? ticker.messages
    : ticker?.message
      ? [{ text: ticker.message }]
      : []

  const fullText = messages.map(m => m.text).filter(Boolean).join('   •   ')
  if (!fullText) return null

  const duration = Math.max(5, Math.round(fullText.length * 0.18 / (ticker.speed / 60 || 1))) + 's'

  return (
    <div
      className="ticker-bar"
      style={{ background: ticker.bgColor || '#dc2626', height: 60 }}
    >
      <div
        className="ticker-inner"
        style={{
          color: ticker.color || '#fff',
          fontSize: (ticker.fontSize || 32) + 'px',
          animationDuration: duration,
          padding: '0 40px',
        }}
      >
        {fullText}
      </div>
    </div>
  )
}
