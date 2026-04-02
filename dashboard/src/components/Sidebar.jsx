import React from 'react'
import { NavLink } from 'react-router-dom'

const companyLinks = [
  { to: '/control',         icon: '🎛️',  label: 'Controle ao Vivo' },
  { to: '/screens',         icon: '📺',  label: 'Telas' },
  { to: '/playlist-groups', icon: '📋',  label: 'Grupos de Playlists' },
  { to: '/playlists',       icon: '🎞️',  label: 'Playlists' },
  { to: '/schedules',       icon: '📅',  label: 'Agendamentos' },
  { to: '/library',         icon: '🖼️',  label: 'Biblioteca' },
  { to: '/tickers',         icon: '📰',  label: 'Tickers' },
  { to: '/settings',        icon: '⚙️',  label: 'Configurações' },
]

const superadminLinks = [
  { to: '/companies', icon: '🏢', label: 'Empresas' },
  { to: '/settings',  icon: '⚙️', label: 'Configurações' },
]

export default function Sidebar({ user, onLogout, onExitImpersonation }) {
  const isImpersonating = !!user?.impersonating_company
  const isSuperadminHome = user?.role === 'superadmin' && !isImpersonating

  // Superadmin sem impersonation: só vê Empresas + Configurações
  // Qualquer outro caso (admin normal ou superadmin dentro de uma empresa): vê tudo
  const links = isSuperadminHome ? superadminLinks : companyLinks

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        📺 <span>Interativa</span>
      </div>

      {/* Impersonation banner */}
      {isImpersonating && (
        <div style={{
          margin: '0 12px 8px',
          background: '#fefce8',
          border: '1px solid #fde047',
          borderRadius: 8,
          padding: '8px 12px',
          fontSize: 12,
        }}>
          <div style={{ fontWeight: 600, color: '#713f12', marginBottom: 4 }}>
            Visualizando como:
          </div>
          <div style={{ color: '#854d0e', marginBottom: 8 }}>{user.impersonating_name}</div>
          <button
            className="btn btn-secondary"
            style={{ width: '100%', fontSize: 11 }}
            onClick={onExitImpersonation}
          >
            ← Voltar ao painel admin
          </button>
        </div>
      )}

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
