import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

const ADMIN_PASSWORD = 'admin'

export function LoginScreen() {
  const [mode, setMode] = useState<'student' | 'teacher' | 'admin'>('student')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const trimmedCode = code.trim().toUpperCase()

      const { data: studentProfile } = await supabase
        .from('profiles')
        .select('*, groups(*)')
        .eq('invite_code', trimmedCode)
        .eq('role', 'student')
        .maybeSingle()

      if (studentProfile) {
        await supabase.auth.signInAnonymously()

        const group = studentProfile.groups as any
        localStorage.setItem('user_role', 'student')
        localStorage.setItem('group_id', studentProfile.group_id)
        localStorage.setItem('group_name', group?.name || '')
        localStorage.setItem('student_name', studentProfile.name)
        localStorage.setItem('student_id', studentProfile.id)
        navigate('/student')
        return
      }

      const { data: group } = await supabase
        .from('groups')
        .select('*')
        .eq('invite_code', trimmedCode)
        .maybeSingle()

      if (!group) {
        setError('Код не найден. Проверьте код.')
        setLoading(false)
        return
      }

      await supabase.auth.signInAnonymously()

      const newId = crypto.randomUUID()

      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: newId,
          name: 'Ученик',
          full_name: 'Ученик',
          role: 'student',
          group_id: group.id,
        })

      if (profileError) {
        setError('Ошибка создания профиля')
        setLoading(false)
        return
      }

      localStorage.setItem('user_role', 'student')
      localStorage.setItem('group_id', group.id)
      localStorage.setItem('group_name', group.name)
      localStorage.setItem('student_name', 'Ученик')
      localStorage.setItem('student_id', newId)
      navigate('/student')
    } catch {
      setError('Произошла ошибка')
    } finally {
      setLoading(false)
    }
  }

  const handleTeacherLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { data: teacher } = await supabase
        .from('profiles')
        .select('*')
        .eq('login_code', code.trim().toUpperCase())
        .eq('role', 'teacher')
        .maybeSingle()

      if (!teacher) {
        setError('Преподаватель не найден. Проверьте код.')
        setLoading(false)
        return
      }

      await supabase.auth.signInAnonymously()

      localStorage.setItem('user_role', 'teacher')
      localStorage.setItem('teacher_id', teacher.id)
      localStorage.setItem('login_code', code.trim().toUpperCase())
      navigate('/teacher')
    } catch {
      setError('Произошла ошибка')
    } finally {
      setLoading(false)
    }
  }

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== ADMIN_PASSWORD) {
      setError('Неверный пароль')
      return
    }

    setLoading(true)

    try {
      const { data: authData, error: authError } = await supabase.auth.signInAnonymously()

      if (authError || !authData.user) {
        setError('Ошибка авторизации')
        setLoading(false)
        return
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: authData.user.id,
          name: 'Администратор',
          role: 'admin',
        })

      if (profileError) {
        setError('Ошибка создания профиля')
        setLoading(false)
        return
      }

      localStorage.setItem('user_role', 'admin')
      navigate('/admin')
    } catch {
      setError('Произошла ошибка')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-logo">
          <div className="logo-icon">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <rect width="40" height="40" rx="12" fill="#3b82f6"/>
              <path d="M12 20C12 15.58 15.58 12 20 12C24.42 12 28 15.58 28 20" stroke="#fff" strokeWidth="3" strokeLinecap="round"/>
              <circle cx="20" cy="20" r="3" fill="#fff"/>
              <path d="M14 26L12 28L14 30" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M26 26L28 28L26 30" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1>Speak</h1>
          <p className="login-subtitle">м. Купчино</p>
        </div>

        <div className="login-tabs">
          <button
            className={`login-tab ${mode === 'student' ? 'active' : ''}`}
            onClick={() => { setMode('student'); setError(''); setCode(''); setPassword(''); }}
          >
            Ученик
          </button>
          <button
            className={`login-tab ${mode === 'teacher' ? 'active' : ''}`}
            onClick={() => { setMode('teacher'); setError(''); setCode(''); setPassword(''); }}
          >
            Преподаватель
          </button>
          <button
            className={`login-tab ${mode === 'admin' ? 'active' : ''}`}
            onClick={() => { setMode('admin'); setError(''); setCode(''); setPassword(''); }}
          >
            Админ
          </button>
        </div>

        {mode === 'student' && (
          <form onSubmit={handleStudentLogin} className="login-form">
            <div className="form-group">
              <label htmlFor="code">Код</label>
              <input
                id="code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="STU-XXXXXX или GRPXXXXXX"
                className="input"
                required
              />
              <span className="form-hint">Личный код ученика или код группы</span>
            </div>

            {error && <div className="error-message">{error}</div>}

            <button type="submit" className="btn btn-primary btn-full" disabled={loading || !code}>
              {loading ? 'Вход...' : 'Войти'}
            </button>
          </form>
        )}

        {mode === 'teacher' && (
          <form onSubmit={handleTeacherLogin} className="login-form">
            <div className="form-group">
              <label htmlFor="teacher-code">Код преподавателя</label>
              <input
                id="teacher-code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="TCH-XXXXXX"
                className="input"
                required
              />
            </div>

            {error && <div className="error-message">{error}</div>}

            <button type="submit" className="btn btn-primary btn-full" disabled={loading || !code}>
              {loading ? 'Вход...' : 'Войти'}
            </button>
          </form>
        )}

        {mode === 'admin' && (
          <form onSubmit={handleAdminLogin} className="login-form">
            <div className="form-group">
              <label htmlFor="admin-password">Пароль</label>
              <input
                id="admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Введите пароль"
                className="input"
                required
              />
            </div>

            {error && <div className="error-message">{error}</div>}

            <button type="submit" className="btn btn-primary btn-full" disabled={loading || !password}>
              {loading ? 'Вход...' : 'Войти'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
