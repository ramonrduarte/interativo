import React, { useEffect, useState } from 'react'
import { api } from '../api.js'

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const DAY_COLORS = ['#7c3aed', '#2563eb', '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed']
const ALL_DAYS  = [0, 1, 2, 3, 4, 5, 6]
const WEEKDAYS  = [1, 2, 3, 4, 5]

const EMPTY_FORM = {
  screen_id: '', playlist_id: '', name: '',
  // type: 'block' = time window; 'interval' = periodic occurrence
  schedule_type: 'block',
  interval_minutes: 30, interval_duration: 5,
  // day filter: 'weekdays' | 'calendar' | 'both'
  day_filter: 'weekdays',
  days: WEEKDAYS,
  date_from: '', date_to: '',
  start_time: '08:00', end_time: '18:00',
  priority: 0,
}

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function scheduleLabel(s) {
  if (s.interval_minutes) return `↻ ${s.interval_minutes}min`
  return s.playlist_name || '—'
}

function ScheduleBlock({ schedule, onClick }) {
  const startMin = timeToMinutes(schedule.start_time)
  const endMin   = timeToMinutes(schedule.end_time)
  const top    = (startMin / 1440) * 100
  const height = ((endMin - startMin) / 1440) * 100
  const isInterval = !!schedule.interval_minutes

  return (
    <div
      onClick={() => onClick(schedule)}
      style={{
        position: 'absolute', left: '4%', right: '4%',
        top: `${top}%`, height: `${Math.max(height, 2)}%`,
        background: schedule.active !== false
          ? (isInterval ? '#7c3aed' : '#2563eb')
          : '#4b5563',
        borderRadius: 4, padding: '2px 5px', cursor: 'pointer',
        fontSize: 10, color: '#fff', overflow: 'hidden',
        borderLeft: `3px solid rgba(255,255,255,.4)`,
        minHeight: 18,
      }}
      title={`${schedule.playlist_name}\n${schedule.start_time}–${schedule.end_time}${isInterval ? `\nA cada ${schedule.interval_minutes}min por ${schedule.interval_duration}min` : ''}`}
    >
      <div style={{ fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {isInterval ? `↻ ${schedule.interval_minutes}min` : schedule.playlist_name || '—'}
      </div>
      <div style={{ opacity: .8, fontSize: 9 }}>{schedule.start_time}–{schedule.end_time}</div>
    </div>
  )
}

function ScheduleModal({ initial, screens, playlists, onSave, onDelete, onClose }) {
  // Derive UI state from existing schedule data
  function toFormState(s) {
    return {
      ...EMPTY_FORM,
      ...s,
      schedule_type: s.interval_minutes ? 'interval' : 'block',
      day_filter: (s.date_from || s.date_to)
        ? ((s.days?.length ? 'both' : 'calendar'))
        : 'weekdays',
      days:      s.days      || WEEKDAYS,
      date_from: s.date_from || '',
      date_to:   s.date_to   || '',
      interval_minutes:  s.interval_minutes  || 30,
      interval_duration: s.interval_duration || 5,
    }
  }

  const [form, setForm]   = useState(() => toFormState(initial))
  const [saving, setSaving] = useState(false)

  function set(patch) { setForm(f => ({ ...f, ...patch })) }

  function toggleDay(d) {
    setForm(f => ({
      ...f,
      days: f.days.includes(d) ? f.days.filter(x => x !== d) : [...f.days, d].sort((a, b) => a - b),
    }))
  }

  async function handleSave() {
    if (!form.screen_id)   return alert('Selecione uma tela')
    if (!form.playlist_id) return alert('Selecione uma playlist')
    if (form.start_time >= form.end_time) return alert('Horário de início deve ser antes do fim')
    if (form.day_filter !== 'calendar' && form.days.length === 0)
      return alert('Selecione ao menos um dia da semana')
    if ((form.day_filter === 'calendar' || form.day_filter === 'both') && !form.date_from)
      return alert('Informe a data inicial do período')
    if (form.schedule_type === 'interval') {
      if (!form.interval_minutes || form.interval_minutes < 2)
        return alert('Intervalo mínimo: 2 minutos')
      if (!form.interval_duration || form.interval_duration < 1)
        return alert('Duração mínima: 1 minuto')
      if (form.interval_duration >= form.interval_minutes)
        return alert('A duração deve ser menor que o intervalo')
    }

    const payload = {
      screen_id:    form.screen_id,
      playlist_id:  form.playlist_id,
      name:         form.name,
      start_time:   form.start_time,
      end_time:     form.end_time,
      priority:     form.priority,
      active:       form.active,
      days:         form.day_filter === 'calendar' ? [] : form.days,
      date_from:    (form.day_filter === 'calendar' || form.day_filter === 'both') ? form.date_from : null,
      date_to:      (form.day_filter === 'calendar' || form.day_filter === 'both') ? (form.date_to || null) : null,
      interval_minutes:  form.schedule_type === 'interval' ? Number(form.interval_minutes)  : null,
      interval_duration: form.schedule_type === 'interval' ? Number(form.interval_duration) : null,
    }

    setSaving(true)
    try { await onSave({ ...payload, id: form.id }) }
    catch (e) { alert(e.message) }
    finally { setSaving(false) }
  }

  const showDays     = form.day_filter === 'weekdays' || form.day_filter === 'both'
  const showCalendar = form.day_filter === 'calendar' || form.day_filter === 'both'

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 540 }}>
        <div className="modal-header">
          <span className="modal-title">{initial.id ? 'Editar Agendamento' : 'Novo Agendamento'}</span>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Name */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Nome / descrição (opcional)</label>
            <input className="form-control" placeholder="Ex: Promoções de manhã"
              value={form.name} onChange={e => set({ name: e.target.value })} />
          </div>

          {/* Screen + Playlist */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Tela *</label>
              <select className="form-control" value={form.screen_id}
                onChange={e => set({ screen_id: e.target.value })}>
                <option value="">— Selecione —</option>
                {screens.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Playlist *</label>
              <select className="form-control" value={form.playlist_id}
                onChange={e => set({ playlist_id: e.target.value })}>
                <option value="">— Selecione —</option>
                {playlists.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>

          {/* Schedule type */}
          <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, border: '1px solid var(--border)' }}>
            <label className="form-label" style={{ marginBottom: 8 }}>Tipo de agendamento</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: form.schedule_type === 'interval' ? 12 : 0 }}>
              {[
                { v: 'block',    label: 'Bloco de tempo',      desc: 'Toca continuamente no período' },
                { v: 'interval', label: 'Intervalo periódico', desc: 'Interrompe a cada X minutos' },
              ].map(opt => (
                <button key={opt.v} type="button" onClick={() => set({ schedule_type: opt.v })}
                  style={{
                    flex: 1, padding: '8px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', textAlign: 'left',
                    background: form.schedule_type === opt.v ? 'var(--accent)' : 'var(--bg-card)',
                    color: form.schedule_type === opt.v ? '#fff' : 'var(--text)',
                    outline: form.schedule_type === opt.v ? 'none' : '1px solid var(--border)',
                  }}>
                  <div style={{ fontWeight: 700, fontSize: 12 }}>{opt.label}</div>
                  <div style={{ fontSize: 10, opacity: .75, marginTop: 2 }}>{opt.desc}</div>
                </button>
              ))}
            </div>

            {form.schedule_type === 'interval' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">A cada (minutos) *</label>
                  <input type="number" className="form-control" min={2} max={240}
                    value={form.interval_minutes}
                    onChange={e => set({ interval_minutes: e.target.value })} />
                  <small className="text-muted">Frequência da aparição</small>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Por (minutos) *</label>
                  <input type="number" className="form-control" min={1} max={60}
                    value={form.interval_duration}
                    onChange={e => set({ interval_duration: e.target.value })} />
                  <small className="text-muted">Duração de cada aparição</small>
                </div>
              </div>
            )}
          </div>

          {/* Time window */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">{form.schedule_type === 'interval' ? 'Início do período' : 'Início'}</label>
              <input type="time" className="form-control" value={form.start_time}
                onChange={e => set({ start_time: e.target.value })} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">{form.schedule_type === 'interval' ? 'Fim do período' : 'Fim'}</label>
              <input type="time" className="form-control" value={form.end_time}
                onChange={e => set({ end_time: e.target.value })} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Prioridade</label>
              <input type="number" className="form-control" min={0} max={10} value={form.priority}
                onChange={e => set({ priority: +e.target.value })} />
              <small className="text-muted">Maior = prevalece</small>
            </div>
          </div>

          {/* Day filter */}
          <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, border: '1px solid var(--border)' }}>
            <label className="form-label" style={{ marginBottom: 8 }}>Filtro de dias</label>
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {[
                { v: 'weekdays', label: 'Dias da semana' },
                { v: 'calendar', label: 'Período do calendário' },
                { v: 'both',     label: 'Período + dias da semana' },
              ].map(opt => (
                <button key={opt.v} type="button" onClick={() => set({ day_filter: opt.v })}
                  style={{
                    padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                    border: 'none', cursor: 'pointer',
                    background: form.day_filter === opt.v ? 'var(--accent)' : 'var(--bg-card)',
                    color: form.day_filter === opt.v ? '#fff' : 'var(--text-muted)',
                    outline: form.day_filter === opt.v ? 'none' : '1px solid var(--border)',
                  }}>{opt.label}</button>
              ))}
            </div>

            {showCalendar && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: showDays ? 12 : 0 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Data inicial *</label>
                  <input type="date" className="form-control" value={form.date_from}
                    onChange={e => set({ date_from: e.target.value })} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Data final (opcional)</label>
                  <input type="date" className="form-control" value={form.date_to}
                    onChange={e => set({ date_to: e.target.value })} />
                  <small className="text-muted">Vazio = sem data de fim</small>
                </div>
              </div>
            )}

            {showDays && (
              <>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {DAYS.map((label, d) => (
                    <button key={d} type="button" onClick={() => toggleDay(d)}
                      style={{
                        padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                        border: 'none', cursor: 'pointer',
                        background: form.days.includes(d) ? DAY_COLORS[d] : 'var(--bg-card)',
                        color: form.days.includes(d) ? '#fff' : 'var(--text-muted)',
                        outline: form.days.includes(d) ? `2px solid ${DAY_COLORS[d]}` : '1px solid var(--border)',
                      }}>{label}</button>
                  ))}
                </div>
                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                  <button type="button" className="btn btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }}
                    onClick={() => set({ days: WEEKDAYS })}>Seg–Sex</button>
                  <button type="button" className="btn btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }}
                    onClick={() => set({ days: [0, 6] })}>Fins de semana</button>
                  <button type="button" className="btn btn-secondary" style={{ fontSize: 11, padding: '3px 8px' }}
                    onClick={() => set({ days: ALL_DAYS })}>Todos os dias</button>
                </div>
              </>
            )}
          </div>

          {/* Active toggle (edit only) */}
          {initial.id && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.active !== false && form.active !== 0}
                onChange={e => set({ active: e.target.checked })} />
              <span className="form-label" style={{ margin: 0 }}>Agendamento ativo</span>
            </label>
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
  const [modal, setModal] = useState(null)

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

  function openEdit(s) {
    setModal({
      ...s,
      days: s.days ? [...s.days] : [],
    })
  }

  const filteredSchedules = selectedScreen
    ? schedules.filter(s => s.screen_id == selectedScreen)
    : schedules

  const hours = Array.from({ length: 25 }, (_, i) => i)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Agendamentos</h1>
          <p className="page-subtitle">Programe playlists diferentes por dia, horário ou período</p>
        </div>
        <button className="btn btn-primary"
          onClick={() => setModal({ ...EMPTY_FORM, screen_id: selectedScreen || '' })}>
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

      {/* Weekly grid — shows only block schedules with day-of-week filter */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-body" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '48px repeat(7, 1fr)', borderRadius: 8 }}>
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
            <div style={{ display: 'contents' }}>
              <div style={{ position: 'relative', gridColumn: '1', gridRow: '2', height: 480, background: 'var(--bg-card)' }}>
                {hours.map(h => (
                  <div key={h} style={{
                    position: 'absolute', top: `${(h / 24) * 100}%`, left: 0, right: 0,
                    fontSize: 9, color: 'var(--text-muted)', paddingLeft: 4, transform: 'translateY(-50%)',
                  }}>
                    {h < 24 ? `${String(h).padStart(2, '0')}h` : ''}
                  </div>
                ))}
              </div>
              {DAYS.map((_, d) => {
                const daySchedules = filteredSchedules.filter(s =>
                  (s.days || []).includes(d) && !s.date_from  // only pure weekday schedules
                )
                return (
                  <div key={d} style={{
                    position: 'relative', height: 480, gridRow: '2',
                    borderLeft: '1px solid var(--border)', background: 'var(--bg-card)',
                  }}>
                    {hours.map(h => (
                      <div key={h} style={{
                        position: 'absolute', top: `${(h / 24) * 100}%`, left: 0, right: 0,
                        borderTop: h % 6 === 0 ? '1px solid var(--border)' : '1px dashed rgba(255,255,255,.04)',
                      }} />
                    ))}
                    {daySchedules.map(s => (
                      <ScheduleBlock key={s.id} schedule={s} onClick={openEdit} />
                    ))}
                    <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}
                      onClick={() => setModal({ ...EMPTY_FORM, days: [d], screen_id: selectedScreen || '' })} />
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* List */}
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
                <th>Período / Dias</th>
                <th>Horário</th>
                <th>Tipo</th>
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
                  <td style={{ fontSize: 11 }}>
                    {(s.date_from || s.date_to) && (
                      <div style={{ color: 'var(--accent)', fontWeight: 600 }}>
                        {s.date_from} {s.date_to ? `→ ${s.date_to}` : '→ sem fim'}
                      </div>
                    )}
                    {(s.days || []).length > 0 && (
                      <div>{(s.days || []).map(d => DAYS[d]).join(', ')}</div>
                    )}
                    {!(s.date_from || s.date_to) && !(s.days || []).length && (
                      <span className="text-muted">Todos os dias</span>
                    )}
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{s.start_time} – {s.end_time}</td>
                  <td>
                    {s.interval_minutes
                      ? <span className="badge" style={{ background: '#7c3aed20', color: '#7c3aed' }}>
                          ↻ {s.interval_minutes}min / {s.interval_duration}min
                        </span>
                      : <span className="badge badge-gray">Bloco</span>
                    }
                  </td>
                  <td>
                    <span className={`badge ${s.active !== false && s.active !== 0 ? 'badge-success' : 'badge-gray'}`}>
                      {s.active !== false && s.active !== 0 ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td>
                    <div className="table-actions">
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(s)}>Editar</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(s.id)}>✕</button>
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
