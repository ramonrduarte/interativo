import React, { useEffect, useState } from 'react'
import { api } from '../api.js'

export default function PlaylistGroups() {
  const [groups, setGroups]         = useState([])
  const [playlists, setPlaylists]   = useState([])
  const [expanded, setExpanded]     = useState(null)
  const [modal, setModal]           = useState(null) // null | 'create' | 'edit'
  const [editTarget, setEditTarget] = useState(null)
  const [form, setForm]             = useState({ name: '', description: '' })
  const [loading, setLoading]       = useState(false)
  const [addingTo, setAddingTo]     = useState(null) // group id being expanded to add playlist
  const [selectedPl, setSelectedPl] = useState('')

  async function load() {
    try {
      const [g, p] = await Promise.all([api.getPlaylistGroups(), api.getPlaylists()])
      setGroups(g)
      setPlaylists(p)
    } catch (e) { console.error(e) }
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setForm({ name: '', description: '' })
    setEditTarget(null)
    setModal('create')
  }

  function openEdit(g) {
    setForm({ name: g.name, description: g.description || '' })
    setEditTarget(g)
    setModal('edit')
  }

  async function handleSave(e) {
    e.preventDefault()
    setLoading(true)
    try {
      if (modal === 'create') {
        await api.createPlaylistGroup(form)
      } else {
        await api.updatePlaylistGroup(editTarget.id, form)
      }
      setModal(null)
      load()
    } catch (e) { alert(e.message) }
    finally { setLoading(false) }
  }

  async function handleDelete(g) {
    if (!confirm(`Excluir o grupo "${g.name}"?\n\nAs playlists dentro dele NÃO serão excluídas.`)) return
    try { await api.deletePlaylistGroup(g.id); load() } catch (e) { alert(e.message) }
  }

  async function handleAddPlaylist(groupId) {
    if (!selectedPl) return
    try {
      await api.addPlaylistToGroup(groupId, Number(selectedPl))
      setSelectedPl('')
      setAddingTo(null)
      load()
    } catch (e) { alert(e.message) }
  }

  async function handleRemovePlaylist(groupId, itemId) {
    try { await api.removePlaylistFromGroup(groupId, itemId); load() } catch (e) { alert(e.message) }
  }

  async function handleMoveUp(group, idx) {
    const items = [...group.playlists]
    if (idx === 0) return
    const reordered = items.map((item, i) => ({
      id: item.item_id,
      position: i === idx - 1 ? idx : i === idx ? idx - 1 : i,
    }))
    try { await api.reorderPlaylistGroup(group.id, reordered); load() } catch (e) { alert(e.message) }
  }

  async function handleMoveDown(group, idx) {
    const items = [...group.playlists]
    if (idx === items.length - 1) return
    const reordered = items.map((item, i) => ({
      id: item.item_id,
      position: i === idx + 1 ? idx : i === idx ? idx + 1 : i,
    }))
    try { await api.reorderPlaylistGroup(group.id, reordered); load() } catch (e) { alert(e.message) }
  }

  // Playlists not yet in this group
  function availablePlaylists(group) {
    const usedIds = new Set(group.playlists.map(p => p.id))
    return playlists.filter(p => !usedIds.has(p.id))
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Grupos de Playlists</h1>
          <p className="page-subtitle">Agrupe playlists para exibir em sequência em uma tela</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Novo Grupo</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {groups.map(g => (
          <div key={g.id} className="card" style={{ overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{g.name}</div>
                <div className="text-sm text-muted" style={{ marginTop: 2 }}>
                  {g.playlists.length} {g.playlists.length === 1 ? 'playlist' : 'playlists'}
                  {' · '}
                  {g.screen_count} {g.screen_count === 1 ? 'tela' : 'telas'}
                  {g.description && ` · ${g.description}`}
                </div>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => openEdit(g)}>Editar</button>
              <button className="btn btn-secondary btn-sm"
                onClick={() => setExpanded(expanded === g.id ? null : g.id)}>
                {expanded === g.id ? 'Fechar' : 'Gerenciar'}
              </button>
              <button className="btn btn-secondary btn-sm" style={{ color: '#e53e3e' }}
                onClick={() => handleDelete(g)}>
                Excluir
              </button>
            </div>

            {/* Expanded: playlists list */}
            {expanded === g.id && (
              <div style={{ borderTop: '1px solid #e2e8f0', background: '#f8f9fa' }}>
                {g.playlists.length === 0 ? (
                  <p className="text-sm text-muted" style={{ padding: '12px 20px' }}>
                    Nenhuma playlist neste grupo ainda.
                  </p>
                ) : (
                  <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {g.playlists.map((pl, idx) => (
                      <div key={pl.item_id} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        background: '#fff', border: '1px solid #e2e8f0',
                        borderRadius: 8, padding: '10px 14px',
                      }}>
                        <span className="text-muted text-sm" style={{ width: 24, textAlign: 'center' }}>
                          {idx + 1}
                        </span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500, fontSize: 14 }}>{pl.name}</div>
                          <div className="text-sm text-muted">{pl.slide_count} slides</div>
                        </div>
                        <button className="btn btn-secondary btn-sm" style={{ padding: '2px 8px' }}
                          onClick={() => handleMoveUp(g, idx)} disabled={idx === 0}>↑</button>
                        <button className="btn btn-secondary btn-sm" style={{ padding: '2px 8px' }}
                          onClick={() => handleMoveDown(g, idx)} disabled={idx === g.playlists.length - 1}>↓</button>
                        <button className="btn btn-secondary btn-sm" style={{ color: '#e53e3e' }}
                          onClick={() => handleRemovePlaylist(g.id, pl.item_id)}>
                          Remover
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add playlist */}
                <div style={{ padding: '0 20px 16px', display: 'flex', gap: 8, alignItems: 'center' }}>
                  {addingTo === g.id ? (
                    <>
                      <select className="input" value={selectedPl}
                        onChange={e => setSelectedPl(e.target.value)}
                        style={{ flex: 1 }}>
                        <option value="">Selecione uma playlist...</option>
                        {availablePlaylists(g).map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                      <button className="btn btn-primary btn-sm"
                        onClick={() => handleAddPlaylist(g.id)} disabled={!selectedPl}>
                        Adicionar
                      </button>
                      <button className="btn btn-secondary btn-sm"
                        onClick={() => { setAddingTo(null); setSelectedPl('') }}>
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button className="btn btn-secondary btn-sm"
                      onClick={() => { setAddingTo(g.id); setSelectedPl('') }}
                      disabled={availablePlaylists(g).length === 0}>
                      + Adicionar Playlist
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {groups.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <p className="empty-state-text">Nenhum grupo criado ainda.</p>
            <p className="text-muted text-sm mt-2">
              Crie um grupo e adicione playlists para exibir em sequência na TV.
            </p>
          </div>
        )}
      </div>

      {/* Modal create/edit */}
      {modal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div className="card" style={{ width: '100%', maxWidth: 420, padding: 28, margin: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20 }}>
              {modal === 'create' ? 'Novo Grupo' : 'Editar Grupo'}
            </h2>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="text-sm" style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Nome</label>
                <input className="input" value={form.name} required style={{ width: '100%' }}
                  placeholder="Ex: Programação Principal"
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm" style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
                  Descrição <span className="text-muted">(opcional)</span>
                </label>
                <input className="input" value={form.description} style={{ width: '100%' }}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
