import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { uploadAvatar, MAX_AVATAR_SIZE } from '../lib/avatar'
import { startOAuth, unlinkSocial } from '../lib/oauth'
import type { OAuthProvider } from '../lib/oauth'
import { showToast } from './Toast'

type Props = {
  role: 'student' | 'teacher'
  profileId: string
  loginCode: string | null
  inviteCode: string | null
  initialName: string
  initialAvatar: string | null
  onClose: () => void
  onSaved: (name: string, avatarUrl: string | null) => void
}

export function ProfileSettings({ role, profileId, loginCode, inviteCode, initialName, initialAvatar, onClose, onSaved }: Props) {
  const [name, setName] = useState(initialName)
  const [avatar, setAvatar] = useState<string | null>(initialAvatar)
  const [yandexLinked, setYandexLinked] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [unlinking, setUnlinking] = useState<OAuthProvider | null>(null)

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('yandex_id')
        .eq('id', profileId)
        .maybeSingle()
      if (data) {
        setYandexLinked(!!data.yandex_id)
      }
    })()
  }, [profileId])

  const handleSaveName = async () => {
    if (!name.trim()) return
    setSaving(true)
    const update: Record<string, string> = { name: name.trim() }
    if (role === 'teacher') update.full_name = name.trim()

    const { error } = await supabase.from('profiles').update(update).eq('id', profileId)
    setSaving(false)
    if (error) {
      showToast('error', 'Не удалось сохранить профиль')
      return
    }
    onSaved(name.trim(), avatar)
    showToast('success', 'Профиль сохранён')
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      showToast('error', 'Можно загружать только изображения')
      return
    }
    if (file.size > MAX_AVATAR_SIZE) {
      showToast('error', 'Файл слишком большой (максимум 5 МБ)')
      return
    }

    setUploading(true)
    try {
      const url = await uploadAvatar(profileId, file)
      setAvatar(url)
      onSaved(name.trim(), url)
      showToast('success', 'Фото обновлено')
    } catch {
      showToast('error', 'Не удалось загрузить фото')
    } finally {
      setUploading(false)
    }
  }

  const handleLink = async (provider: OAuthProvider) => {
    if (!loginCode && !inviteCode) {
      showToast('error', 'Код входа не найден. Перевойдите в систему.')
      return
    }
    try {
      const url = await startOAuth(provider, 'link', loginCode, inviteCode)
      window.location.assign(url)
    } catch (err) {
      showToast('error', String(err instanceof Error ? err.message : err))
    }
  }

  const handleUnlink = async (provider: OAuthProvider) => {
    if (!loginCode && !inviteCode) {
      showToast('error', 'Код входа не найден. Перевойдите в систему.')
      return
    }
    setUnlinking(provider)
    try {
      await unlinkSocial(provider, loginCode || inviteCode || '')
      setYandexLinked(false)
      showToast('success', 'Аккаунт отвязан')
    } catch (err) {
      showToast('error', String(err instanceof Error ? err.message : err))
    } finally {
      setUnlinking(null)
    }
  }

  const providerRow = (title: string, linked: boolean) => (
    <div className="oauth-row">
      <span className="oauth-provider-badge">Я</span>
      <div className="oauth-provider-info">
        <span className="oauth-provider-name">{title}</span>
        <span className={`oauth-status ${linked ? 'linked' : ''}`}>
          {linked ? 'Привязан' : 'Не привязан'}
        </span>
      </div>      {linked ? (
        <button
          onClick={() => handleUnlink('yandex')}
          className="btn btn-outline btn-sm"
          disabled={unlinking === 'yandex'}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 2l8 8M10 2l-8 8"/>
          </svg>
          Отвязать
        </button>
      ) : (
        <button onClick={() => handleLink('yandex')} className="btn btn-outline btn-sm">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M5 6.5a2.5 2.5 0 003.77.27l1.5-1.5a2.5 2.5 0 00-3.54-3.54l-.86.86"/>
            <path d="M7 5.5a2.5 2.5 0 00-3.77-.27l-1.5 1.5a2.5 2.5 0 003.54 3.54l.86-.86"/>
          </svg>
          Привязать
        </button>
      )}
    </div>
  )

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-card" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Настройки профиля</h2>
          <button onClick={onClose} className="btn btn-outline btn-xs" title="Закрыть">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 2l8 8M10 2l-8 8"/>
            </svg>
          </button>
        </div>

        <div className="settings-avatar-row">
          <label className="avatar-editable settings-avatar" title="Изменить фото">
            {avatar ? (
              <img src={avatar} className="avatar-img" alt="" />
            ) : (
              <span className="avatar-letter">{initialName.charAt(0).toUpperCase() || '👤'}</span>
            )}
            <span className="avatar-edit-overlay">
              {uploading ? '...' : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              )}
            </span>
            <input type="file" accept="image/*" className="avatar-input" onChange={handleAvatarChange} disabled={uploading} />
          </label>
          <div className="settings-avatar-info">
            <span className="settings-role">{role === 'teacher' ? 'Преподаватель' : 'Ученик'}</span>
            <span className="settings-hint">Нажмите на фото, чтобы изменить</span>
          </div>
        </div>

        <div className="settings-section">
          <span className="settings-label">Имя</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
            placeholder="Ваше имя"
          />
          <button onClick={handleSaveName} className="btn btn-primary btn-sm btn-full" disabled={saving || !name.trim()}>
            {saving ? 'Сохранение...' : 'Сохранить имя'}
          </button>
        </div>

        <div className="settings-section">
          <span className="settings-label">Быстрый вход</span>
          {providerRow('Яндекс ID', yandexLinked)}
          <p className="settings-note">
            После привязки вы сможете входить одним нажатием. Отвязка не отключает вход по коду.
          </p>
        </div>
      </div>
    </div>
  )
}
