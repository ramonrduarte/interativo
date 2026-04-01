import React, { useEffect, useState, useRef } from 'react'
import { useTvStore } from './store.js'
import { connectSocket, connectPairing } from './socket.js'
import LayoutEngine from './components/LayoutEngine.jsx'

// Generate a random 6-char uppercase alphanumeric code
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/I/1 to avoid confusion
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

function PairingScreen() {
  const { setToken } = useTvStore()
  const [code] = useState(() => generateCode())
  const [status, setStatus] = useState('waiting') // waiting | success
  const socketRef = useRef(null)

  useEffect(() => {
    socketRef.current = connectPairing(code, token => {
      setStatus('success')
      setToken(token)
      // Small delay so user sees the success message, then reload to connect normally
      setTimeout(() => { window.location.reload() }, 1500)
    })
    return () => socketRef.current?.disconnect()
  }, [])

  return (
    <div style={{
      width: '100vw', height: '100vh', background: '#0a0c10',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontFamily: 'system-ui, sans-serif', gap: 32,
    }}>
      <div style={{ fontSize: 22, color: '#888', fontWeight: 500, letterSpacing: 1 }}>
        📺 Interativa TV
      </div>

      {status === 'waiting' ? (
        <>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 15, color: '#666', marginBottom: 20 }}>
              Para vincular esta tela, acesse o Dashboard e clique em{' '}
              <span style={{ color: '#2d6ef5', fontWeight: 700 }}>Parear TV</span>
            </div>
            <div style={{ fontSize: 14, color: '#555', marginBottom: 28 }}>
              Digite o código abaixo:
            </div>

            {/* Big code display */}
            <div style={{
              display: 'flex', gap: 10, justifyContent: 'center',
            }}>
              {code.split('').map((char, i) => (
                <div key={i} style={{
                  width: 72, height: 88, background: '#111827',
                  border: '2px solid #2d6ef5', borderRadius: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 48, fontWeight: 900, color: '#fff', fontFamily: 'monospace',
                  boxShadow: '0 0 20px rgba(45,110,245,.25)',
                }}>
                  {char}
                </div>
              ))}
            </div>

            <div style={{ marginTop: 28, fontSize: 13, color: '#444' }}>
              O código expira quando esta página for fechada
            </div>
          </div>

          {/* Pulsing indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#555', fontSize: 13 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%', background: '#2d6ef5',
              animation: 'pulse 1.5s ease-in-out infinite',
            }} />
            Aguardando pareamento…
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>✓</div>
          <div style={{ fontSize: 22, color: '#22c55e', fontWeight: 700 }}>Pareado com sucesso!</div>
          <div style={{ fontSize: 14, color: '#555', marginTop: 8 }}>Carregando conteúdo…</div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
      `}</style>
    </div>
  )
}

export default function App() {
  const { config, connected, token, setToken } = useTvStore()

  useEffect(() => {
    const urlToken = new URLSearchParams(window.location.search).get('token')
    if (urlToken) setToken(urlToken)
  }, [])

  useEffect(() => {
    if (token) connectSocket()
  }, [token])

  // No token — show pairing screen
  if (!token) {
    return <PairingScreen />
  }

  // Has token but not yet connected and no cached config
  if (!connected && !config) {
    return (
      <div className="offline-screen">
        <div className="reconnect-spinner" />
        <h2>Conectando...</h2>
        <p>Aguardando conexão com o servidor Interativa</p>
      </div>
    )
  }

  // Has config (even if temporarily disconnected)
  if (config) {
    return (
      <>
        <LayoutEngine config={config} />
        {!connected && (
          <div style={{
            position: 'fixed', top: 12, right: 12, background: 'rgba(0,0,0,.7)',
            color: '#f6a623', padding: '6px 12px', borderRadius: 6, fontSize: 13, zIndex: 999,
          }}>
            ⚠ Reconectando...
          </div>
        )}
      </>
    )
  }

  return (
    <div className="offline-screen">
      <div className="reconnect-spinner" />
      <h2>Aguardando conteúdo</h2>
      <p>Conectado. Aguardando configuração do servidor.</p>
    </div>
  )
}
