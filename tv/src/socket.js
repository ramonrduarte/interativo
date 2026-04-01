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

  setInterval(() => {
    if (socket?.connected) socket.emit('tv:heartbeat', { token })
  }, 30000)

  return socket
}

// Pairing mode — connects with a short code, waits for server to send the real token
export function connectPairing(code, onSuccess) {
  if (socket) { socket.disconnect() }

  socket = io({ query: { pairing: code }, reconnection: false })

  socket.on('pairing:success', ({ token }) => {
    socket.disconnect()
    onSuccess(token)
  })

  return socket
}
