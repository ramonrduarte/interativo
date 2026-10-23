import { io } from 'socket.io-client'

// Conexão ao vivo do painel: usa o mesmo login da API (lido a cada conexão)
const socket = io({
  autoConnect: false,
  auth: cb => cb({ token: localStorage.getItem('auth_token') || '' }),
})

/** Reconecta com o login atual (após entrar, sair ou acessar outra empresa). */
export function reconnectSocket() {
  socket.disconnect()
  if (localStorage.getItem('auth_token')) socket.connect()
}

export default socket
