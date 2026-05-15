import React, { useEffect } from 'react'
import PropTypes from 'prop-types'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export default function ModalShell({ title, onClose, children, maxWidth = 'max-w-2xl' }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  useEffect(() => {
    const previousHtmlOverflow = document.documentElement.style.overflow
    const previousBodyOverflow = document.body.style.overflow

    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow
      document.body.style.overflow = previousBodyOverflow
    }
  }, [])

  if (typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div className="fixed left-0 top-0 z-[1000] flex h-[100dvh] w-screen items-center justify-center overflow-y-auto bg-slate-950/75 p-4 backdrop-blur-sm sm:p-6">
      <button type="button" className="absolute inset-0" onClick={onClose} aria-label="Close modal overlay" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative z-10 my-auto w-full ${maxWidth} overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.35)]`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <h3 className="text-xl font-bold text-slate-900">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[calc(100dvh-8rem)] overflow-y-auto p-6">{children}</div>
      </div>
    </div>,
    document.body
  )
}

ModalShell.propTypes = {
  title: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  children: PropTypes.node.isRequired,
  maxWidth: PropTypes.string,
}
