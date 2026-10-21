import React, { useState } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import Sidebar from './components/Sidebar.jsx'
import Library from './pages/Library.jsx'
import Playlists from './pages/Playlists.jsx'
import Screens from './pages/Screens.jsx'
import Tickers from './pages/Tickers.jsx'
import Control from './pages/Control.jsx'
import Schedules from './pages/Schedules.jsx'
import Login from './pages/Login.jsx'
import Settings from './pages/Settings.jsx'
import Companies from './pages/Companies.jsx'
import PlaylistGroups from './pages/PlaylistGroups.jsx'

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (this.state.error) return (
      <div style={{ padding: 40, color: 'var(--danger-text)' }}>
        <h2>Erro na página</h2>
        <pre className="alert alert-error" style={{ marginTop: 12, fontSize: 12, whiteSpace: 'pre-wrap' }}>
          {this.state.error.message}
        </pre>
        <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={() => this.setState({ error: null })}>
          Tentar novamente
        </button>
      </div>
    )
    return this.props.children
  }
}

export default function App() {
  function decodeUser(token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      if (payload.exp && payload.exp * 1000 < Date.now()) return null
      return {
        id:                    payload.id,
        name:                  payload.name,
        email:                 payload.email,
        role:                  payload.role,
        company_id:            payload.company_id,
        impersonating_company: payload.impersonating_company || null,
        impersonating_name:    payload.impersonating_name    || null,
      }
    } catch { return null }
  }

  const [user, setUser] = useState(() => {
    const token = localStorage.getItem('auth_token')
    if (!token) return null
    const u = decodeUser(token)
    if (!u) { localStorage.removeItem('auth_token'); return null }
    return u
  })

  // Token real do administrador principal, guardado enquanto ele acessa uma empresa.
  // Fica no localStorage (e não só na memória) para o "Voltar ao painel admin"
  // continuar funcionando depois de recarregar a página.
  const ADMIN_TOKEN_KEY = 'auth_token_admin'
  const navigate = useNavigate()

  function handleLogin(userData) {
    localStorage.removeItem(ADMIN_TOKEN_KEY)
    setUser(userData)
  }

  function handleLogout() {
    localStorage.removeItem('auth_token')
    localStorage.removeItem(ADMIN_TOKEN_KEY)
    setUser(null)
  }

  function handleImpersonate(token) {
    // Guarda o token real antes de trocar (sem sobrescrever se já estiver acessando outra empresa)
    if (!localStorage.getItem(ADMIN_TOKEN_KEY)) {
      localStorage.setItem(ADMIN_TOKEN_KEY, localStorage.getItem('auth_token'))
    }
    localStorage.setItem('auth_token', token)
    setUser(decodeUser(token))
    navigate('/control')
  }

  function handleExitImpersonation() {
    const realToken = localStorage.getItem(ADMIN_TOKEN_KEY)
    const admin = realToken && decodeUser(realToken)
    localStorage.removeItem(ADMIN_TOKEN_KEY)
    if (!admin) {
      // Sessão do administrador expirou: pede login de novo
      handleLogout()
      return
    }
    localStorage.setItem('auth_token', realToken)
    setUser(admin)
    navigate('/companies')
  }

  if (!user) {
    return <Login onLogin={handleLogin} />
  }

  return (
    <div className="app-shell">
      <Sidebar user={user} onLogout={handleLogout} onExitImpersonation={handleExitImpersonation} />
      <main className="main-content">
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={
              <Navigate to={user?.role === 'superadmin' && !user?.impersonating_company ? '/companies' : '/control'} replace />
            } />
            <Route path="/control" element={<Control />} />
            <Route path="/screens" element={<Screens />} />
            <Route path="/playlists" element={<Playlists />} />
            <Route path="/library" element={<Library />} />
            <Route path="/tickers" element={<Tickers />} />
            <Route path="/schedules" element={<Schedules />} />
            <Route path="/settings" element={<Settings user={user} />} />
            <Route path="/companies" element={<Companies onImpersonate={handleImpersonate} />} />
            <Route path="/playlist-groups" element={<PlaylistGroups />} />
          </Routes>
        </ErrorBoundary>
      </main>
    </div>
  )
}
