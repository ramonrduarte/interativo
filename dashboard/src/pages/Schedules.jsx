import React, { useEffect, useState } from 'react'
import { api } from '../api.js'

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const DAY_COLORS = ['#7c3aed', '#2563eb', '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed']
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]
const WEEKDAYS = [1, 2, 3, 4, 5]

const EMPTY_FORM = {
  screen_id: '', playlist_id: '', name: '',
  days: WEEKDAYS, start_time: '08:00', end_time: '18:00', priority: 0,
}

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

// Visual block on the weekly grid
function ScheduleBlock({ schedule, onClick, onDelete }) {
  const startMin = timeToMinutes(schedule.start_time)
  const endMin   = timeToMinutes(schedule.end_time)
  const top  = (startMin / 1440) * 100
  const height = ((endMin - startMin) / 1440) * 100

  return (
    <div
      onClick={() => onClick(schedule)}
      style={{
        position: 'absolute', left: '4%', right: '4%',
        top: `${top}%`, height: `${Math.max(height, 2)}%`,
        background: schedule.active !== false ? '#2563eb' : '#4b5563',
        borderRadius: 4, padding: '2px 5px', cursor: 'pointer',
        fontSize: 10, color: '#fff', overflow: 'hidden',
        borderLeft: '3px solid rgba(255,255,255,.4)',
        minHeight: 18,
      }}
      title={`${schedule.playlist_name}\n${schedule.start_time}–${schedule.end_time}`}
    >
      <div style={{ fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {schedule.playlist_name || '—'}
      </div>
      <div style={{ opacity: .8, fontSize: 9 }}>{schedule.start_time}–{schedule.end_time}</div>
    </div>
  )
}

// Modal for create/edit
function ScheduleModal({ initial, screens, playlists, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)

  function toggleDay(d) {
    setForm(f => ({
      ...f,
      days: f.days.includes(d) ? f.days.filter(x => x !== d) : [...f.days, d].sort((a, b) => a - b),
    }))
  }

  async function handleSave() {
    if (!form.screen_id)   return alert('Selecione uma tela')
    if (!form.playlist_id) return alert('Selecione uma playlist')
    if (!form.days.length) return alert('Selecione ao menos um dia')
    if (form.start_time >= form.end_time) return alert('Horário de início deve ser antes do fim')
    setSaving(true)
    try { await onSave(form) } catch (e) { alert(e.message) } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <span className="modal-title">{initial.id ? 'Editar Agendamento' : 'Novo Agendamento'}</span>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">

          <div className="form-group">
            <label className="form-label">Nome / descrição (opcional)</label>
            <input className="form-control" placeholder="Ex: Promoções de manhã"
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>

          <div className="form-group">
            <label className="form-label">Tela *</label>
            <select className="form-control" value={form.screen_id}
              onChange={e => setForm(f => ({ ...f, screen_id: e.target.value }))}>
              <option value="">— Selecione —</option>
              {screens.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Playlist *</label>
            <select className="form-control" value={form.playlist_id}
              onChange={e => setForm(f => ({ ...f, playlist_id: e.target.value }))}>
              <option value="">— Selecione —</option>
              {playlists.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Dias da semana *</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              {DAYS.map((label, d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(d)}
                  style={{
                    padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                    background: form.days.includes(d) ? DAY_COLORS[d] : 'var(--bg-card)',
                    color: form.days.includes(d) ? '#fff' : 'var(--text-muted)',
                    outline: form.days.includes(d) ? `2px solid ${DAY_COLORS[d]}` : '1px solid var(--border)',
                  }}
                >{label}</button>
              ))}
            </div>
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }}
                onClick={() => setForm(f => ({ ...f, days: WEEKDAYS }))}>Seg–Sex</button>
              <button type="button" className="btn btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }}
                onClick={() => setForm(f => ({ ...f, days: [0, 6] }))}>Fins de semana</button>
              <button type="button" className="btn btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }}
                onClick={() => setForm(f => ({ ...f, days: ALL_DAYS }))}>Todos os dias</button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Início</label>
              <input type="time" className="form-control" value={form.start_time}
                onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Fim</label>
              <input type="time" className="form-control" value={form.end_time}
                onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Prioridade</label>
              <input type="number" className="form-control" min={0} max={10} value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: +e.target.value }))} />
              <small className="text-muted">Maior = prevalece</small>
            </div>
          </div>

          {initial.id && (
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.active !== false}
                  onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
                <span className="form-label" style={{ margin: 0 }}>Agendamento ativo</span>
              </label>
            </div>
          )}
        </div>
        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          <div>
            {initial.id && (
              <button className="btn btn-danger" onClick={() => onDelete(initial.id)}>Excluir</button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Schedules() {
  const [schedules, setSchedules] = useState([])
  const [screens, setScreens]     = useState([])
  const [playlists, setPlaylists] = useState([])
  const [selectedScreen, setSelectedScreen] = useState('')
  const [modal, setModal]         = useState(null) // null | form obj

  async function load(screenId) {
    try {
      const [sc, scr, pl] = await Promise.all([
        api.getSchedules(screenId || undefined),
        api.getScreens(),
        api.getPlaylists(),
      ])
      setSchedules(sc); setScreens(scr); setPlaylists(pl)
    } catch (e) { console.error(e) }
  }

  useEffect(() => { load(selectedScreen) }, [selectedScreen])

  async function handleSave(form) {
    if (form.id) await api.updateSchedule(form.id, form)
    else await api.createSchedule(form)
    await load(selectedScreen)
    setModal(null)
  }

  async function handleDelete(id) {
    if (!confirm('Excluir este agendamento?')) return
    await api.deleteSchedule(id)
    await load(selectedScreen)
    setModal(null)
  }

  // Group schedules by day for the weekly grid
  const byDay = Array.from({ length: 7 }, (_, d) =>
    schedules.filter(s => (s.days || []).includes(d) && s.active !== false)
  )

  // Hour lines for the grid background
  const hours = Array.from({ length: 25 }, (_, i) => i)

  const filteredSchedules = selectedScreen
    ? schedules.filter(s => s.screen_id == selectedScreen)
    : schedules

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Agendamentos</h1>
          <p className="page-subtitle">Programe playlists diferentes por dia e horário</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModal({ ...EMPTY_FORM, screen_id: selectedScreen || '' })}>
          + Novo Agendamento
        </button>
      </div>

      {/* Screen filter */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
        <label className="form-label" style={{ margin: 0, flexShrink: 0 }}>Filtrar por tela:</label>
        <select className="form-control" style={{ maxWidth: 260 }} value={selectedScreen}
          onChange={e => setSelectedScreen(e.target.value)}>
          <option value="">Todas as telas</option>
          {screens.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {/* Weekly grid */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-body" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '48px repeat(7, 1fr)', borderRadius: 8 }}>

            {/* Header row */}
            <div style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }} />
            {DAYS.map((day, d) => (
              <div key={d} style={{
                padding: '10px 4px', textAlign: 'center', fontWeight: 700, fontSize: 13,
                background: 'var(--bg)', borderBottom: '1px solid var(--border)',
                color: d === new Date().getDay() ? 'var(--accent)' : 'var(--text)',
                borderLeft: '1px solid var(--border)',
              }}>
                {day}
                {d === new Date().getDay() && (
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', margin: '2px auto 0' }} />
                )}
              </div>
            ))}

            {/* Grid body */}
            <div style={{ display: 'contents' }}>
              {/* Time labels + hour lines overlay */}
              <div style={{ position: 'relative', gridColumn: '1', gridRow: '2', height: 480, background: 'var(--bg-card)' }}>
                {hours.map(h => (
                  <div key={h} style={{
                    position: 'absolute', top: `${(h / 24) * 100}%`, left: 0, right: 0,
                    fontSize: 9, color: 'var(--text-muted)', paddingLeft: 4,
                    transform: 'translateY(-50%)',
                  }}>
                    {h < 24 ? `${String(h).padStart(2, '0')}h` : ''}
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {DAYS.map((_, d) => {
                const daySchedules = filteredSchedules.filter(s => (s.days || []).includes(d))
                return (
                  <div key={d} style={{
                    position: 'relative', height: 480, gridRow: '2',
                    borderLeft: '1px solid var(--border)', background: 'var(--bg-card)',
                  }}>
                    {/* Hour grid lines */}
                    {hours.map(h => (
                      <div key={h} style={{
                        position: 'absolute', top: `${(h / 24) * 100}%`, left: 0, right: 0,
                        borderTop: h % 6 === 0 ? '1px solid var(--border)' : '1px dashed rgba(255,255,255,.04)',
                      }} />
                    ))}

                    {/* Schedule blocks */}
                    {daySchedules.map(s => (
                      <ScheduleBlock
                        key={s.id}
                        schedule={s}
                        onClick={s => setModal({ ...s, days: [...s.days] })}
                        onDelete={handleDelete}
                      />
                    ))}

                    {/* Click to add */}
                    <div
                      style={{ position: 'absolute', inset: 0, zIndex: 0 }}
                      onClick={() => setModal({ ...EMPTY_FORM, days: [d], screen_id: selectedScreen || '' })}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* List view */}
      {schedules.length === 0 ? (
        <div className="empty-state card">
          <div className="empty-state-icon">📅</div>
          <p className="empty-state-text">Nenhum agendamento ainda. Clique em "+ Novo Agendamento" para começar.</p>
          <p className="text-sm text-muted">Sem agendamentos, cada tela exibe sua playlist padrão o tempo todo.</p>
        </div>
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Tela</th>
                <th>Playlist</th>
                <th>Dias</th>
                <th>Horário</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map(s => (
                <tr key={s.id}>
                  <td>{s.name || <span className="text-muted">—</span>}</td>
                  <td><span className="badge badge-blue">{s.screen_name || '—'}</span></td>
                  <td>{s.playlist_name || '—'}</td>
                  <td style={{ fontSize: 12 }}>
                    {(s.days || []).map(d => DAYS[d]).join(', ')}
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{s.start_time} – {s.end_time}</td>
                  <td>
                    <span className={`badge ${s.active !== false ? 'badge-success' : 'badge-gray'}`}>
                      {s.active !== false ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td>
                    <div className="table-actions">
                      <button className="btn btn-secondary btn-sm"
                        onClick={() => setModal({ ...s, days: [...s.days] })}>Editar</button>
                      <button className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(s.id)}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <ScheduleModal
          initial={modal}
          screens={screens}
          playlists={playlists}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
