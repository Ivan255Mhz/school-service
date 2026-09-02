import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

const ADMIN_PASSWORD = 'admin'

export function LoginScreen() {
  const [mode, setMode] = useState<'student' | 'teacher' | 'admin'>('student')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { data: group, error: groupError } = await supabase
        .from('groups')
        .select('*')
        .eq('invite_code', code.trim().toUpperCase())
        .single()

      if (groupError || !group) {
        setError('Группа не найдена. Проверьте код.')
        setLoading(false)
        return
      }

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
          name: name.trim() || 'Ученик',
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
      localStorage.setItem('student_name', name.trim() || 'Ученик')
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
      const { data: teacher, error: teacherError } = await supabase
        .from('profiles')
        .select('*')
        .eq('login_code', code.trim().toUpperCase())
        .eq('role', 'teacher')
        .single()

      if (teacherError || !teacher) {
        setError('Преподаватель не найден. Проверьте код.')
        setLoading(false)
        return
      }

      const { data: authData, error: authError } = await supabase.auth.signInAnonymously()

      if (authError || !authData.user) {
        setError('Ошибка авторизации')
        setLoading(false)
        return
      }

      await supabase
        .from('profiles')
        .update({ id: authData.user.id })
        .eq('login_code', code.trim().toUpperCase())

      localStorage.setItem('user_role', 'teacher')
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
          <div className="logo-mark">C#</div>
          <h1>Курс C#</h1>
          <p className="login-subtitle">Интерактивные уроки</p>
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
              <label htmlFor="name">Ваше имя</label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Введите имя"
                className="input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="code">Код группы</label>
              <input
                id="code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="GRP123456"
                className="input"
                required
              />
            </div>

            {error && <div className="error-message">{error}</div>}

            <button type="submit" className="btn btn-primary" disabled={loading || !code}>
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

            <button type="submit" className="btn btn-primary" disabled={loading || !code}>
              {loading ? 'Вход...' : 'Войти'}
            </button>
          </form>
        )}

        {mode === 'admin' && (
          <form onSubmit={handleAdminLogin} className="login-form">
            <div className="form-group">
              <label htmlFor="admin-password">Пароль администратора</label>
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

            <button type="submit" className="btn btn-primary" disabled={loading || !password}>
              {loading ? 'Вход...' : 'Войти'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
