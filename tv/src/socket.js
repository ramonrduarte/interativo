import { io } from 'socket.io-client'
import { useTvStore } from './store.js'

let socket = null

export function connectSocket() {
  const { token, setConfig, setConnected } = useTvStore.getState()
  if (!token) return

  if (socket) { socket.disconnect() }

  socket = io({ query: { token }, reconnection: true, reconnectionDelay: 2000, reconnectionDelayMax: 10000 })

  socket.on('connect', () => {
    setConnected(true)
    socket.emit('tv:register', { token })
  })

  socket.on('disconnect', () => setConnected(false))

  socket.on('config:update', config => setConfig(config))

  // Tela excluída no painel: esquece o token e volta para o pareamento
  socket.on('screen:removed', () => {
    try {
      localStorage.removeItem('interativa_token')
      localStorage.removeItem('interativa_config')
    } catch {}
    const url = new URL(window.location.href)
    url.searchParams.delete('token')
    window.location.replace(url.toString())
  })

  setInterval(() => {
    if (socket?.connected) socket.emit('tv:heartbeat', { token })
  }, 30000)

  return socket
}

// Pairing mode — connects with a short code, waits for server to send the real token
export function connectPairing(code, companyToken, onSuccess, onError) {
  if (socket) { socket.disconnect() }

  const query = { pairing: code }
  if (companyToken) query.c = companyToken
  socket = io({ query, reconnection: false })

  socket.on('pairing:success', ({ token }) => {
    socket.disconnect()
    onSuccess(token)
  })

  // Servidor recusa pareamento sem o código da empresa (ou com código inválido)
  socket.on('pairing:error', ({ message }) => onError?.(message))

  return socket
}
