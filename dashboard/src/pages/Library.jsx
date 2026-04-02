import React, { useEffect, useState, useRef } from 'react'
import { api } from '../api.js'

const TYPE_ICONS = { image: '🖼️', video: '🎬', youtube: '▶️', webpage: '🌐', text: '📝', clock: '🕐', priceboard: '💰', iptvchannel: '📡' }
const TYPE_LABELS = { image: 'Imagem', video: 'Vídeo', youtube: 'YouTube', webpage: 'Página Web', text: 'Texto', clock: 'Relógio', priceboard: 'Tabela de Preços', iptvchannel: 'Canal IPTV' }

export default function Library() {
  const [items, setItems] = useState([])
  const [filter, setFilter] = useState('all')
  const [modal, setModal] = useState(null) // null | 'upload' | 'youtube' | 'webpage' | 'text' | 'clock' | 'priceboard' | 'iptv'
  const [form, setForm] = useState({})
  const [loading, setLoading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [uploadFit, setUploadFit] = useState('cover')
  const fileInputRef = useRef()
  const priceRowsDefault = [{ name: '', price: '' }]

  async function load() {
    try { setItems(await api.getContent()) } catch (e) { console.error(e) }
  }

  useEffect(() => { load() }, [])

  const filtered = filter === 'all' ? items : items.filter(i => i.type === filter)

  async function handleFileUpload(files, objectFit = 'cover') {
    if (!files || files.length === 0) return
    for (const file of files) {
      setUploadProgress({ name: file.name, pct: 0 })
      const fd = new FormData()
      fd.append('file', file)
      fd.append('name', file.name.replace(/\.[^.]+$/, ''))
      fd.append('object_fit', objectFit)
      // Manual XHR for progress
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.onprogress = e => setUploadProgress({ name: file.name, pct: Math.round(e.loaded / e.total * 100) })
        xhr.onload = () => resolve()
        xhr.onerror = () => reject(new Error('Falha no upload'))
        xhr.open('POST', '/api/content/upload')
        const token = localStorage.getItem('auth_token')
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
        xhr.send(fd)
      }).catch(e => alert(e.message))
    }
    setUploadProgress(null)
    load()
  }

  async function handleToggleFit(item) {
    const next = (item.object_fit || 'cover') === 'cover' ? 'contain' : 'cover'
    await api.updateContent(item.id, { name: item.name, url: item.url, content: item.content, object_fit: next })
    load()
  }

  async function handleExternal() {
    setLoading(true)
    try {
      const { type } = modal
      let payload = { name: form.name, type }
      if (type === 'youtube') {
        const vid = extractYoutubeId(form.url)
        if (!vid) throw new Error('URL do YouTube inválida')
        payload.url = `https://www.youtube.com/embed/${vid}?autoplay=1&mute=1&loop=1&controls=0&playlist=${vid}`
        payload.name = form.name || 'YouTube: ' + vid
      } else if (type === 'webpage') {
        payload.url = form.url
      } else if (type === 'text') {
        payload.content = { text: form.text, fontSize: form.fontSize || 48, color: form.color || '#ffffff', bgColor: form.bgColor || '#000000', align: form.align || 'center' }
      } else if (type === 'clock') {
        payload.content = { format: form.format || '24h', showDate: form.showDate !== false, timezone: form.timezone || 'America/Sao_Paulo', color: form.color || '#ffffff', bgColor: form.bgColor || '#000000' }
      } else if (type === 'priceboard') {
        payload.content = { title: form.title, currency: form.currency || 'R$', items: form.priceItems || priceRowsDefault, bgColor: form.bgColor || '#000000', accentColor: form.accentColor || '#dc2626' }
      }
      await api.addExternal(payload)
      load(); setModal(null); setForm({})
    } catch (e) { alert('Erro: ' + e.message) }
    finally { setLoading(false) }
  }

  async function handleDelete(item) {
    if (!confirm(`Deletar "${item.name}"?`)) return
    await api.deleteContent(item.id); load()
  }

  function extractYoutubeId(url) {
    const m = url?.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/)
    return m ? m[1] : null
  }

  function getThumbUrl(item) {
    if (item.type === 'image' && item.filename) return `/uploads/${item.filename}`
    if (item.type === 'youtube' && item.url) {
      const m = item.url.match(/embed\/([A-Za-z0-9_-]{11})/)
      return m ? `https://img.youtube.com/vi/${m[1]}/mqdefault.jpg` : null
    }
    return null
  }

  const filterTypes = ['all', 'image', 'video', 'youtube', 'webpage', 'text', 'clock', 'priceboard', 'iptvchannel']

  const [showSizeGuide, setShowSizeGuide] = useState(false)
  const [iptvChannels, setIptvChannels]   = useState([])  // parsed from M3U
  const [iptvLoading, setIptvLoading]     = useState(false)
  const [iptvSelected, setIptvSelected]   = useState(new Set())
  const [iptvTab, setIptvTab]             = useState('file') // 'file' | 'url' | 'text' | 'direct'
  const iptvFileRef = useRef()
  const [iptvInput, setIptvInput]         = useState('')
  const [iptvFilter, setIptvFilter]       = useState('')

  function parseM3UText(text) {
    const lines = text.replace(/\r\n/g, '\n').split('\n')
    const channels = []
    let meta = null
    for (const raw of lines) {
      const line = raw.trim()
      if (line.startsWith('#EXTINF:')) {
        const name  = line.match(/,(.+)$/)
        const logo  = line.match(/tvg-logo="([^"]*)"/)
        const group = line.match(/group-title="([^"]*)"/)
        const id    = line.match(/tvg-id="([^"]*)"/)
        meta = {
          name:  name?.[1]?.trim()  || 'Canal',
          logo:  logo?.[1]  || null,
          group: group?.[1] || null,
          id:    id?.[1]    || null,
        }
      } else if (line && !line.startsWith('#') && meta) {
        channels.push({ ...meta, url: line })
        meta = null
      }
    }
    return channels
  }

  async function handleIptvParse() {
    setIptvLoading(true)
    setIptvChannels([])
    setIptvSelected(new Set())
    try {
      if (iptvTab === 'url') {
        // Server fetches URL (bypasses CORS)
        const res = await fetch(`/api/iptv/parse?url=${encodeURIComponent(iptvInput)}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setIptvChannels(data.channels)
      } else {
        // Parse locally — avoids body size limits for large lists
        const channels = parseM3UText(iptvInput)
        if (channels.length === 0) throw new Error('Nenhum canal encontrado. Verifique o formato M3U.')
        setIptvChannels(channels)
      }
    } catch (e) { alert('Erro: ' + e.message) }
    finally { setIptvLoading(false) }
  }

  function handleIptvFile(file) {
    if (!file) return
    setIptvLoading(true)
    setIptvChannels([])
    setIptvSelected(new Set())
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const channels = parseM3UText(e.target.result)
        if (channels.length === 0) throw new Error('Nenhum canal encontrado no arquivo.')
        setIptvChannels(channels)
      } catch (err) { alert('Erro: ' + err.message) }
      finally { setIptvLoading(false) }
    }
    reader.onerror = () => { alert('Erro ao ler o arquivo.'); setIptvLoading(false) }
    reader.readAsText(file, 'utf-8')
  }

  async function handleIptvAddDirect() {
    if (!form.name || !form.url) return alert('Nome e URL são obrigatórios')
    const isHls = form.url.includes('.m3u8') || form.url.includes('m3u8')
    await api.addExternal({
      name: form.name, type: 'iptvchannel', url: form.url,
      content: { isHls, showLabel: form.showLabel !== false },
    })
    load(); setModal(null); setForm({})
  }

  async function handleIptvAddSelected() {
    const toAdd = iptvChannels.filter(c => iptvSelected.has(c.url))
    for (const ch of toAdd) {
      // .ts = Xtream Codes direct stream (will be converted to .m3u8 on TV)
      const isHls = ch.url.includes('.m3u8') || ch.url.includes('m3u8') || ch.url.match(/\/\d+\.ts/)
      await api.addExternal({
        name: ch.name, type: 'iptvchannel', url: ch.url,
        content: { isHls, logo: ch.logo, group: ch.group, showLabel: true },
      })
    }
    load(); setModal(null)
    setIptvChannels([]); setIptvSelected(new Set()); setIptvInput('')
  }

  function toggleIptvSelect(url) {
    setIptvSelected(prev => {
      const next = new Set(prev)
      next.has(url) ? next.delete(url) : next.add(url)
      return next
    })
  }

  function toggleIptvSelectAll(filtered) {
    const allSelected = filtered.every(c => iptvSelected.has(c.url))
    setIptvSelected(prev => {
      const next = new Set(prev)
      if (allSelected) filtered.forEach(c => next.delete(c.url))
      else filtered.forEach(c => next.add(c.url))
      return next
    })
  }

  const sizeGuide = [
    { layout: 'Tela Cheia',           zona: 'Principal',         res: '1920 × 1080',  ratio: '16:9',   tip: 'Padrão Full HD' },
    { layout: 'Dividida 50/50',       zona: 'Esquerda / Direita', res: '960 × 1080',  ratio: '8:9',    tip: 'Metade da tela, formato quase quadrado' },
    { layout: 'Dividida 70/30',       zona: 'Principal (70%)',   res: '1344 × 1080',  ratio: '5:4',    tip: '' },
    { layout: 'Dividida 70/30',       zona: 'Lateral (30%)',     res: '576 × 1080',   ratio: '8:15',   tip: 'Formato retrato/stories' },
    { layout: 'Cima / Baixo',         zona: 'Superior / Inferior', res: '1920 × 540', ratio: '32:9',   tip: 'Faixa horizontal larga' },
    { layout: 'Grade 2×2',            zona: 'Cada célula',       res: '960 × 540',    ratio: '16:9',   tip: 'Mini Full HD' },
    { layout: 'Principal + Banner',   zona: 'Principal',         res: '1920 × 864',   ratio: '20:9',   tip: '' },
    { layout: 'Principal + Banner',   zona: 'Banner inferior',   res: '1920 × 216',   ratio: '~9:1',   tip: 'Faixa fina de rodapé' },
  ]

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Biblioteca de Mídia</h1>
          <p className="page-subtitle">Gerencie imagens, vídeos e conteúdos</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => setShowSizeGuide(s => !s)}>📐 Tamanhos</button>
          <button className="btn btn-secondary" onClick={() => fileInputRef.current.click()}>⬆ Upload</button>
          <div style={{ position: 'relative' }}>
            <select className="btn btn-primary" style={{ appearance: 'none', paddingRight: 28 }} onChange={e => { if (e.target.value) { setModal({ type: e.target.value }); setForm({}); e.target.value = '' } }}>
              <option value="">+ Adicionar conteúdo</option>
              <option value="youtube">▶️ YouTube</option>
              <option value="webpage">🌐 Página Web</option>
              <option value="text">📝 Texto</option>
              <option value="clock">🕐 Relógio</option>
              <option value="priceboard">💰 Tabela de Preços</option>
              <option value="iptv">📡 IPTV / Stream</option>
            </select>
          </div>
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple style={{ display: 'none' }} onChange={e => handleFileUpload(e.target.files, uploadFit)} />

      {/* Size guide panel */}
      {showSizeGuide && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-body">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>📐 Guia de Tamanhos — TV 1920×1080 (Full HD)</div>
                <div className="text-sm text-muted" style={{ marginTop: 2 }}>
                  Use <strong>Preencher</strong> para fotos/vídeos e <strong>Caber</strong> para logos e conteúdo com texto nas bordas.
                </div>
              </div>
              <button className="btn-icon" onClick={() => setShowSizeGuide(false)}>✕</button>
            </div>
            <table className="table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>Layout</th>
                  <th>Zona</th>
                  <th>Resolução ideal</th>
                  <th>Proporção</th>
                  <th>Observação</th>
                </tr>
              </thead>
              <tbody>
                {sizeGuide.map((row, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 500 }}>{row.layout}</td>
                    <td className="text-muted">{row.zona}</td>
                    <td>
                      <span style={{
                        fontFamily: 'monospace', fontWeight: 700, fontSize: 13,
                        background: 'var(--bg)', padding: '2px 8px', borderRadius: 4,
                        border: '1px solid var(--border)',
                      }}>{row.res}</span>
                    </td>
                    <td><span className="badge badge-blue">{row.ratio}</span></td>
                    <td className="text-sm text-muted">{row.tip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}>
              <strong>Dica:</strong> imagens no formato retrato (estilo stories/celular, 9:16) ficam melhor no modo <strong>Caber</strong> na zona lateral 30%, ou <strong>Preencher</strong> se não se importar com leve corte lateral.
            </div>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {filterTypes.map(t => (
          <button key={t} className={`btn btn-sm ${filter === t ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter(t)}>
            {t === 'all' ? 'Todos' : TYPE_ICONS[t] + ' ' + TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Drop zone */}
      <div style={{ marginBottom: 20 }}>
        <div
          className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFileUpload(e.dataTransfer.files, uploadFit) }}
          onClick={() => fileInputRef.current.click()}
        >
          {uploadProgress
            ? <><div style={{ fontWeight: 600 }}>{uploadProgress.name}</div><div style={{ marginTop: 8, background: '#e2e8f0', borderRadius: 4, height: 6 }}><div style={{ width: uploadProgress.pct + '%', background: 'var(--accent)', height: '100%', borderRadius: 4, transition: 'width .2s' }} /></div></>
            : <><div style={{ fontSize: 32, marginBottom: 8 }}>📁</div><div>Arraste arquivos aqui ou clique para fazer upload</div><div className="text-sm text-muted" style={{ marginTop: 4 }}>Imagens (JPG, PNG, GIF, WebP) e Vídeos (MP4, WebM)</div></>
          }
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
          <span className="text-sm text-muted">Ajuste para novos uploads:</span>
          <div style={{ display: 'flex', gap: 0, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
            {[['cover', 'Preencher', 'Recorta para preencher a zona — ideal para fotos e vídeos'], ['contain', 'Caber', 'Exibe o conteúdo completo sem corte — ideal para logos e infográficos']].map(([val, label, tip]) => (
              <button
                key={val}
                title={tip}
                onClick={() => setUploadFit(val)}
                style={{
                  padding: '4px 14px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                  background: uploadFit === val ? 'var(--accent)' : 'var(--bg-card)',
                  color: uploadFit === val ? '#fff' : 'var(--text-muted)',
                }}
              >{label}</button>
            ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state"><div className="empty-state-icon">🖼️</div><p className="empty-state-text">Nenhum item encontrado.</p></div>
      ) : (
        <div className="media-grid">
          {filtered.map(item => {
            const thumb = getThumbUrl(item)
            return (
              <div key={item.id} className="media-card">
                {thumb
                  ? <img src={thumb} alt={item.name} className="media-thumb" />
                  : <div className="media-thumb-placeholder">{TYPE_ICONS[item.type] || '📄'}</div>
                }
                <div className="media-info">
                  <div className="media-name" title={item.name}>{item.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                    <span className="media-type">{TYPE_LABELS[item.type] || item.type}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {(item.type === 'image' || item.type === 'video') && (
                        <button
                          title={(item.object_fit || 'cover') === 'cover' ? 'Preencher (clique para Caber)' : 'Caber (clique para Preencher)'}
                          onClick={() => handleToggleFit(item)}
                          style={{
                            fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, border: 'none',
                            cursor: 'pointer', lineHeight: 1.4,
                            background: (item.object_fit || 'cover') === 'cover' ? '#dbeafe' : '#f0fdf4',
                            color: (item.object_fit || 'cover') === 'cover' ? '#1d4ed8' : '#15803d',
                          }}
                        >
                          {(item.object_fit || 'cover') === 'cover' ? 'Preencher' : 'Caber'}
                        </button>
                      )}
                      <button className="btn-icon" style={{ fontSize: 12 }} onClick={() => handleDelete(item)}>🗑</button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* IPTV modal */}
      {modal?.type === 'iptv' && (() => {
        const groups = [...new Set(iptvChannels.map(c => c.group || 'Sem grupo'))]
        const filtered = iptvChannels.filter(c =>
          !iptvFilter || c.name.toLowerCase().includes(iptvFilter.toLowerCase()) ||
          (c.group || '').toLowerCase().includes(iptvFilter.toLowerCase())
        )
        return (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
            <div className="modal" style={{ maxWidth: 680, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
              <div className="modal-header">
                <span className="modal-title">📡 IPTV / Stream ao Vivo</span>
                <button className="btn-icon" onClick={() => setModal(null)}>✕</button>
              </div>
              <div className="modal-body" style={{ flex: 1, overflow: 'auto' }}>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                  {[['file', '📂 Arquivo .m3u'], ['url', '🔗 URL M3U'], ['text', '📋 Colar M3U'], ['direct', '📡 Stream direto']].map(([val, label]) => (
                    <button key={val} onClick={() => { setIptvTab(val); setIptvChannels([]); setIptvInput(''); setIptvSelected(new Set()) }}
                      style={{ flex: 1, padding: '8px 4px', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
                        background: iptvTab === val ? 'var(--accent)' : 'var(--bg-card)',
                        color: iptvTab === val ? '#fff' : 'var(--text-muted)' }}>
                      {label}
                    </button>
                  ))}
                </div>

                <input ref={iptvFileRef} type="file" accept=".m3u,.m3u8,.txt" style={{ display: 'none' }}
                  onChange={e => handleIptvFile(e.target.files[0])} />

                {/* File upload tab */}
                {iptvTab === 'file' && iptvChannels.length === 0 && (
                  <div
                    style={{
                      border: '2px dashed var(--border)', borderRadius: 10, padding: '32px 20px',
                      textAlign: 'center', cursor: 'pointer', background: 'var(--bg)',
                    }}
                    onClick={() => iptvFileRef.current.click()}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); handleIptvFile(e.dataTransfer.files[0]) }}
                  >
                    {iptvLoading ? (
                      <div style={{ color: 'var(--text-muted)' }}>Carregando canais…</div>
                    ) : (
                      <>
                        <div style={{ fontSize: 36, marginBottom: 8 }}>📂</div>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>Clique ou arraste o arquivo .m3u aqui</div>
                        <div className="text-sm text-muted">Suporta arquivos .m3u e .m3u8 de qualquer tamanho</div>
                      </>
                    )}
                  </div>
                )}

                {/* URL or paste tab */}
                {(iptvTab === 'url' || iptvTab === 'text') && iptvChannels.length === 0 && (
                  <>
                    <div className="form-group">
                      <label className="form-label">{iptvTab === 'url' ? 'URL da lista M3U' : 'Conteúdo M3U'}</label>
                      {iptvTab === 'url'
                        ? <input className="form-control" placeholder="http://seu-servidor/lista.m3u" value={iptvInput} onChange={e => setIptvInput(e.target.value)} />
                        : <textarea className="form-control" rows={6} placeholder="#EXTM3U&#10;#EXTINF:-1,Canal 1&#10;http://stream.url/canal1.m3u8" value={iptvInput} onChange={e => setIptvInput(e.target.value)} />
                      }
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={handleIptvParse} disabled={iptvLoading || !iptvInput.trim()}>
                      {iptvLoading ? 'Carregando…' : '🔍 Carregar canais'}
                    </button>

                  </>
                )}

                {/* Channel list — shown after parse from any tab */}
                {iptvChannels.length > 0 && iptvTab !== 'direct' && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        {iptvChannels.length} canais encontrados
                        {iptvSelected.size > 0 && <span style={{ color: 'var(--accent)', marginLeft: 8 }}>· {iptvSelected.size} selecionado(s)</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => toggleIptvSelectAll(filtered)}>
                          {filtered.every(c => iptvSelected.has(c.url)) ? 'Desmarcar todos' : 'Marcar todos'}
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => { setIptvChannels([]); setIptvSelected(new Set()) }}>
                          ✕ Limpar
                        </button>
                      </div>
                    </div>
                    <input className="form-control" placeholder="Filtrar por nome ou grupo…" value={iptvFilter}
                      onChange={e => setIptvFilter(e.target.value)} style={{ marginBottom: 10 }} />
                    <div style={{ maxHeight: 340, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                      {filtered.map((ch, i) => (
                        <label key={i} style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer',
                          borderBottom: '1px solid var(--border)', background: iptvSelected.has(ch.url) ? 'rgba(45,110,245,.07)' : undefined,
                        }}>
                          <input type="checkbox" checked={iptvSelected.has(ch.url)} onChange={() => toggleIptvSelect(ch.url)} />
                          {ch.logo && <img src={ch.logo} style={{ width: 32, height: 20, objectFit: 'contain', background: '#111', borderRadius: 3 }} onError={e => e.target.style.display='none'} />}
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{ch.name}</div>
                            {ch.group && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ch.group}</div>}
                          </div>
                        </label>
                      ))}
                      {filtered.length === 0 && <div className="text-muted text-sm" style={{ padding: 12 }}>Nenhum canal encontrado.</div>}
                    </div>
                  </div>
                )}

                {/* Direct stream tab */}
                {iptvTab === 'direct' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Nome do canal *</label>
                      <input className="form-control" placeholder="Ex: CNN Brasil" value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">URL do stream *</label>
                      <input className="form-control" placeholder="http://stream.url/canal.m3u8" value={form.url || ''} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} />
                      <small className="text-muted">Suporta HLS (.m3u8), HTTP video streams. RTSP requer proxy.</small>
                    </div>
                    <div className="form-group">
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                        <input type="checkbox" checked={form.showLabel !== false} onChange={e => setForm(f => ({ ...f, showLabel: e.target.checked }))} />
                        <span className="form-label" style={{ margin: 0 }}>Mostrar nome do canal na TV</span>
                      </label>
                    </div>
                  </>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
                {iptvTab === 'direct'
                  ? <button className="btn btn-primary" onClick={handleIptvAddDirect}>Adicionar canal</button>
                  : <button className="btn btn-primary" onClick={handleIptvAddSelected} disabled={iptvSelected.size === 0}>
                      Adicionar {iptvSelected.size > 0 ? `${iptvSelected.size} canal(is)` : 'selecionados'}
                    </button>
                }
              </div>
            </div>
          </div>
        )
      })()}

      {/* External content modal */}
      {modal && modal.type !== 'iptv' && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">{TYPE_ICONS[modal.type]} Adicionar {TYPE_LABELS[modal.type]}</span>
              <button className="btn-icon" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Nome *</label>
                <input className="form-control" value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome para identificar no sistema" />
              </div>

              {modal.type === 'youtube' && (
                <div className="form-group">
                  <label className="form-label">URL do YouTube *</label>
                  <input className="form-control" value={form.url || ''} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://www.youtube.com/watch?v=..." />
                </div>
              )}

              {modal.type === 'webpage' && (
                <div className="form-group">
                  <label className="form-label">URL da Página *</label>
                  <input className="form-control" value={form.url || ''} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://..." />
                </div>
              )}

              {modal.type === 'text' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Texto *</label>
                    <textarea className="form-control" rows={3} value={form.text || ''} onChange={e => setForm(f => ({ ...f, text: e.target.value }))} placeholder="Digite o texto a ser exibido..." />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Tamanho da fonte (px)</label>
                      <input className="form-control" type="number" value={form.fontSize || 48} onChange={e => setForm(f => ({ ...f, fontSize: +e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Alinhamento</label>
                      <select className="form-control" value={form.align || 'center'} onChange={e => setForm(f => ({ ...f, align: e.target.value }))}>
                        <option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Cor do texto</label>
                      <input className="form-control" type="color" value={form.color || '#ffffff'} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Cor de fundo</label>
                      <input className="form-control" type="color" value={form.bgColor || '#000000'} onChange={e => setForm(f => ({ ...f, bgColor: e.target.value }))} />
                    </div>
                  </div>
                </>
              )}

              {modal.type === 'clock' && (
                <>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Formato</label>
                      <select className="form-control" value={form.format || '24h'} onChange={e => setForm(f => ({ ...f, format: e.target.value }))}>
                        <option value="24h">24 horas</option><option value="12h">12 horas (AM/PM)</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Mostrar data</label>
                      <select className="form-control" value={form.showDate !== false ? 'yes' : 'no'} onChange={e => setForm(f => ({ ...f, showDate: e.target.value === 'yes' }))}>
                        <option value="yes">Sim</option><option value="no">Não</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Cor do texto</label>
                      <input className="form-control" type="color" value={form.color || '#ffffff'} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Cor de fundo</label>
                      <input className="form-control" type="color" value={form.bgColor || '#000000'} onChange={e => setForm(f => ({ ...f, bgColor: e.target.value }))} />
                    </div>
                  </div>
                </>
              )}

              {modal.type === 'priceboard' && (
                <>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Título da tabela</label>
                      <input className="form-control" value={form.title || ''} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex: Cardápio" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Moeda</label>
                      <input className="form-control" value={form.currency || 'R$'} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} style={{ width: 80 }} />
                    </div>
                  </div>
                  <label className="form-label">Itens</label>
                  {(form.priceItems || priceRowsDefault).map((row, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                      <input className="form-control" placeholder="Nome do item" value={row.name} onChange={e => {
                        const rows = [...(form.priceItems || priceRowsDefault)]; rows[i] = { ...rows[i], name: e.target.value }
                        setForm(f => ({ ...f, priceItems: rows }))
                      }} />
                      <input className="form-control" placeholder="Preço" value={row.price} style={{ width: 100 }} onChange={e => {
                        const rows = [...(form.priceItems || priceRowsDefault)]; rows[i] = { ...rows[i], price: e.target.value }
                        setForm(f => ({ ...f, priceItems: rows }))
                      }} />
                      <button className="btn btn-secondary btn-sm" onClick={() => setForm(f => ({ ...f, priceItems: (f.priceItems || priceRowsDefault).filter((_, j) => j !== i) }))}>✕</button>
                    </div>
                  ))}
                  <button className="btn btn-secondary btn-sm" onClick={() => setForm(f => ({ ...f, priceItems: [...(f.priceItems || priceRowsDefault), { name: '', price: '' }] }))}>+ Item</button>
                  <div className="form-row" style={{ marginTop: 12 }}>
                    <div className="form-group">
                      <label className="form-label">Cor de fundo</label>
                      <input className="form-control" type="color" value={form.bgColor || '#000000'} onChange={e => setForm(f => ({ ...f, bgColor: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Cor de destaque</label>
                      <input className="form-control" type="color" value={form.accentColor || '#dc2626'} onChange={e => setForm(f => ({ ...f, accentColor: e.target.value }))} />
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleExternal} disabled={loading}>
                {loading ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
