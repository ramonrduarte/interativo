import React, { useEffect, useState } from 'react'
import { api } from '../api.js'

// Publicação do app Android — as TVs baixam e instalam a versão nova sozinhas
function AppReleaseCard() {
  const [release, setRelease] = useState(null)
  const [file, setFile]       = useState(null)
  const [msg, setMsg]         = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { api.adminGetAppRelease().then(setRelease).catch(() => {}) }, [])

  async function handlePublish(e) {
    e.preventDefault()
    if (!file) return setMsg({ type: 'error', text: 'Selecione o arquivo .apk' })
    setLoading(true)
    setMsg(null)
    try {
      const fd = new FormData()
      fd.append('apk', file)
      const r = await api.adminPublishApp(fd)
      setRelease(r)
      setFile(null)
      e.target.reset()
      setMsg({ type: 'success', text: `Versão ${r.versionName} publicada! As TVs vão se atualizar nas próximas horas (ou pelo menu do app → Procurar atualização).` })
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card" style={{ padding: 24 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>App Android (Interativa Player)</h2>
      <p className="text-sm text-muted" style={{ marginBottom: 16 }}>
        Envie a versão nova do app e todas as TVs se atualizam sozinhas.
      </p>
      <div style={{ padding: '10px 14px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
        {release
          ? <>Versão publicada: <strong>{release.versionName}</strong> (código {release.versionCode}) · {(release.size / 1048576).toFixed(1)} MB · {new Date(release.publishedAt).toLocaleString('pt-BR')}</>
          : <span className="text-muted">Nenhuma versão publicada ainda.</span>}
      </div>
      <form onSubmit={handlePublish} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input type="file" accept=".apk" onChange={e => setFile(e.target.files?.[0] || null)} />
        {msg && (
          <div className={`alert ${msg.type === 'success' ? 'alert-success' : 'alert-error'}`}>
            {msg.text}
          </div>
        )}
        <button className="btn btn-primary" type="submit" disabled={loading} style={{ alignSelf: 'flex-start' }}>
          {loading ? 'Enviando...' : 'Publicar versão'}
        </button>
      </form>
    </div>
  )
}

// Meu perfil: nome de exibição, usuário de login e e-mail (opcional)
function ProfileCard({ user, onProfileUpdated }) {
  const [form, setForm]       = useState({ name: user?.name || '', username: user?.username || '', email: user?.email || '' })
  const [msg, setMsg]         = useState(null)
  const [loading, setLoading] = useState(false)

  // Dados atuais do banco (o login guardado no navegador pode ser de antes da criação do "usuário")
  useEffect(() => {
    api.me().then(u => setForm({ name: u.name || '', username: u.username || '', email: u.email || '' })).catch(() => {})
  }, [])

  async function handleSave(e) {
    e.preventDefault()
    setLoading(true)
    setMsg(null)
    try {
      const { token, user: u } = await api.updateMe(form)
      onProfileUpdated?.(token)
      setForm({ name: u.name || '', username: u.username || '', email: u.email || '' })
      setMsg({ type: 'success', text: `Perfil salvo! Para entrar, use o usuário “${u.username}”${u.email ? ' ou o e-mail' : ''}.` })
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    } finally {
      setLoading(false)
    }
  }

  const label = { display: 'block', marginBottom: 4, fontWeight: 500 }
  return (
    <div className="card" style={{ padding: 24 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Meu perfil</h2>
      <p className="text-sm text-muted" style={{ marginBottom: 20 }}>
        Você entra no painel com o <strong>usuário</strong> (ou o e-mail, se cadastrado) e a senha.
      </p>
      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="text-sm" style={label}>Nome</label>
            <input className="input" value={form.name} required
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="text-sm" style={label}>Usuário (para entrar)</label>
            <input className="input" value={form.username} required placeholder="ex.: ramon"
              onChange={e => setForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') }))} />
          </div>
        </div>
        <div>
          <label className="text-sm" style={label}>E-mail <span className="text-muted">(opcional)</span></label>
          <input className="input" type="email" value={form.email} placeholder="seu@email.com"
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
        </div>
        {msg && <div className={`alert ${msg.type === 'success' ? 'alert-success' : 'alert-error'}`}>{msg.text}</div>}
        <button className="btn btn-primary" type="submit" disabled={loading} style={{ alignSelf: 'flex-start' }}>
          {loading ? 'Salvando...' : 'Salvar perfil'}
        </button>
      </form>
    </div>
  )
}

export default function Settings({ user, onProfileUpdated }) {
  // --- Trocar senha ---
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' })
  const [pwdMsg, setPwdMsg] = useState(null) // { type: 'success'|'error', text }
  const [pwdLoading, setPwdLoading] = useState(false)

  async function handleChangePwd(e) {
    e.preventDefault()
    if (pwd.next !== pwd.confirm) return setPwdMsg({ type: 'error', text: 'As senhas novas não coincidem' })
    if (pwd.next.length < 6) return setPwdMsg({ type: 'error', text: 'A nova senha deve ter no mínimo 6 caracteres' })
    setPwdLoading(true)
    setPwdMsg(null)
    try {
      await api.changePassword(pwd.current, pwd.next)
      setPwdMsg({ type: 'success', text: 'Senha alterada com sucesso!' })
      setPwd({ current: '', next: '', confirm: '' })
    } catch (e) {
      setPwdMsg({ type: 'error', text: e.message })
    } finally {
      setPwdLoading(false)
    }
  }

  // --- Gerenciar usuários ---
  const [users, setUsers] = useState([])
  const [newUser, setNewUser] = useState({ name: '', username: '', email: '', password: '' })
  const [userMsg, setUserMsg] = useState(null)
  const [userLoading, setUserLoading] = useState(false)

  async function loadUsers() {
    try { setUsers(await api.getUsers()) } catch (e) { console.error(e) }
  }

  useEffect(() => { loadUsers() }, [])

  async function handleCreateUser(e) {
    e.preventDefault()
    setUserLoading(true)
    setUserMsg(null)
    try {
      await api.createUser(newUser)
      setUserMsg({ type: 'success', text: `Usuário "${newUser.name}" criado com sucesso!` })
      setNewUser({ name: '', username: '', email: '', password: '' })
      loadUsers()
    } catch (e) {
      setUserMsg({ type: 'error', text: e.message })
    } finally {
      setUserLoading(false)
    }
  }

  async function handleDeleteUser(u) {
    if (!confirm(`Remover o usuário "${u.name}"?`)) return
    try {
      await api.deleteUser(u.id)
      loadUsers()
    } catch (e) { alert(e.message) }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Configurações</h1>
          <p className="page-subtitle">Conta e usuários</p>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 24, maxWidth: 640 }}>

        <ProfileCard user={user} onProfileUpdated={onProfileUpdated} />

        {/* Trocar senha */}
        <div className="card" style={{ padding: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Alterar senha</h2>
          <p className="text-sm text-muted" style={{ marginBottom: 20 }}>
            Logado como <strong>{user?.username ? `@${user.username}` : user?.email}</strong>
          </p>
          <form onSubmit={handleChangePwd} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label className="text-sm" style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Senha atual</label>
              <input className="input" type="password" value={pwd.current}
                onChange={e => setPwd(p => ({ ...p, current: e.target.value }))} required style={{ width: '100%' }} />
            </div>
            <div>
              <label className="text-sm" style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Nova senha</label>
              <input className="input" type="password" value={pwd.next}
                onChange={e => setPwd(p => ({ ...p, next: e.target.value }))} required style={{ width: '100%' }} />
            </div>
            <div>
              <label className="text-sm" style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Confirmar nova senha</label>
              <input className="input" type="password" value={pwd.confirm}
                onChange={e => setPwd(p => ({ ...p, confirm: e.target.value }))} required style={{ width: '100%' }} />
            </div>
            {pwdMsg && (
              <div className={`alert ${pwdMsg.type === 'success' ? 'alert-success' : 'alert-error'}`}>
                {pwdMsg.text}
              </div>
            )}
            <button className="btn btn-primary" type="submit" disabled={pwdLoading} style={{ alignSelf: 'flex-start' }}>
              {pwdLoading ? 'Salvando...' : 'Alterar senha'}
            </button>
          </form>
        </div>

        {user?.role === 'superadmin' && <AppReleaseCard />}

        {/* Gerenciar usuários */}
        <div className="card" style={{ padding: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Usuários</h2>

          {/* Lista */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {users.map(u => (
              <div key={u.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{u.name}</div>
                  <div className="text-sm text-muted">
                    {u.username && <span style={{ fontFamily: 'var(--mono)' }}>@{u.username}</span>}
                    {u.username && u.email && ' · '}
                    {u.email}
                  </div>
                </div>
                <span className="badge badge-blue">{u.role}</span>
                {u.id !== user?.id && (
                  <button className="btn btn-secondary btn-sm" onClick={() => handleDeleteUser(u)}>
                    Remover
                  </button>
                )}
                {u.id === user?.id && (
                  <span className="text-sm text-muted">você</span>
                )}
              </div>
            ))}
            {users.length === 0 && <p className="text-muted text-sm">Nenhum usuário encontrado.</p>}
          </div>

          <div className="divider" />

          {/* Novo usuário */}
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: '16px 0 14px' }}>Adicionar usuário</h3>
          <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="text-sm" style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Nome</label>
                <input className="input" value={newUser.name} required
                  onChange={e => setNewUser(p => ({ ...p, name: e.target.value }))} style={{ width: '100%' }} />
              </div>
              <div>
                <label className="text-sm" style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Usuário (para entrar)</label>
                <input className="input" value={newUser.username} required placeholder="ex.: joao"
                  onChange={e => setNewUser(p => ({ ...p, username: e.target.value.toLowerCase().replace(/\s/g, '') }))} style={{ width: '100%' }} />
              </div>
            </div>
            <div>
              <label className="text-sm" style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>E-mail <span className="text-muted">(opcional)</span></label>
              <input className="input" type="email" value={newUser.email}
                onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))} style={{ width: '100%' }} />
            </div>
            <div>
              <label className="text-sm" style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Senha</label>
              <input className="input" type="password" value={newUser.password} required
                placeholder="Mínimo 6 caracteres"
                onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))} style={{ width: '100%' }} />
            </div>
            {userMsg && (
              <div className={`alert ${userMsg.type === 'success' ? 'alert-success' : 'alert-error'}`}>
                {userMsg.text}
              </div>
            )}
            <button className="btn btn-primary" type="submit" disabled={userLoading} style={{ alignSelf: 'flex-start' }}>
              {userLoading ? 'Criando...' : 'Criar usuário'}
            </button>
          </form>
        </div>

      </div>
    </div>
  )
}
