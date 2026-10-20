import React, { useEffect, useState, useRef } from 'react'
import { api } from '../api.js'
import socket from '../socket.js'

// Aparelhos conectados a uma tela (app Android ou navegador)
function DeviceList({ devices }) {
  if (!devices?.length) return null
  return (
    <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>
      {devices.map(d => {
        const isApp = d.client === 'app'
        const name  = isApp
          ? [d.manufacturer, d.model].filter(Boolean).join(' ') || 'Android'
          : 'Navegador'
        const details = [
          isApp && d.android    && `Android ${d.android}`,
          isApp && d.appVersion && `app v${d.appVersion}`,
          d.localIp || d.ip,
        ].filter(Boolean).join(' · ')
        return (
          <div key={d.socketId} style={{ fontSize: 12, lineHeight: 1.3 }}>
            <span style={{ fontWeight: 600 }}>{isApp ? '📺' : '🌐'} {name}</span>
            {d.power === 'standby' && (
              <span className="badge badge-gray" style={{ marginLeft: 6, fontSize: 10 }}>🌙 Fora do horário</span>
            )}
            {details && <div className="text-muted">{details}</div>}
          </div>
        )
      })}
    </div>
  )
}

const DEFAULT_RULE = { days: [1, 2, 3, 4, 5], on: '08:00', off: '18:00' }
const EMPTY_POWER  = { enabled: false, rules: [DEFAULT_RULE] }
const EMPTY_FORM   = { name: '', playlist_group_id: '', playlist_id: '', ticker_id: '', orientation: 'landscape', power: EMPTY_POWER }
const DAY_LABELS   = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function powerSummary(p) {
  if (!p?.enabled || !p.rules?.length) return null
  return p.rules.map(r => `${r.days.map(d => DAY_LABELS[d]).join(', ')} ${r.on}–${r.off}`).join(' · ')
}

// ── Horário de funcionamento (ligar/desligar) — usado pelo app Android ─────
function PowerScheduleEditor({ value, onChange }) {
  const power = value || EMPTY_POWER
  const rules = power.rules?.length ? power.rules : [DEFAULT_RULE]

  function setRule(i, patch) {
    onChange({ ...power, rules: rules.map((r, idx) => idx === i ? { ...r, ...patch } : r) })
  }
  function toggleDay(i, d) {
    const days = rules[i].days.includes(d) ? rules[i].days.filter(x => x !== d) : [...rules[i].days, d].sort()
    setRule(i, { days })
  }

  return (
    <div className="form-group">
      <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={!!power.enabled}
          onChange={e => onChange({ ...power, rules, enabled: e.target.checked })}
        />
        Horário de funcionamento
      </label>
      <small className="text-muted">
        Fora destes horários a TV fica desligada (tela apagada). Funciona no app Android Interativa Player.
      </small>

      {power.enabled && (
        <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
          {rules.map((r, i) => (
            <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                {DAY_LABELS.map((label, d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(i, d)}
                    className={`btn btn-sm ${r.days.includes(d) ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ minWidth: 44 }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className="text-sm text-muted">Liga</span>
                <input type="time" className="form-control" style={{ width: 120 }}
                  value={r.on} onChange={e => setRule(i, { on: e.target.value })} />
                <span className="text-sm text-muted">Desliga</span>
                <input type="time" className="form-control" style={{ width: 120 }}
                  value={r.off} onChange={e => setRule(i, { off: e.target.value })} />
                {rules.length > 1 && (
                  <button type="button" className="btn btn-danger btn-sm" style={{ marginLeft: 'auto' }}
                    onClick={() => onChange({ ...power, rules: rules.filter((_, idx) => idx !== i) })}>
                    ✕
                  </button>
                )}
              </div>
              {r.off < r.on && (
                <small className="text-muted">Desliga no dia seguinte (atravessa a meia-noite).</small>
              )}
            </div>
          ))}
          <button type="button" className="btn btn-secondary btn-sm" style={{ justifySelf: 'start' }}
            onClick={() => onChange({ ...power, rules: [...rules, { days: [6], on: '08:00', off: '12:00' }] })}>
            + Outro horário (ex.: sábado)
          </button>
        </div>
      )}
    </div>
  )
}

function TvLinkBanner({ pairingToken }) {
  const [copied, setCopied] = useState(false)
  const tvUrl = pairingToken
    ? `${window.location.origin}/tv/?c=${pairingToken}`
    : `${window.location.origin}/tv/`

  function copy() {
    navigator.clipboard.writeText(tvUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div style={{
      background: '#f0f7ff', border: '1px solid #bfdbfe', borderRadius: 10,
      padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: '#1e40af', marginBottom: 4 }}>
          Link de acesso da TV
        </div>
        <div style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>
          Abra este link no navegador da TV. Cada empresa tem seu próprio link — isso garante que somente suas telas possam ser pareadas.
        </div>
        {pairingToken && (
          <div style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>
            No app <strong>Interativa Player</strong>, use <em>Parear com código</em> e informe o código da empresa:{' '}
            <span style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 700, letterSpacing: 3, color: '#1e40af' }}>
              {pairingToken}
            </span>
          </div>
        )}
        <div style={{
          fontFamily: 'monospace', fontSize: 13, background: '#e0f2fe',
          padding: '6px 10px', borderRadius: 6, color: '#0c4a6e', wordBreak: 'break-all',
        }}>
          {tvUrl}
        </div>
      </div>
      <button className="btn btn-secondary btn-sm" onClick={copy} style={{ whiteSpace: 'nowrap' }}>
        {copied ? '✓ Copiado' : 'Copiar link'}
      </button>
    </div>
  )
}

// ── Pairing Modal ──────────────────────────────────────────────────────────
function PairModal({ screens, onClose }) {
  const [code, setCode]         = useState('')
  const [screenId, setScreenId] = useState('')
  const [waiting, setWaiting]   = useState([])
  const [status, setStatus]     = useState(null)
  const [msg, setMsg]           = useState('')
  const pollRef = useRef(null)

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
            Abra o app na TV com o código da sua empresa. Ela exibirá um código de 6 caracteres.
            Somente TVs que usaram o código da sua empresa aparecem aqui.
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
  const [screens, setScreens]         = useState([])
  const [playlists, setPlaylists]     = useState([])
  const [groups, setGroups]           = useState([])
  const [tickers, setTickers]         = useState([])
  const [modal, setModal]             = useState(null)
  const [showPair, setShowPair]       = useState(false)
  const [form, setForm]               = useState(EMPTY_FORM)
  const [loading, setLoading]         = useState(false)
  const [pairingToken, setPairingToken] = useState('')

  async function load() {
    try {
      const [s, p, g, t, company] = await Promise.all([
        api.getScreens(), api.getPlaylists(), api.getPlaylistGroups(), api.getTickers(), api.getCompany(),
      ])
      setScreens(s); setPlaylists(p); setGroups(g); setTickers(t)
      if (company?.pairing_token) setPairingToken(company.pairing_token)
    } catch (e) { console.error('Erro ao carregar:', e) }
  }

  useEffect(() => {
    load()
    // Atualiza online/aparelhos ao vivo
    function onStatus({ token, online, devices }) {
      setScreens(prev => prev.map(s => s.token === token ? { ...s, online, devices: devices || [] } : s))
    }
    socket.on('screen:status', onStatus)
    return () => socket.off('screen:status', onStatus)
  }, [])

  function openCreate() { setForm(EMPTY_FORM); setModal('create') }

  function openEdit(s) {
    setForm({
      name:              s.name,
      playlist_group_id: s.playlist_group_id || '',
      playlist_id:       s.playlist_id       || '',
      ticker_id:         s.ticker_id         || '',
      orientation:       s.orientation       || 'landscape',
      power:             s.power_schedule    || EMPTY_POWER,
    })
    setModal(s)
  }

  function closeModal() { setModal(null) }

  async function handleSave() {
    if (!form.name.trim()) return alert('Nome é obrigatório')
    setLoading(true)
    try {
      const payload = {
        name:              form.name,
        playlist_group_id: form.playlist_group_id || null,
        playlist_id:       form.playlist_group_id ? null : (form.playlist_id || null),
        ticker_id:         form.ticker_id         || null,
        orientation:       form.orientation       || 'landscape',
        power_schedule:    form.power?.enabled ? form.power : null,
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

  function getContentLabel(s) {
    if (s.playlist_group_name) return { label: s.playlist_group_name, type: 'group' }
    if (s.playlist_name)       return { label: s.playlist_name,       type: 'playlist' }
    return null
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

      <TvLinkBanner pairingToken={pairingToken} />

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
                <th>Conteúdo</th>
                <th>Slides</th>
                <th>Ticker</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {screens.map(s => {
                const content = getContentLabel(s)
                return (
                  <tr key={s.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{s.name}</div>
                      <div className="text-sm text-muted" style={{ fontFamily: 'monospace' }}>{s.token?.slice(0, 8)}…</div>
                      {powerSummary(s.power_schedule) && (
                        <div className="text-sm text-muted">⏰ {powerSummary(s.power_schedule)}</div>
                      )}
                    </td>
                    <td>
                      {s.orientation === 'portrait' ? '📱 Vertical' : '🖥️ Horizontal'}
                    </td>
                    <td>
                      {content
                        ? <span className={`badge ${content.type === 'group' ? 'badge-blue' : 'badge-gray'}`}>
                            {content.type === 'group' ? '📋 ' : ''}{content.label}
                          </span>
                        : <span className="text-muted">—</span>}
                    </td>
                    <td>
                      {s.slide_count > 0
                        ? <span className="badge badge-success">{s.slide_count} slide{s.slide_count > 1 ? 's' : ''}</span>
                        : <span className="text-muted">—</span>}
                    </td>
                    <td>{s.ticker_name || <span className="text-muted">—</span>}</td>
                    <td>
                      <span className={`badge ${s.online ? 'badge-success' : 'badge-gray'}`}>
                        {s.online ? 'Online' : 'Offline'}
                        {s.devices?.length > 1 && ` · ${s.devices.length} aparelhos`}
                      </span>
                      <DeviceList devices={s.devices} />
                    </td>
                    <td>
                      <div className="table-actions">
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(s)}>Editar</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(s)}>✕</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
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

              {/* Grupo de Playlists — opção preferencial */}
              <div className="form-group">
                <label className="form-label">
                  Grupo de Playlists
                  <span className="badge badge-blue" style={{ marginLeft: 8, fontSize: 10 }}>Recomendado</span>
                </label>
                <select
                  className="form-control"
                  value={form.playlist_group_id}
                  onChange={e => setForm(f => ({ ...f, playlist_group_id: e.target.value, playlist_id: '' }))}
                >
                  <option value="">— Nenhum —</option>
                  {groups.map(g => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.playlists?.length || 0} playlists)
                    </option>
                  ))}
                </select>
                <small className="text-muted">
                  Exibe todas as playlists do grupo em sequência. Ideal para combinar uma programação padrão com outras.
                </small>
              </div>

              {/* Playlist avulsa — só aparece se não houver grupo selecionado */}
              {!form.playlist_group_id && (
                <div className="form-group">
                  <label className="form-label">Ou selecione uma Playlist avulsa</label>
                  <select
                    className="form-control"
                    value={form.playlist_id}
                    onChange={e => setForm(f => ({ ...f, playlist_id: e.target.value }))}
                  >
                    <option value="">— Nenhuma —</option>
                    {playlists.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}

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

              <PowerScheduleEditor
                value={form.power}
                onChange={power => setForm(f => ({ ...f, power }))}
              />

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
