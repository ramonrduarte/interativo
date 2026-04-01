import { io } from 'socket.io-client'

const socket = io({ query: { token: 'dashboard' } })

export default socket
