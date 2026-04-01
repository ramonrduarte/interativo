import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar.jsx'
import Library from './pages/Library.jsx'
import Playlists from './pages/Playlists.jsx'
import Screens from './pages/Screens.jsx'
import Tickers from './pages/Tickers.jsx'
import Control from './pages/Control.jsx'
import Schedules from './pages/Schedules.jsx'

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
  return (
    <div className="app-shell">
      <Sidebar />
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
