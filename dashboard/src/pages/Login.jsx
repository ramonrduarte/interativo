import React, { useState } from 'react'
import { Tv, Moon, Sun, LogIn } from 'lucide-react'
import { api } from '../api.js'
import { useTheme } from '../theme.js'

export default function Login({ onLogin }) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [theme, toggleTheme]    = useTheme()

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { token, user } = await api.login(email, password)
      localStorage.setItem('auth_token', token)
      onLogin(user)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      background: 'radial-gradient(1200px 600px at 50% -10%, var(--accent-soft), transparent 70%), var(--bg)',
    }}>
      <button className="btn btn-ghost btn-sm" onClick={toggleTheme} style={{ position: 'fixed', top: 16, right: 16 }}>
        {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        {theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
      </button>

      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div className="sidebar-logo-mark" style={{ width: 48, height: 48, borderRadius: 14, margin: '0 auto 14px' }}>
            <Tv size={24} strokeWidth={2.2} />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.02em' }}>Interativa</h1>
          <p className="text-muted" style={{ marginTop: 4 }}>Entre para gerenciar suas TVs</p>
        </div>

        <div className="card" style={{ padding: 28, boxShadow: 'var(--shadow-lg)' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="form-label">Usuário ou e-mail</label>
              <input
                type="text"
                className="input"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                autoComplete="username"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="form-label">Senha</label>
              <input
                type="password"
                className="input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            <button type="submit" className="btn btn-primary" disabled={loading} style={{ marginTop: 4, padding: '10px 14px' }}>
              {loading ? <><span className="spinner" /> Entrando…</> : <><LogIn size={16} /> Entrar</>}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
