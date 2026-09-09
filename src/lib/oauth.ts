import { supabase } from './supabase'

export type OAuthProvider = 'yandex'

export type OAuthProfile = {
  id: string
  name: string
  full_name: string | null
  role: 'student' | 'teacher'
  group_id: string | null
  login_code: string | null
  invite_code: string | null
  groups?: { name: string } | null
}

export async function startOAuth(provider: OAuthProvider, mode: 'link' | 'login', loginCode?: string | null, inviteCode?: string | null): Promise<string> {
  const { data, error } = await supabase.functions.invoke('oauth', {
    body: { action: 'start', provider, mode, login_code: loginCode || null, invite_code: inviteCode || null },
  })
  if (error || !data?.ok || !data?.url) {
    throw new Error(data?.error || 'Не удалось начать авторизацию')
  }
  return data.url as string
}

export async function exchangeOAuthToken(token: string): Promise<OAuthProfile> {
  const { data, error } = await supabase.functions.invoke('oauth', {
    body: { action: 'exchange', token },
  })
  if (error || !data?.ok) {
    throw new Error(data?.error || 'Не удалось завершить вход')
  }
  return data.profile as OAuthProfile
}

export async function unlinkSocial(provider: OAuthProvider, loginCode: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('oauth', {
    body: { action: 'unlink', provider, login_code: loginCode },
  })
  if (error || !data?.ok) {
    throw new Error(data?.error || 'Не удалось отвязать аккаунт')
  }
}
