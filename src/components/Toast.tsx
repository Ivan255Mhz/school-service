import { useEffect, useState } from 'react'

export interface Toast {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
}

let toastListener: ((toast: Toast) => void) | null = null

export function showToast(type: Toast['type'], message: string) {
  const toast: Toast = { id: crypto.randomUUID(), type, message }
  toastListener?.(toast)
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    toastListener = (toast) => {
      setToasts(prev => [...prev, toast])
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== toast.id))
      }, 3000)
    }
    return () => { toastListener = null }
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span className="toast-icon">
            {t.type === 'success' && '✓'}
            {t.type === 'error' && '✕'}
            {t.type === 'info' && 'ℹ'}
          </span>
          {t.message}
        </div>
      ))}
    </div>
  )
}
