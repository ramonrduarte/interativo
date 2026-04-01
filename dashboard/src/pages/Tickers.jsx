import React, { useEffect, useState } from 'react'
import { api } from '../api.js'

const EMPTY_MSG = { text: '' }
const EMPTY = { name: '', messages: [{ ...EMPTY_MSG }], speed: 60, font_size: 32, color: '#ffffff', bg_color: '#dc2626' }

function TickerBar({ messages, speed, fontSize, color, bgColor }) {
  const fullText = messages?.map(m => m.text).filter(Boolean).join('   •   ') || ''
  if (!fullText) return null
  const dur = Math.max(3, Math.round(fullText.length * 0.18 / (speed / 60 || 1))) + 's'
  return (
    <div style={{ background: bgColor || '#dc2626', height: 44, overflow: 'hidden', borderRadius: 6, display: 'flex', alignItems: 'center' }}>
      <div style={{
        whiteSpace: 'nowrap', display: 'inline-block',
        color: color || '#fff', fontSize: Math.min(fontSize || 32, 20) + 'px',
        padding: '0 20px', animation: `ticker-scroll ${dur} linear infinite`,
      }}>
        {fullText}
      </div>
    </div>
  )
}

export default function Tickers() {
  const [tickers, setTickers] = useState([])
  const [modal, setModal]     = useState(null)
  const [form, setForm]       = useState(EMPTY)
  const [loading, setLoading] = useState(false)

  async function load() { try { setTickers(await api.getTickers()) } catch (e) { console.error(e) } }
  useEffect(() => { load() }, [])

  function openCreate() { setForm(EMPTY); setModal('create') }
  function openEdit(t) {
    setForm({
      name: t.name,
      messages: t.messages?.length ? t.messages.map(m => ({ text: m.text || m })) : [{ text: t.message || '' }],
      speed: t.speed, font_size: t.font_size, color: t.color, bg_color: t.bg_color,
    })
    setModal(t)
  }

  function setMsg(i, val) {
    setForm(f => {
      const msgs = [...f.messages]
      msgs[i] = { text: val }
      return { ...f, messages: msgs }
    })
  }
  function addMsg()    { setForm(f => ({ ...f, messages: [...f.messages, { ...EMPTY_MSG }] })) }
  function removeMsg(i){ setForm(f => ({ ...f, messages: f.messages.filter((_, j) => j !== i) })) }
  function moveMsg(i, dir) {
    setForm(f => {
      const msgs = [...f.messages]
      const swap = i + dir
      if (swap < 0 || swap >= msgs.length) return f;
      [msgs[i], msgs[swap]] = [msgs[swap], msgs[i]]
      return { ...f, messages: msgs }
    })
  }

  async function handleSave() {
    if (!form.name.trim()) return alert('Nome é obrigatório')
    const validMsgs = form.messages.filter(m => m.text.trim())
    if (validMsgs.length === 0) return alert('Adicione ao menos uma mensagem')
    setLoading(true)
    try {
      const payload = { ...form, messages: validMsgs }
      if (modal === 'create') await api.createTicker(payload)
      else await api.updateTicker(modal.id, payload)
      await load(); setModal(null)
    } catch (e) { alert(e.message) }
    finally { setLoading(false) }
  }

  async function handleDelete(t) {
    if (!confirm(`Deletar ticker "${t.name}"?`)) return
    await api.deleteTicker(t.id); load()
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Tickers</h1>
          <p className="page-subtitle">Mensagens em rolagem no rodapé da TV</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Novo Ticker</button>
      </div>

      {tickers.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-state-icon">📰</div>
          <p className="empty-state-text">Nenhum ticker criado ainda.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {tickers.map(t => {
            const msgs = t.messages?.length ? t.messages : [{ text: t.message || '' }]
            return (
              <div key={t.id} className="card card-body">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                      {t.name}
                      {msgs.length > 1 && <span className="badge badge-blue">{msgs.length} mensagens</span>}
                    </div>
                    <TickerBar messages={msgs} speed={t.speed} fontSize={t.font_size} color={t.color} bgColor={t.bg_color} />
                    <div className="text-sm text-muted" style={{ marginTop: 6 }}>
                      Velocidade: {t.speed}px/s · Fonte: {t.font_size}px
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(t)}>Editar</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(t)}>✕</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <span className="modal-title">{modal === 'create' ? 'Novo Ticker' : 'Editar Ticker'}</span>
              <button className="btn-icon" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body">

              <div className="form-group">
                <label className="form-label">Nome *</label>
                <input className="form-control" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Promoções do dia" />
              </div>

              {/* Messages list */}
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label className="form-label" style={{ margin: 0 }}>Mensagens *</label>
                  <button className="btn btn-secondary btn-sm" onClick={addMsg}>+ Mensagem</button>
                </div>
                <p className="text-sm text-muted" style={{ marginBottom: 8 }}>
                  As mensagens aparecem uma após a outra, separadas por •, em rolagem contínua.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {form.messages.map((msg, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flexShrink: 0 }}>
                        <button className="btn-icon" style={{ fontSize: 11 }} onClick={() => moveMsg(i, -1)} disabled={i === 0}>↑</button>
                        <button className="btn-icon" style={{ fontSize: 11 }} onClick={() => moveMsg(i, 1)} disabled={i === form.messages.length - 1}>↓</button>
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, flexShrink: 0 }}>#{i + 1}</span>
                      <input
                        className="form-control"
                        value={msg.text}
                        onChange={e => setMsg(i, e.target.value)}
                        placeholder="Texto que vai rolar na tela..."
                        style={{ flex: 1 }}
                      />
                      <button className="btn-icon" style={{ fontSize: 13, color: '#dc2626', flexShrink: 0 }}
                        onClick={() => removeMsg(i)} disabled={form.messages.length === 1}>🗑</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Style */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Velocidade (px/s)</label>
                  <input type="number" className="form-control" value={form.speed} min={10} max={300} onChange={e => setForm(f => ({ ...f, speed: +e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Tamanho da fonte</label>
                  <input type="number" className="form-control" value={form.font_size} min={12} max={120} onChange={e => setForm(f => ({ ...f, font_size: +e.target.value }))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Cor do texto</label>
                  <input type="color" className="form-control" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Cor de fundo</label>
                  <input type="color" className="form-control" value={form.bg_color} onChange={e => setForm(f => ({ ...f, bg_color: e.target.value }))} />
                </div>
              </div>

              {/* Preview */}
              <div>
                <label className="form-label">Preview:</label>
                <div style={{ background: form.bg_color, height: 44, overflow: 'hidden', borderRadius: 6, display: 'flex', alignItems: 'center' }}>
                  <div style={{
                    whiteSpace: 'nowrap', display: 'inline-block', padding: '0 20px',
                    color: form.color, fontSize: Math.min(form.font_size, 20) + 'px',
                    animation: `ticker-scroll ${Math.max(3, Math.round((form.messages.map(m => m.text).join('   •   ').length * 0.18) / (form.speed / 60 || 1)))}s linear infinite`,
                  }}>
                    {form.messages.map(m => m.text).filter(Boolean).join('   •   ') || 'Suas mensagens aqui...'}
                  </div>
                </div>
              </div>

            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={loading}>{loading ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
