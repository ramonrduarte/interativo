import React, { useEffect, useState, useRef } from 'react'
import ZoneRenderer from './ZoneRenderer.jsx'
import Ticker from './Ticker.jsx'

const LAYOUT_CLASS = {
  // landscape
  fullscreen:      'layout-fullscreen',
  split5050:       'layout-split5050',
  split7030:       'layout-split7030',
  topbottom:       'layout-topbottom',
  grid2x2:         'layout-grid2x2',
  mainbanner:      'layout-mainbanner',
  // portrait
  'v-fullscreen':  'layout-v-fullscreen',
  'v-half':        'layout-v-half',
  'v-7030':        'layout-v-7030',
  'v-thirds':      'layout-v-thirds',
  'v-mainbanner':  'layout-v-mainbanner',
  'v-grid2x2':     'layout-v-grid2x2',
}

export default function LayoutEngine({ config }) {
  const { slides = [], ticker, screen } = config
  const isPortrait = screen?.orientation === 'portrait'
  const [currentIndex, setCurrentIndex] = useState(0)
  const timerRef = useRef(null)
  const slidesRef = useRef(slides)

  useEffect(() => { slidesRef.current = slides }, [slides])

  // Reset to first slide when slide list identity changes
  useEffect(() => {
    setCurrentIndex(0)
  }, [slides.map(s => s.id).join(',')])

  // Advance to next slide after duration
  useEffect(() => {
    if (!slides || slides.length === 0) return

    const slide = slides[currentIndex] || slides[0]
    const duration = (slide?.duration || 10) * 1000

    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setCurrentIndex(prev => (prev + 1) % slidesRef.current.length)
    }, duration)

    return () => clearTimeout(timerRef.current)
  }, [currentIndex, slides.length])

  if (!slides || slides.length === 0) {
    return (
      <div className={`tv-root${isPortrait ? ' portrait' : ''}`} style={{ alignItems: 'center', justifyContent: 'center', background: '#111' }}>
        <p style={{ color: '#444', fontSize: 18 }}>Nenhum slide configurado</p>
      </div>
    )
  }

  const slide = slides[currentIndex] || slides[0]
  const template = slide.layout?.template || 'fullscreen'
  const zones = slide.layout?.zones || [{ id: 0, label: 'Principal' }]
  const TICKER_H = 60
  const contentHeight = ticker ? `calc(100vh - ${TICKER_H}px)` : '100vh'

  return (
    <div className={`tv-root${isPortrait ? ' portrait' : ''}`}>
      <div
        className={LAYOUT_CLASS[template] || 'layout-fullscreen'}
        style={{ height: contentHeight }}
      >
        {zones.map((z, i) => (
          <ZoneRenderer key={`${slide.id}-${i}`} item={slide.zones?.[i] || null} zoneLabel={z.label} />
        ))}
      </div>

      {ticker && <Ticker ticker={ticker} />}
    </div>
  )
}
