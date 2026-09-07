import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { AdminDashboard } from './AdminDashboard'

export function AdminGate() {
  const [authorized, setAuthorized] = useState(localStorage.getItem('user_role') === 'admin')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { data: admin } = await supabase
        .from('profiles')
        .select('*')
        .eq('login_code', code.trim().toUpperCase())
        .eq('role', 'admin')
        .maybeSingle()

      if (!admin) {
        setError('Неверный код доступа')
        setLoading(false)
        return
      }

      await supabase.auth.signInAnonymously()

      localStorage.setItem('user_role', 'admin')
      localStorage.setItem('admin_id', admin.id)
      setAuthorized(true)
    } catch {
      setError('Произошла ошибка')
    } finally {
      setLoading(false)
    }
  }

  if (authorized) {
    return <AdminDashboard />
  }

  return (
    <div className="login-container">
      <div className="login-card admin-gate-card">
        <div className="admin-gate-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
        </div>
        <h1 className="admin-gate-title">Вход для администратора</h1>
        <p className="admin-gate-subtitle">Введите код доступа</p>

        <form onSubmit={handleAdminLogin} className="login-form">
          <div className="form-group">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ADM-XXXXXX"
              className="input"
              required
              autoFocus
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="btn btn-primary btn-full" disabled={loading || !code}>
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  )
}
