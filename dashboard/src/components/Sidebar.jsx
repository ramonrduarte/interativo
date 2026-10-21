import React from 'react'
import { NavLink } from 'react-router-dom'
import {
  Radio, Monitor, Layers, ListVideo, CalendarClock, Images, Newspaper, Settings,
  Building2, LogOut, Moon, Sun, Tv, ArrowLeft,
} from 'lucide-react'
import { useTheme } from '../theme.js'

const companySections = [
  { title: 'Operação', links: [
    { to: '/control',         icon: Radio,         label: 'Controle ao Vivo' },
    { to: '/screens',         icon: Monitor,       label: 'Telas' },
    { to: '/schedules',       icon: CalendarClock, label: 'Agendamentos' },
  ] },
  { title: 'Conteúdo', links: [
    { to: '/playlists',       icon: ListVideo,     label: 'Playlists' },
    { to: '/playlist-groups', icon: Layers,        label: 'Grupos de Playlists' },
    { to: '/library',         icon: Images,        label: 'Biblioteca' },
    { to: '/tickers',         icon: Newspaper,     label: 'Tickers' },
  ] },
  { title: 'Sistema', links: [
    { to: '/settings',        icon: Settings,      label: 'Configurações' },
  ] },
]

const superadminSections = [
  { title: 'Administração', links: [
    { to: '/companies', icon: Building2, label: 'Empresas' },
    { to: '/settings',  icon: Settings,  label: 'Configurações' },
  ] },
]

function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?'
}

export default function Sidebar({ user, onLogout, onExitImpersonation }) {
  const [theme, toggleTheme] = useTheme()
  const isImpersonating = !!user?.impersonating_company
  const isSuperadminHome = user?.role === 'superadmin' && !isImpersonating

  // Superadmin sem impersonation: só vê Empresas + Configurações
  // Qualquer outro caso (admin normal ou superadmin dentro de uma empresa): vê tudo
  const sections = isSuperadminHome ? superadminSections : companySections

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-mark"><Tv size={17} strokeWidth={2.2} /></div>
        <div>
          Interativa
          <small>Sinalização digital</small>
        </div>
      </div>

      {isImpersonating && (
        <div className="impersonation-box">
          <div style={{ fontWeight: 650, marginBottom: 2 }}>Visualizando como</div>
          <div style={{ marginBottom: 8 }}>{user.impersonating_name}</div>
          <button className="btn btn-secondary btn-sm" style={{ width: '100%' }} onClick={onExitImpersonation}>
            <ArrowLeft size={14} /> Voltar ao painel admin
          </button>
        </div>
      )}

      <nav className="sidebar-nav">
        {sections.map(s => (
          <React.Fragment key={s.title}>
            <div className="sidebar-section">{s.title}</div>
            {s.links.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => 'sidebar-link' + (isActive ? ' active' : '')}
              >
                <Icon size={17} strokeWidth={1.9} />
                {label}
              </NavLink>
            ))}
          </React.Fragment>
        ))}
      </nav>

      <div className="sidebar-footer">
        {user && (
          <div className="sidebar-user">
            <div className="sidebar-avatar">{initials(user.name)}</div>
            <div style={{ minWidth: 0 }}>
              <div className="sidebar-user-name">{user.name}</div>
              <div className="sidebar-user-email">{user.username ? `@${user.username}` : user.email}</div>
            </div>
          </div>
        )}
        <div className="sidebar-actions">
          <button
            className="btn btn-secondary btn-sm"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            {theme === 'dark' ? 'Claro' : 'Escuro'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={onLogout}>
            <LogOut size={14} /> Sair
          </button>
        </div>
      </div>
    </aside>
  )
}
