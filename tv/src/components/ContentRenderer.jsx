import React, { useEffect, useState, useRef } from 'react'
import Hls from 'hls.js'

export default function ContentRenderer({ item, containerHeight }) {
  if (!item) return <div style={{ background: '#111', width: '100%', height: '100%' }} />

  switch (item.type) {
    case 'image':        return <ImageContent item={item} />
    case 'video':        return <VideoContent item={item} />
    case 'youtube':      return <YoutubeContent item={item} />
    case 'webpage':      return <WebpageContent item={item} />
    case 'text':         return <TextContent item={item} />
    case 'clock':        return <ClockContent item={item} />
    case 'priceboard':   return <PriceboardContent item={item} containerHeight={containerHeight} />
    case 'iptvchannel':  return <IptvContent item={item} />
    default: return <div style={{ background: '#111', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555' }}>{item.type}</div>
  }
}

function ImageContent({ item }) {
  return <img src={item.url} alt={item.name} className="content-image" loading="lazy" style={{ objectFit: item.objectFit || 'cover' }} />
}

function VideoContent({ item }) {
  const ref = useRef()
  useEffect(() => {
    if (ref.current) {
      ref.current.src = item.url
      ref.current.play().catch(() => {})
    }
  }, [item.url])
  return (
    <video
      ref={ref}
      className="content-video"
      autoPlay
      muted
      loop
      playsInline
      src={item.url}
      style={{ objectFit: item.objectFit || 'cover' }}
    />
  )
}

function YoutubeContent({ item }) {
  // Normalize to youtube-nocookie.com (fewer embed restrictions) and ensure needed params
  const src = React.useMemo(() => {
    try {
      const url = new URL(item.url)
      // Switch to nocookie domain
      url.hostname = 'www.youtube-nocookie.com'
      // Ensure essential params
      url.searchParams.set('autoplay', '1')
      url.searchParams.set('mute', '1')
      if (!url.searchParams.has('loop')) url.searchParams.set('loop', '1')
      url.searchParams.set('controls', '0')
      url.searchParams.set('rel', '0')
      url.searchParams.set('modestbranding', '1')
      url.searchParams.set('iv_load_policy', '3')
      url.searchParams.set('enablejsapi', '1')
      return url.toString()
    } catch {
      return item.url
    }
  }, [item.url])

  return (
    <iframe
      className="content-iframe"
      src={src}
      allow="autoplay; fullscreen; accelerometer; gyroscope; encrypted-media; picture-in-picture"
      allowFullScreen
      frameBorder="0"
      referrerPolicy="strict-origin-when-cross-origin"
    />
  )
}

function WebpageContent({ item }) {
  return (
    <iframe
      className="content-iframe"
      src={item.url}
      sandbox="allow-scripts allow-same-origin allow-forms"
    />
  )
}

function TextContent({ item }) {
  const cfg = item.content || {}
  return (
    <div
      className="content-text"
      style={{
        background: cfg.bgColor || '#000',
        color: cfg.color || '#fff',
        fontSize: (cfg.fontSize || 48) + 'px',
        textAlign: cfg.align || 'center',
      }}
    >
      {cfg.text || item.name}
    </div>
  )
}

function ClockContent({ item }) {
  const cfg = item.content || {}
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const timeOpts = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: cfg.format === '12h' }
  const dateOpts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
  const tz = cfg.timezone || 'America/Sao_Paulo'

  const timeStr = now.toLocaleTimeString('pt-BR', { ...timeOpts, timeZone: tz })
  const dateStr = now.toLocaleDateString('pt-BR', { ...dateOpts, timeZone: tz })

  // Font size based on container
  const timeFontSize = '8vw'
  const dateFontSize = '2vw'

  return (
    <div className="content-clock" style={{ background: cfg.bgColor || '#000', color: cfg.color || '#fff' }}>
      <div className="clock-time" style={{ fontSize: timeFontSize }}>{timeStr}</div>
      {cfg.showDate !== false && <div className="clock-date" style={{ fontSize: dateFontSize }}>{dateStr}</div>}
    </div>
  )
}

// Xtream Codes servers accept both .ts and .m3u8 — prefer .m3u8 for HLS.js
function resolveStreamUrl(url) {
  if (!url) return url
  // .ts direct stream → try .m3u8 HLS variant (Xtream Codes compatible)
  if (url.match(/\/\d+\.ts(\?.*)?$/)) return url.replace(/\.ts(\?.*)?$/, '.m3u8')
  return url
}

function isHlsUrl(url) {
  return url && (url.includes('.m3u8') || url.includes('m3u8'))
}

function IptvContent({ item }) {
  const ref = useRef()
  const hlsRef = useRef()
  const [error, setError] = useState(false)
  const rawUrl = item.url
  const url = resolveStreamUrl(rawUrl)

  useEffect(() => {
    const video = ref.current
    if (!video || !url) return
    setError(false)

    function tryPlay(streamUrl) {
      if (Hls.isSupported() && (isHlsUrl(streamUrl) || item.content?.isHls)) {
        hlsRef.current?.destroy()
        const hls = new Hls({ enableWorker: false, lowLatencyMode: true })
        hlsRef.current = hls
        hls.loadSource(streamUrl)
        hls.attachMedia(video)
        hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}))
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (data.fatal) {
            // If .m3u8 failed and original was .ts, try the .ts directly
            if (streamUrl !== rawUrl) tryPlay(rawUrl)
            else setError(true)
          }
        })
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = streamUrl
        video.play().catch(() => {})
      } else {
        video.src = streamUrl
        video.play().catch(() => {})
      }
    }

    tryPlay(url)
    return () => { hlsRef.current?.destroy() }
  }, [rawUrl])

  if (error) {
    return (
      <div style={{ width: '100%', height: '100%', background: '#0a0a0a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <div style={{ fontSize: 36 }}>📡</div>
        <div style={{ color: '#555', fontSize: 14 }}>{item.name}</div>
        <div style={{ color: '#333', fontSize: 12 }}>Sinal indisponível</div>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#000' }}>
      <video
        ref={ref}
        style={{ width: '100%', height: '100%', objectFit: item.objectFit || 'cover', display: 'block' }}
        autoPlay muted playsInline
        onError={() => setError(true)}
      />
      {item.content?.showLabel && (
        <div style={{
          position: 'absolute', bottom: 8, left: 8,
          background: 'rgba(0,0,0,.65)', color: '#fff',
          padding: '3px 10px', borderRadius: 4, fontSize: 13, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {item.content?.logo && <img src={item.content.logo} style={{ height: 18, objectFit: 'contain' }} />}
          {item.name}
        </div>
      )}
    </div>
  )
}

function PriceboardContent({ item }) {
  const cfg = item.content || {}
  const items = cfg.items || []
  const currency = cfg.currency || 'R$'
  const accentColor = cfg.accentColor || '#dc2626'

  return (
    <div className="content-priceboard" style={{ background: cfg.bgColor || '#000', color: '#fff' }}>
      {cfg.title && (
        <div className="priceboard-title" style={{ color: accentColor, fontSize: '3vw', borderColor: accentColor }}>
          {cfg.title}
        </div>
      )}
      <div className="priceboard-items">
        {items.map((row, i) => (
          <div key={i} className="priceboard-item" style={{ fontSize: '2.2vw' }}>
            <span className="priceboard-name">{row.name}</span>
            <span className="priceboard-price" style={{ color: accentColor }}>
              {currency} {row.price}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
