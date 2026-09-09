import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { startOAuth, exchangeOAuthToken } from '../lib/oauth'
import type { OAuthProvider } from '../lib/oauth'
import { useNavigate } from 'react-router-dom'

export function LoginScreen() {
  const [mode, setMode] = useState<'student' | 'teacher'>('student')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null)
  const [oauthParams] = useState(() => new URLSearchParams(window.location.search))
  const oauthError = oauthParams.get('oauth_error')
  const oauthToken = oauthParams.get('t')
  const [oauthExchange, setOauthExchange] = useState(() => !!new URLSearchParams(window.location.search).get('t'))
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    if (!oauthToken) return

    ;(async () => {
      try {
        const profile = await exchangeOAuthToken(oauthToken)
        await supabase.auth.signInAnonymously()

        if (profile.role === 'teacher') {
          localStorage.setItem('user_role', 'teacher')
          localStorage.setItem('teacher_id', profile.id)
          localStorage.setItem('login_code', profile.login_code || '')
          navigate('/teacher')
        } else if (profile.role === 'student') {
          localStorage.setItem('user_role', 'student')
          localStorage.setItem('student_id', profile.id)
          localStorage.setItem('student_name', profile.name)
          localStorage.setItem('group_id', profile.group_id || '')
          localStorage.setItem('group_name', profile.groups?.name || '')
          localStorage.setItem('student_invite_code', profile.invite_code || '')
          navigate('/student')
        } else {
          setOauthExchange(false)
        }
        window.history.replaceState({}, '', '/')
      } catch {
        setOauthExchange(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oauthToken])

  const handleOAuthLogin = async (provider: OAuthProvider) => {
    setError('')
    setOauthLoading(provider)
    try {
      const url = await startOAuth(provider, 'login')
      window.location.href = url
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
      setOauthLoading(null)
    }
  }

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

      if (!studentProfile) {
        setError('Ученик не найден. Проверьте код.')
        setLoading(false)
        return
      }

      await supabase.auth.signInAnonymously()

      const group = studentProfile.groups as any
      localStorage.setItem('user_role', 'student')
      localStorage.setItem('group_id', studentProfile.group_id)
      localStorage.setItem('group_name', group?.name || '')
      localStorage.setItem('student_name', studentProfile.name)
      localStorage.setItem('student_id', studentProfile.id)
      localStorage.setItem('student_invite_code', studentProfile.invite_code || '')
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

  if (oauthExchange) {
    return (
      <div className="login-container">
        <div className="login-card">
          <p className="login-subtitle" style={{ textAlign: 'center' }}>Вход...</p>
        </div>
      </div>
    )
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

        {oauthError && <div className="error-message">{oauthError}</div>}

        <div className="login-tabs">
          <button
            className={`login-tab ${mode === 'student' ? 'active' : ''}`}
            onClick={() => { setMode('student'); setError(''); setCode('') }}
          >
            Ученик
          </button>
          <button
            className={`login-tab ${mode === 'teacher' ? 'active' : ''}`}
            onClick={() => { setMode('teacher'); setError(''); setCode('') }}
          >
            Преподаватель
          </button>
        </div>

        {mode === 'student' && (
          <form onSubmit={handleStudentLogin} className="login-form">
            <div className="form-group">
              <label htmlFor="code">Код ученика</label>
              <input
                id="code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="STU-XXXXXX"
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

        <div className="oauth-divider">
          <span>или быстрый вход</span>
        </div>

        <div className="oauth-buttons">
          <button
            onClick={() => handleOAuthLogin('vk')}
            className="btn btn-outline btn-full"
            disabled={oauthLoading !== null}
          >
            {oauthLoading === 'vk' ? 'Переход...' : 'Войти через VK ID'}
          </button>
          <button
            onClick={() => handleOAuthLogin('yandex')}
            className="btn btn-outline btn-full"
            disabled={oauthLoading !== null}
          >
            {oauthLoading === 'yandex' ? 'Переход...' : 'Войти через Яндекс ID'}
          </button>
        </div>
      </div>

      <a href="/admin" className="admin-login-link">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0110 0v4"/>
        </svg>
        Войти как администратор
      </a>
    </div>
  )
}
