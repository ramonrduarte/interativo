import React, { useEffect, useState, useRef } from 'react'
import { api } from '../api.js'

const EMPTY_FORM = { name: '', playlist_id: '', ticker_id: '', orientation: 'landscape' }

// ── Pairing Modal ──────────────────────────────────────────────────────────
function PairModal({ screens, onClose }) {
  const [code, setCode]         = useState('')
  const [screenId, setScreenId] = useState('')
  const [waiting, setWaiting]   = useState([])
  const [status, setStatus]     = useState(null) // null | 'ok' | 'error'
  const [msg, setMsg]           = useState('')
  const pollRef = useRef(null)

  // Poll for TVs in pairing mode
  useEffect(() => {
    async function poll() {
      try { setWaiting(await api.getPairingWaiting()) } catch {}
    }
    poll()
    pollRef.current = setInterval(poll, 3000)
    return () => clearInterval(pollRef.current)
  }, [])

  async function handlePair() {
    if (!code.trim()) return setMsg('Digite o código exibido na TV')
    if (!screenId)    return setMsg('Selecione qual tela vincular')
    try {
      const res = await api.pairTv(code.trim().toUpperCase(), screenId)
      setStatus('ok')
      setMsg(`Pareado com sucesso! "${res.screen_name}" está conectada.`)
    } catch (e) {
      setStatus('error')
      setMsg(e.message)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <span className="modal-title">Parear TV</span>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p className="text-sm text-muted" style={{ marginBottom: 16 }}>
            Abra <strong>http://[IP-DO-SERVIDOR]:5174</strong> na TV. Ela exibirá um código de 6 caracteres.
          </p>

          {waiting.length > 0 && (
            <div style={{ marginBottom: 16, padding: '10px 12px', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#15803d', marginBottom: 6 }}>
                TVs aguardando pareamento:
              </div>
              {waiting.map(w => (
                <button key={w.code} className="btn btn-secondary btn-sm" style={{ marginRight: 6 }}
                  onClick={() => setCode(w.code)}>
                  {w.code}
                </button>
              ))}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Código exibido na TV *</label>
            <input
              className="form-control"
              placeholder="Ex: A3F7K2"
              value={code}
              maxLength={6}
              onChange={e => { setCode(e.target.value.toUpperCase()); setStatus(null); setMsg('') }}
              style={{ fontFamily: 'monospace', fontSize: 22, letterSpacing: 6, textTransform: 'uppercase', textAlign: 'center' }}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Vincular à tela *</label>
            <select className="form-control" value={screenId}
              onChange={e => { setScreenId(e.target.value); setStatus(null); setMsg('') }}>
              <option value="">— Selecione a tela —</option>
              {screens.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          {msg && (
            <div style={{
              padding: '10px 12px', borderRadius: 8, fontSize: 13,
              background: status === 'ok' ? '#f0fdf4' : '#fef2f2',
              color: status === 'ok' ? '#15803d' : '#dc2626',
              border: `1px solid ${status === 'ok' ? '#bbf7d0' : '#fecaca'}`,
            }}>
              {msg}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            {status === 'ok' ? 'Fechar' : 'Cancelar'}
          </button>
          {status !== 'ok' && (
            <button className="btn btn-primary" onClick={handlePair}>Parear</button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Screens() {
  const [screens, setScreens]     = useState([])
  const [playlists, setPlaylists] = useState([])
  const [tickers, setTickers]     = useState([])
  const [modal, setModal]         = useState(null) // null | 'create' | screenObj
  const [showPair, setShowPair]   = useState(false)
  const [form, setForm]           = useState(EMPTY_FORM)
  const [loading, setLoading]     = useState(false)

  async function load() {
    try {
      const [s, p, t] = await Promise.all([api.getScreens(), api.getPlaylists(), api.getTickers()])
      setScreens(s); setPlaylists(p); setTickers(t)
    } catch (e) { console.error('Erro ao carregar:', e) }
  }

  useEffect(() => { load() }, [])

  function openCreate() { setForm(EMPTY_FORM); setModal('create') }

  function openEdit(s) {
    setForm({ name: s.name, playlist_id: s.playlist_id || '', ticker_id: s.ticker_id || '', orientation: s.orientation || 'landscape' })
    setModal(s)
  }

  function closeModal() { setModal(null) }

  async function handleSave() {
    if (!form.name.trim()) return alert('Nome é obrigatório')
    setLoading(true)
    try {
      const payload = {
        name: form.name,
        playlist_id: form.playlist_id || null,
        ticker_id: form.ticker_id || null,
        orientation: form.orientation || 'landscape',
      }
      if (modal === 'create') await api.createScreen(payload)
      else await api.updateScreen(modal.id, payload)
      await load()
      closeModal()
    } catch (e) { alert('Erro: ' + e.message) }
    finally { setLoading(false) }
  }

  async function handleDelete(s) {
    if (!confirm(`Deletar a tela "${s.name}"?`)) return
    await api.deleteScreen(s.id)
    load()
  }

  function getTvUrl(token) {
    return `${window.location.protocol}//${window.location.hostname}:5174?token=${token}`
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Telas</h1>
          <p className="page-subtitle">Configure suas TVs corporativas</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => setShowPair(true)}>📡 Parear TV</button>
          <button className="btn btn-primary" onClick={openCreate}>+ Nova Tela</button>
        </div>
      </div>

      {screens.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📺</div>
          <p className="empty-state-text">Nenhuma tela cadastrada ainda.</p>
        </div>
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Orientação</th>
                <th>Playlist</th>
                <th>Slides</th>
                <th>Ticker</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {screens.map(s => (
                <tr key={s.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{s.name}</div>
                    <div className="text-sm text-muted" style={{ fontFamily: 'monospace' }}>{s.token?.slice(0, 8)}…</div>
                  </td>
                  <td>
                    <span title={s.orientation === 'portrait' ? 'Vertical' : 'Horizontal'}>
                      {s.orientation === 'portrait' ? '📱 Vertical' : '🖥️ Horizontal'}
                    </span>
                  </td>
                  <td><span className="badge badge-blue">{s.playlist_name || '—'}</span></td>
                  <td>
                    {s.slide_count > 0
                      ? <span className="badge badge-success">{s.slide_count} slide{s.slide_count > 1 ? 's' : ''}</span>
                      : <span className="text-muted">—</span>}
                  </td>
                  <td>{s.ticker_name || <span className="text-muted">—</span>}</td>
                  <td>
                    <span className={`badge ${s.online ? 'badge-success' : 'badge-gray'}`}>
                      {s.online ? 'Online' : 'Offline'}
                    </span>
                  </td>
                  <td>
                    <div className="table-actions">
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(s)}>Editar</button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => navigator.clipboard.writeText(getTvUrl(s.token)).then(() => alert('URL copiada!'))}
                      >URL TV</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(s)}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <span className="modal-title">{modal === 'create' ? 'Nova Tela' : `Editar: ${modal.name}`}</span>
              <button className="btn-icon" onClick={closeModal}>✕</button>
            </div>
            <div className="modal-body">

              <div className="form-group">
                <label className="form-label">Nome da Tela *</label>
                <input
                  className="form-control"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ex: TV Recepção"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Orientação da TV</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  {[
                    { value: 'landscape', label: 'Horizontal', icon: '🖥️', desc: 'TV deitada (padrão)' },
                    { value: 'portrait',  label: 'Vertical',   icon: '📱', desc: 'TV em pé / girada' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, orientation: opt.value }))}
                      style={{
                        flex: 1, padding: '12px 8px', borderRadius: 8, cursor: 'pointer', border: '2px solid',
                        borderColor: form.orientation === opt.value ? 'var(--accent)' : 'var(--border)',
                        background: form.orientation === opt.value ? 'rgba(45,110,245,.08)' : 'var(--bg)',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      }}
                    >
                      <span style={{ fontSize: 28 }}>{opt.icon}</span>
                      <span style={{ fontWeight: 700, fontSize: 13, color: form.orientation === opt.value ? 'var(--accent)' : 'var(--text)' }}>{opt.label}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Playlist</label>
                <select
                  className="form-control"
                  value={form.playlist_id}
                  onChange={e => setForm(f => ({ ...f, playlist_id: e.target.value }))}
                >
                  <option value="">— Nenhuma —</option>
                  {playlists.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <small className="text-muted">Cada slide da playlist define seu próprio layout e conteúdo.</small>
              </div>

              <div className="form-group">
                <label className="form-label">Ticker no rodapé</label>
                <select
                  className="form-control"
                  value={form.ticker_id}
                  onChange={e => setForm(f => ({ ...f, ticker_id: e.target.value }))}
                >
                  <option value="">— Nenhum —</option>
                  {tickers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>

              {modal !== 'create' && (
                <div className="form-group">
                  <label className="form-label">URL para abrir no navegador da TV:</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input className="form-control" readOnly value={getTvUrl(modal.token)} style={{ fontSize: 12 }} />
                    <button className="btn btn-secondary" onClick={() => navigator.clipboard.writeText(getTvUrl(modal.token))}>
                      Copiar
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={closeModal}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
                {loading ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPair && (
        <PairModal screens={screens} onClose={() => setShowPair(false)} />
      )}
    </div>
  )
}
