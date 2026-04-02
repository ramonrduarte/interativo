import React, { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
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
      <div style={{ padding: 40, color: '#e53e3e' }}>
        <h2>Erro na página</h2>
        <pre style={{ marginTop: 12, fontSize: 12, background: '#fff5f5', padding: 12, borderRadius: 6 }}>
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

  // Real (superadmin) token stored separately during impersonation
  const [realToken, setRealToken] = useState(null)

  function handleLogin(userData) {
    setUser(userData)
  }

  function handleLogout() {
    localStorage.removeItem('auth_token')
    setRealToken(null)
    setUser(null)
  }

  function handleImpersonate(token) {
    // Save real token before switching
    setRealToken(localStorage.getItem('auth_token'))
    localStorage.setItem('auth_token', token)
    setUser(decodeUser(token))
  }

  function handleExitImpersonation() {
    if (!realToken) return
    localStorage.setItem('auth_token', realToken)
    setUser(decodeUser(realToken))
    setRealToken(null)
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
            <Route path="/" element={<Navigate to="/control" replace />} />
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
