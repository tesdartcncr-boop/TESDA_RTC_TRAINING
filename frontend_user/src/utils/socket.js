import { io } from 'socket.io-client'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000'

let socket = null
let registeredUserId = null
let lifecycleHandlersBound = false

const getStoredToken = () => localStorage.getItem('trainer_token') || sessionStorage.getItem('trainer_session_token')

const buildAuthPayload = () => {
  const token = getStoredToken()
  return token ? { token } : {}
}

const syncRegisteredUser = () => {
  if (socket?.connected && registeredUserId != null) {
    socket.emit('register_user', { user_id: registeredUserId })
  }
}

const bindLifecycleHandlers = () => {
  if (!socket || lifecycleHandlersBound) return

  socket.on('connect', syncRegisteredUser)
  socket.on('reconnect', syncRegisteredUser)
  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error?.message || error)
  })
  lifecycleHandlersBound = true
}

const applySocketAuth = () => {
  if (socket) {
    socket.auth = buildAuthPayload()
  }
}

export const getSocket = () => {
  if (!socket) {
    socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      auth: buildAuthPayload(),
    })
    bindLifecycleHandlers()
  }

  return socket
}

export const connectSocket = () => {
  try {
    const nextSocket = getSocket()
    applySocketAuth()
    if (!nextSocket.connected) {
      nextSocket.connect()
    }
    return nextSocket
  } catch (error) {
    console.error('Failed to connect socket:', error)
    return null
  }
}

export const disconnectSocket = () => {
  registeredUserId = null
  if (socket) {
    try {
      socket.disconnect()
    } catch (error) {
      console.error('Failed to disconnect socket:', error)
    }
  }
}

export const registerUser = (userId) => {
  try {
    registeredUserId = userId
    const nextSocket = connectSocket()
    syncRegisteredUser()
    return nextSocket
  } catch (error) {
    console.error('Failed to register user with socket:', error)
    return null
  }
}

export default getSocket
