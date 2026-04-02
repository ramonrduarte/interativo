import React, { useEffect, useState } from 'react'
import { api } from '../api.js'

export default function Companies() {
  const [companies, setCompanies]   = useState([])
  const [modal, setModal]           = useState(false)
  const [expanded, setExpanded]     = useState(null) // company id
  const [form, setForm]             = useState({ company_name: '', admin_name: '', admin_email: '', admin_password: '' })
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')

  async function load() {
    try { setCompanies(await api.adminGetCompanies()) } catch (e) { console.error(e) }
  }

  useEffect(() => { load() }, [])

  function openModal() {
    setForm({ company_name: '', admin_name: '', admin_email: '', admin_password: '' })
    setError('')
    setModal(true)
  }

  async function handleCreate(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await api.adminCreateCompany(form)
      setModal(false)
      load()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(company) {
    if (!confirm(`Excluir a empresa "${company.name}" e TODOS os seus dados?\n\nEssa ação não pode ser desfeita.`)) return
    try {
      await api.adminDeleteCompany(company.id)
      load()
    } catch (e) { alert(e.message) }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Empresas</h1>
          <p className="page-subtitle">Gerencie os clientes e suas contas de acesso</p>
        </div>
        <button className="btn btn-primary" onClick={openModal}>+ Nova Empresa</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {companies.map(c => (
          <div key={c.id} className="card" style={{ overflow: 'hidden' }}>
            {/* Header da empresa */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{c.name}</div>
                <div className="text-sm text-muted" style={{ marginTop: 2 }}>
                  {c.user_count} {c.user_count === 1 ? 'usuário' : 'usuários'} · {c.screen_count} {c.screen_count === 1 ? 'tela' : 'telas'}
                </div>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setExpanded(expanded === c.id ? null : c.id)}
              >
                {expanded === c.id ? 'Ocultar usuários' : 'Ver usuários'}
              </button>
              <button
                className="btn btn-secondary btn-sm"
                style={{ color: '#e53e3e' }}
                onClick={() => handleDelete(c)}
              >
                Excluir
              </button>
            </div>

            {/* Usuários expandidos */}
            {expanded === c.id && (
              <div style={{ borderTop: '1px solid #e2e8f0', padding: '12px 20px', background: '#f8f9fa' }}>
                {c.users.length === 0 ? (
                  <p className="text-sm text-muted">Nenhum usuário nessa empresa.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {c.users.map(u => (
                      <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontWeight: 500, fontSize: 14 }}>{u.name}</span>
                          <span className="text-muted text-sm" style={{ marginLeft: 8 }}>{u.email}</span>
                        </div>
                        <span className={`badge ${u.role === 'superadmin' ? 'badge-blue' : 'badge-gray'}`}>
                          {u.role}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {companies.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">🏢</div>
            <p className="empty-state-text">Nenhuma empresa cadastrada.</p>
          </div>
        )}
      </div>

      {/* Modal nova empresa */}
      {modal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div className="card" style={{ width: '100%', maxWidth: 480, padding: 28, margin: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 20 }}>Nova Empresa</h2>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              <div>
                <label className="text-sm" style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
                  Nome da empresa
                </label>
                <input className="input" value={form.company_name} required style={{ width: '100%' }}
                  placeholder="Ex: Supermercado ABC"
                  onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} />
              </div>

              <div className="divider" style={{ margin: '4px 0' }} />
              <p className="text-sm text-muted">Dados do administrador desta empresa:</p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="text-sm" style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Nome</label>
                  <input className="input" value={form.admin_name} required style={{ width: '100%' }}
                    onChange={e => setForm(f => ({ ...f, admin_name: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm" style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Email</label>
                  <input className="input" type="email" value={form.admin_email} required style={{ width: '100%' }}
                    onChange={e => setForm(f => ({ ...f, admin_email: e.target.value }))} />
                </div>
              </div>

              <div>
                <label className="text-sm" style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Senha</label>
                <input className="input" type="password" value={form.admin_password} required style={{ width: '100%' }}
                  placeholder="Mínimo 6 caracteres"
                  onChange={e => setForm(f => ({ ...f, admin_password: e.target.value }))} />
              </div>

              {error && (
                <div style={{
                  padding: '10px 14px', borderRadius: 6, fontSize: 14,
                  background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030',
                }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Criando...' : 'Criar empresa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
