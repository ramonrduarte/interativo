import React, { useEffect, useState } from 'react'
import { api } from '../api.js'

const TYPE_ICONS = { image: '🖼️', video: '🎬', youtube: '▶️', webpage: '🌐', text: '📝', clock: '🕐', priceboard: '💰' }

const LAYOUT_GRID = {
  fullscreen: { cols: '1fr',          rows: undefined },
  split5050:  { cols: '1fr 1fr',      rows: undefined },
  split7030:  { cols: '7fr 3fr',      rows: undefined },
  topbottom:  { cols: undefined,      rows: '1fr 1fr' },
  grid2x2:    { cols: '1fr 1fr',      rows: '1fr 1fr' },
  mainbanner: { cols: undefined,      rows: '5fr 1fr' },
}

// Mini visual preview of one slide
function SlidePreview({ slide, layouts, media }) {
  const layout = layouts.find(l => l.id == slide.layout_id)
  const template = layout?.template || 'fullscreen'
  const zones = layout?.config?.zones || [{ id: 0, label: 'Principal' }]
  const grid = LAYOUT_GRID[template] || {}
  const zoneContent = slide.zone_content || {}

  return (
    <div style={{
      width: '100%', aspectRatio: '16/9', background: '#0f1117',
      borderRadius: 4, display: 'grid', gap: 2, padding: 4,
      gridTemplateColumns: grid.cols,
      gridTemplateRows: grid.rows,
    }}>
      {zones.map((z, i) => {
        const mediaId = zoneContent[i]
        const m = mediaId ? media.find(x => x.id == mediaId) : null
        return (
          <div key={i} style={{
            background: m ? '#1a3a6e' : '#1a1d23',
            border: `1px solid ${m ? '#2d6ef5' : '#2a2d35'}`,
            borderRadius: 2, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 2, padding: 3, overflow: 'hidden',
          }}>
            <span style={{ fontSize: 9, color: '#555', fontWeight: 600, lineHeight: 1 }}>{z.label}</span>
            {m && <span style={{ fontSize: 9, color: '#6b9aff', textAlign: 'center', wordBreak: 'break-word', lineHeight: 1.2 }}>
              {TYPE_ICONS[m.type]} {m.name}
            </span>}
          </div>
        )
      })}
    </div>
  )
}

// Slide editor form inside a card
function SlideEditor({ slide, layouts, media, onSave, onClose }) {
  const [layoutId, setLayoutId] = useState(slide.layout_id ? String(slide.layout_id) : '')
  const [zoneContent, setZoneContent] = useState(slide.zone_content || {})
  const [duration, setDuration] = useState(slide.duration || 10)
  const [saving, setSaving] = useState(false)

  const selectedLayout = layouts.find(l => l.id == layoutId)
  const zones = selectedLayout?.config?.zones || []

  function handleLayoutChange(lid) {
    setLayoutId(lid)
    setZoneContent({}) // reset zones when layout changes
  }

  function setZone(zoneIdx, mediaId) {
    setZoneContent(prev => ({ ...prev, [zoneIdx]: mediaId ? Number(mediaId) : null }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      await onSave({
        layout_id: layoutId ? Number(layoutId) : null,
        zone_content: zoneContent,
        duration: Number(duration),
      })
      onClose()
    } catch (e) { alert(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'var(--bg)', borderRadius: 10, width: 580, maxHeight: '90vh',
        overflow: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,.5)',
      }}>
        <div className="modal-header">
          <span className="modal-title">Editar Slide</span>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">

          {/* Layout */}
          <div className="form-group">
            <label className="form-label">Layout</label>
            <select className="form-control" value={layoutId} onChange={e => handleLayoutChange(e.target.value)}>
              <option value="">— Selecione —</option>
              {layouts.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>

          {/* Zone pickers */}
          {zones.length > 0 && (
            <div className="form-group">
              <label className="form-label">Conteúdo por zona</label>
              <div style={{ display: 'grid', gridTemplateColumns: zones.length > 2 ? '1fr 1fr' : '1fr', gap: 10 }}>
                {zones.map((z, i) => (
                  <div key={i} style={{
                    border: '1px solid var(--border)', borderRadius: 8, padding: 12,
                    background: zoneContent[i] ? '#f0f4ff' : 'var(--bg)',
                  }}>
                    <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        background: 'var(--accent)', color: '#fff', borderRadius: '50%',
                        width: 18, height: 18, display: 'inline-flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 10, flexShrink: 0,
                      }}>{i + 1}</span>
                      {z.label}
                    </div>
                    <select
                      className="form-control"
                      value={zoneContent[i] || ''}
                      onChange={e => setZone(i, e.target.value)}
                    >
                      <option value="">— Nenhum conteúdo —</option>
                      {media.map(m => (
                        <option key={m.id} value={m.id}>{TYPE_ICONS[m.type]} {m.name}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Duration */}
          <div className="form-group">
            <label className="form-label">Duração do slide (segundos)</label>
            <input
              type="number" className="form-control" min={1} value={duration}
              onChange={e => setDuration(e.target.value)}
              style={{ maxWidth: 120 }}
            />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Playlists() {
  const [playlists, setPlaylists] = useState([])
  const [selected, setSelected]   = useState(null) // full playlist with slides
  const [media, setMedia]         = useState([])
  const [layouts, setLayouts]     = useState([])
  const [createForm, setCreateForm] = useState({ name: '', description: '' })
  const [showCreate, setShowCreate] = useState(false)
  const [editingSlide, setEditingSlide] = useState(null) // slide obj or 'new'
  const [loading, setLoading]     = useState(false)

  async function load() {
    try {
      const [p, m, l] = await Promise.all([api.getPlaylists(), api.getContent(), api.getLayouts()])
      setPlaylists(p); setMedia(m); setLayouts(l)
    } catch (e) { console.error(e) }
  }

  async function loadPlaylist(id) {
    const p = await api.getPlaylist(id)
    setSelected(p)
    return p
  }

  useEffect(() => { load() }, [])

  async function handleCreate() {
    if (!createForm.name.trim()) return alert('Nome é obrigatório')
    setLoading(true)
    try {
      await api.createPlaylist(createForm)
      await load()
      setShowCreate(false)
      setCreateForm({ name: '', description: '' })
    } catch (e) { alert(e.message) }
    finally { setLoading(false) }
  }

  async function handleDelete(p) {
    if (!confirm(`Deletar playlist "${p.name}"?`)) return
    await api.deletePlaylist(p.id)
    if (selected?.id === p.id) setSelected(null)
    load()
  }

  async function handleAddSlide(data) {
    await api.addSlide(selected.id, data)
    await loadPlaylist(selected.id)
  }

  async function handleUpdateSlide(slideId, data) {
    await api.updateSlide(selected.id, slideId, data)
    await loadPlaylist(selected.id)
  }

  async function handleDeleteSlide(slideId) {
    await api.deleteSlide(selected.id, slideId)
    await loadPlaylist(selected.id)
  }

  async function handleMoveSlide(slideId, direction) {
    const slides = selected.slides
    const idx = slides.findIndex(s => s.id === slideId)
    if (direction === 'up' && idx === 0) return
    if (direction === 'down' && idx === slides.length - 1) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    const reordered = slides.map((s, i) => {
      if (i === idx)     return { id: s.id, position: slides[swapIdx].position }
      if (i === swapIdx) return { id: s.id, position: slides[idx].position }
      return { id: s.id, position: s.position }
    })
    await api.reorderSlides(selected.id, reordered)
    await loadPlaylist(selected.id)
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Playlists</h1>
          <p className="page-subtitle">Cada playlist é uma sequência de slides — cada slide tem seu próprio layout e conteúdo</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Nova Playlist</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20 }}>

        {/* Playlist list */}
        <div>
          {playlists.length === 0 ? (
            <div className="card card-body text-muted text-sm">Nenhuma playlist ainda.</div>
          ) : playlists.map(p => (
            <div
              key={p.id}
              className="card"
              style={{ marginBottom: 8, cursor: 'pointer', border: selected?.id === p.id ? '2px solid var(--accent)' : undefined }}
              onClick={() => loadPlaylist(p.id)}
            >
              <div className="card-body" style={{ padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    {p.description && <div className="text-sm text-muted">{p.description}</div>}
                  </div>
                  <button className="btn-icon" style={{ fontSize: 12 }} onClick={e => { e.stopPropagation(); handleDelete(p) }}>🗑</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Slide editor */}
        <div>
          {!selected ? (
            <div className="empty-state card">
              <div className="empty-state-icon">🎞️</div>
              <p className="empty-state-text">Selecione uma playlist para editar os slides</p>
            </div>
          ) : (
            <div className="card">
              <div className="card-body">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <div>
                    <h3 style={{ fontWeight: 700 }}>{selected.name}</h3>
                    {selected.description && <p className="text-muted text-sm">{selected.description}</p>}
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={() => setEditingSlide('new')}>+ Novo Slide</button>
                </div>

                {(!selected.slides || selected.slides.length === 0) && (
                  <div className="empty-state" style={{ padding: '30px 0' }}>
                    <div className="empty-state-icon">📭</div>
                    <p className="empty-state-text">Nenhum slide ainda. Adicione o primeiro slide.</p>
                  </div>
                )}

                {selected.slides?.map((slide, idx) => {
                  const layout = layouts.find(l => l.id == slide.layout_id)
                  return (
                    <div key={slide.id} style={{
                      display: 'grid', gridTemplateColumns: '32px 180px 1fr auto',
                      gap: 12, alignItems: 'center', padding: '10px 0',
                      borderBottom: '1px solid var(--border)',
                    }}>
                      {/* Number */}
                      <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, fontWeight: 600 }}>
                        {idx + 1}
                      </div>

                      {/* Mini preview */}
                      <div style={{ cursor: 'pointer' }} onClick={() => setEditingSlide(slide)}>
                        <SlidePreview slide={slide} layouts={layouts} media={media} />
                      </div>

                      {/* Info */}
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{layout?.name || 'Layout não definido'}</div>
                        <div className="text-sm text-muted" style={{ marginTop: 2 }}>
                          {slide.duration}s
                          {' · '}
                          {Object.keys(slide.zone_content || {}).filter(k => slide.zone_content[k]).length} zona(s) com conteúdo
                        </div>
                        {Object.entries(slide.zone_content_detail || {}).map(([zi, z]) => (
                          <div key={zi} className="text-sm" style={{ color: 'var(--accent)', marginTop: 2 }}>
                            Zona {Number(zi) + 1}: {TYPE_ICONS[z.type]} {z.name}
                          </div>
                        ))}
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn-icon" onClick={() => handleMoveSlide(slide.id, 'up')} title="Subir">↑</button>
                        <button className="btn-icon" onClick={() => handleMoveSlide(slide.id, 'down')} title="Descer">↓</button>
                        <button className="btn-icon" onClick={() => setEditingSlide(slide)} title="Editar">✏️</button>
                        <button className="btn-icon" onClick={() => handleDeleteSlide(slide.id)} title="Remover">🗑</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create playlist modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowCreate(false)}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">Nova Playlist</span>
              <button className="btn-icon" onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Nome *</label>
                <input className="form-control" value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Promoções da semana" />
              </div>
              <div className="form-group">
                <label className="form-label">Descrição</label>
                <input className="form-control" value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))} placeholder="Opcional" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={loading}>Criar</button>
            </div>
          </div>
        </div>
      )}

      {/* Slide editor modal */}
      {editingSlide && selected && (
        <SlideEditor
          slide={editingSlide === 'new' ? { layout_id: null, zone_content: {}, duration: 10 } : editingSlide}
          layouts={layouts}
          media={media}
          onSave={editingSlide === 'new'
            ? data => handleAddSlide(data)
            : data => handleUpdateSlide(editingSlide.id, data)
          }
          onClose={() => setEditingSlide(null)}
        />
      )}
    </div>
  )
}
