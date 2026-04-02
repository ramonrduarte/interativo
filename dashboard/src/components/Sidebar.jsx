import React from 'react'
import { NavLink } from 'react-router-dom'

const links = [
  { to: '/control',   icon: '🎛️',  label: 'Controle ao Vivo' },
  { to: '/screens',   icon: '📺',  label: 'Telas' },
  { to: '/playlists', icon: '🎞️',  label: 'Playlists' },
  { to: '/schedules', icon: '📅',  label: 'Agendamentos' },
  { to: '/library',   icon: '🖼️',  label: 'Biblioteca' },
  { to: '/tickers',   icon: '📰',  label: 'Tickers' },
  { to: '/settings',  icon: '⚙️',  label: 'Configurações' },
]

export default function Sidebar({ user, onLogout }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        📺 <span>Interativa</span>
      </div>
      <nav className="sidebar-nav">
        {links.map(l => (
          <NavLink
            key={l.to}
            to={l.to}
            className={({ isActive }) => 'sidebar-link' + (isActive ? ' active' : '')}
          >
            <span>{l.icon}</span>
            {l.label}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer" style={{ padding: '12px 16px' }}>
        {user && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.name}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.email}
            </div>
          </div>
        )}
        <button
          className="btn btn-secondary"
          style={{ width: '100%', fontSize: 12 }}
          onClick={onLogout}
        >
          Sair
        </button>
      </div>
    </aside>
  )
}
