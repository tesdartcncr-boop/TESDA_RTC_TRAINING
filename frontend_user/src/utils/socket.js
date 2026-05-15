import { io } from 'socket.io-client'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000'

let socket = null

export const getSocket = () => {
  if (!socket) {
    try {
      socket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      })
    } catch (error) {
      console.error('Failed to create socket:', error)
      return null
    }
  }
  return socket
}

export const connectSocket = () => {
  try {
    const s = getSocket()
    if (s && !s.connected) {
      s.connect()
    }
    return s
  } catch (error) {
    console.error('Failed to connect socket:', error)
    return null
  }
}

export const disconnectSocket = () => {
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
    const s = getSocket()
    if (s && userId) {
      if (s.connected) {
        s.emit('register_user', { user_id: userId })
      } else {
        s.once('connect', () => {
          s.emit('register_user', { user_id: userId })
        })
      }
    }
  } catch (error) {
    console.error('Failed to register user with socket:', error)
  }
}

export default getSocket
