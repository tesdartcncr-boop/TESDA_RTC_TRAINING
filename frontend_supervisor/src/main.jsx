import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4500,
          style: {
            borderRadius: '16px',
            padding: '12px 14px',
            maxWidth: '420px',
          },
          error: {
            duration: 5500,
          },
        }}
      />
    </BrowserRouter>
  </React.StrictMode>,
)
