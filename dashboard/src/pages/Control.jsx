import React, { useEffect, useState } from 'react'
import { api } from '../api.js'
import socket from '../socket.js'

export default function Control() {
  const [screens, setScreens] = useState([])
  const [statuses, setStatuses] = useState({}) // token -> { online, lastSeen }
  const [pushing, setPushing] = useState({})

  async function load() {
    try { setScreens(await api.getScreens()) } catch (e) { console.error(e) }
  }

  useEffect(() => {
    load()

    socket.on('screen:status', ({ token, online, lastSeen }) => {
      setStatuses(prev => ({ ...prev, [token]: { online, lastSeen } }))
    })

    return () => socket.off('screen:status')
  }, [])

  async function handlePush(screen) {
    setPushing(p => ({ ...p, [screen.id]: true }))
    try { await api.pushScreen(screen.id) } catch (e) { alert('Erro: ' + e.message) }
    finally { setPushing(p => ({ ...p, [screen.id]: false })) }
  }

  function getTvUrl(token) {
    const { protocol, hostname, port } = window.location
    // Em dev (porta 5173) aponta para o servidor Vite da TV na 5174
    // Em produção aponta para /tv/ na mesma porta do servidor
    if (port === '5173') {
      return `${protocol}//${hostname}:5174?token=${token}`
    }
    return `${protocol}//${window.location.host}/tv/?token=${token}`
  }

  const merged = screens.map(s => ({
    ...s,
    online: statuses[s.token]?.online ?? s.online ?? false,
    lastSeen: statuses[s.token]?.lastSeen,
  }))

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Controle ao Vivo</h1>
          <p className="page-subtitle">Gerencie e empurre conteúdo para suas TVs em tempo real</p>
        </div>
        <button className="btn btn-secondary" onClick={load}>↻ Atualizar</button>
      </div>

      {merged.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📺</div>
          <p className="empty-state-text">Nenhuma tela cadastrada.</p>
          <p className="text-muted text-sm mt-2">Vá em <strong>Telas</strong> para adicionar sua primeira TV.</p>
        </div>
      ) : (
        <div className="control-grid">
          {merged.map(screen => (
            <div key={screen.id} className="card control-card">
              <div className="control-card-header">
                <div className={`screen-status-dot ${screen.online ? 'online' : 'offline'}`} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{screen.name}</div>
                  <div className="text-sm text-muted">
                    {screen.online ? 'Online' : 'Offline'}
                    {screen.lastSeen && !screen.online && ` · visto ${new Date(screen.lastSeen).toLocaleTimeString('pt-BR')}`}
                  </div>
                </div>
                <span className={`badge ${screen.online ? 'badge-success' : 'badge-gray'}`}>
                  {screen.online ? '● Conectado' : '○ Desconectado'}
                </span>
              </div>

              <div className="control-card-body">
                <div style={{ display: 'grid', gap: '8px' }}>
                  <div className="flex gap-2 items-center">
                    <span className="text-muted text-sm" style={{ width: 80 }}>Layout:</span>
                    <span className="badge badge-blue">{screen.layout_name || '—'}</span>
                  </div>
                  <div className="flex gap-2 items-center">
                    <span className="text-muted text-sm" style={{ width: 80 }}>Playlist:</span>
                    <span>{screen.playlist_name || <span className="text-muted">Nenhuma</span>}</span>
                  </div>
                  <div className="flex gap-2 items-center">
                    <span className="text-muted text-sm" style={{ width: 80 }}>Ticker:</span>
                    <span>{screen.ticker_name || <span className="text-muted">Nenhum</span>}</span>
                  </div>
                </div>

                <div className="divider" />

                <div>
                  <p className="text-sm text-muted" style={{ marginBottom: 4 }}>URL para abrir na TV:</p>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <code style={{ fontSize: 11, background: '#f4f5f7', padding: '4px 8px', borderRadius: 4, flex: 1, wordBreak: 'break-all' }}>
                      {getTvUrl(screen.token)}
                    </code>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => navigator.clipboard.writeText(getTvUrl(screen.token))}
                    >
                      Copiar
                    </button>
                  </div>
                </div>
              </div>

              <div className="control-card-footer">
                <button
                  className="btn btn-primary"
                  onClick={() => handlePush(screen)}
                  disabled={pushing[screen.id]}
                  style={{ flex: 1 }}
                >
                  {pushing[screen.id] ? <><span className="spinner" /> Enviando...</> : '📡 Enviar para TV'}
                </button>
                <a
                  href={getTvUrl(screen.token)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary"
                >
                  👁 Preview
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
