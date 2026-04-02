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
  const [user, setUser] = useState(() => {
    const token = localStorage.getItem('auth_token')
    if (!token) return null
    try {
      // Decode payload from JWT (no signature verification — server will verify on each request)
      const payload = JSON.parse(atob(token.split('.')[1]))
      // Check expiry
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        localStorage.removeItem('auth_token')
        return null
      }
      return { id: payload.id, name: payload.name, email: payload.email, role: payload.role, company_id: payload.company_id }
    } catch {
      localStorage.removeItem('auth_token')
      return null
    }
  })

  function handleLogin(userData) {
    setUser(userData)
  }

  function handleLogout() {
    localStorage.removeItem('auth_token')
    setUser(null)
  }

  if (!user) {
    return <Login onLogin={handleLogin} />
  }

  return (
    <div className="app-shell">
      <Sidebar user={user} onLogout={handleLogout} />
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
          </Routes>
        </ErrorBoundary>
      </main>
    </div>
  )
}
