import React from 'react'
import { NavLink } from 'react-router-dom'

const links = [
  { to: '/control',   icon: '🎛️',  label: 'Controle ao Vivo' },
  { to: '/screens',   icon: '📺',  label: 'Telas' },
  { to: '/playlists', icon: '🎞️',  label: 'Playlists' },
  { to: '/schedules', icon: '📅',  label: 'Agendamentos' },
  { to: '/library',   icon: '🖼️',  label: 'Biblioteca' },
  { to: '/tickers',   icon: '📰',  label: 'Tickers' },
]

export default function Sidebar() {
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
      <div className="sidebar-footer">
        Interativa v1.0
      </div>
    </aside>
  )
}
