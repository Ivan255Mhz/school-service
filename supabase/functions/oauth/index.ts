// Edge Function: oauth
// Быстрый вход и привязка VK ID / Яндекс ID
//
// POST /functions/v1/oauth   — JSON-действия:
//   start    { provider, mode: 'link'|'login', login_code? } -> { url }
//   unlink   { provider, login_code }                        -> отвязать
//   exchange { token }                                       -> { profile }
// GET  /functions/v1/oauth  — OAuth callback от провайдера (?code=&state=)
//
// Секреты:
//   VK_APP_ID, VK_APP_SECRET, YANDEX_APP_ID, YANDEX_APP_SECRET,
//   OAUTH_REDIRECT_BASE (по умолчанию https://school-service-nine.vercel.app)
//
// Deploy: supabase functions deploy oauth --no-verify-jwt
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const STATE_TTL_MS = 10 * 60 * 1000
const TOKEN_TTL_MS = 10 * 60 * 1000

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function randomHex(len = 16): string {
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

function base64urlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sha256Base64url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return base64urlEncode(digest)
}

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const part = jwt.split('.')[1]
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(json)
  } catch {
    return null
  }
}

function redirectBase(): string {
  return (Deno.env.get('OAUTH_REDIRECT_BASE') || 'https://school-service-nine.vercel.app').replace(/\/$/, '')
}

function functionUrl(): string {
  return `${Deno.env.get('SUPABASE_URL')}/functions/v1/oauth`
}

type ProfileRef = { id: string; role: string }

async function verifyProfileRole(admin: any, loginCode: unknown, inviteCode?: unknown): Promise<ProfileRef | null> {
  if (loginCode && typeof loginCode === 'string') {
    const { data: profile } = await admin
      .from('profiles')
      .select('id, role')
      .eq('login_code', loginCode.toUpperCase())
      .in('role', ['teacher', 'student'])
      .maybeSingle()
    if (profile) return profile
  }
  if (inviteCode && typeof inviteCode === 'string') {
    const { data: profile } = await admin
      .from('profiles')
      .select('id, role')
      .eq('invite_code', inviteCode.toUpperCase())
      .eq('role', 'student')
      .maybeSingle()
    if (profile) return profile
  }
  return null
}

function getProviderColumn(provider: string): string {
  return provider === 'vk' ? 'vk_id' : 'yandex_id'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceRoleKey)

  // === GET: OAuth callback от провайдера ===
  if (req.method === 'GET') {
    return handleCallback(req, admin)
  }

  // === POST: JSON-действия ===
  try {
    const body = await req.json()
    const { action, provider, mode, login_code, invite_code, token } = body ?? {}

    // Отвязка соцаккаунта
    if (action === 'unlink') {
      if (provider !== 'vk' && provider !== 'yandex') return json({ ok: false, error: 'invalid provider' })
      const profile = await verifyProfileRole(admin, login_code, invite_code)
      if (!profile) return json({ ok: false, error: 'forbidden' }, 403)

      const { error } = await admin
        .from('profiles')
        .update({ [getProviderColumn(provider)]: null })
        .eq('id', profile.id)

      if (error) return json({ ok: false, error: 'db_error' })
      return json({ ok: true })
    }

    // Обмен одноразового токена на профиль
    if (action === 'exchange') {
      if (!token || typeof token !== 'string') return json({ ok: false, error: 'token required' })

      const { data: row } = await admin
        .from('oauth_tokens')
        .select('token, profile_id, expires_at, used')
        .eq('token', token)
        .maybeSingle()

      if (!row) return json({ ok: false, error: 'invalid_token' })
      if (row.used) return json({ ok: false, error: 'token_used' })
      if (new Date(row.expires_at).getTime() < Date.now()) return json({ ok: false, error: 'token_expired' })

      const { data: profile } = await admin
        .from('profiles')
        .select('id, name, full_name, role, group_id, login_code, invite_code, groups(name)')
        .eq('id', row.profile_id)
        .maybeSingle()

      if (!profile || profile.role === 'admin') return json({ ok: false, error: 'invalid_token' })

      await admin.from('oauth_tokens').update({ used: true }).eq('token', token)
      return json({ ok: true, profile })
    }

    // URL авторизации провайдера
    if (action === 'start') {
      if (provider !== 'vk' && provider !== 'yandex') return json({ ok: false, error: 'invalid provider' })
      if (mode !== 'link' && mode !== 'login') return json({ ok: false, error: 'invalid mode' })

      let profileId: string | null = null
      if (mode === 'link') {
        const profile = await verifyProfileRole(admin, login_code)
        if (!profile) return json({ ok: false, error: 'forbidden' }, 403)
        profileId = profile.id
      }

      const state = randomHex(16)
      const stateData: Record<string, unknown> = {
        provider,
        mode,
        login_code: login_code || null,
        profile_id: profileId,
      }

      let url: string
      if (provider === 'vk') {
        const appId = Deno.env.get('VK_APP_ID')
        if (!appId) return json({ ok: false, error: 'VK_APP_ID не задан' })

        const verifier = randomHex(24)
        stateData.code_verifier = verifier
        stateData.device_id = randomHex(8)

        url = 'https://id.vk.com/authorize?' + new URLSearchParams({
          response_type: 'code',
          client_id: appId,
          redirect_uri: functionUrl(),
          state,
          code_challenge: await sha256Base64url(verifier),
          code_challenge_method: 'S256',
          scope: 'vkid_openid',
        }).toString()
      } else {
        const appId = Deno.env.get('YANDEX_APP_ID')
        if (!appId) return json({ ok: false, error: 'YANDEX_APP_ID не задан' })

        url = 'https://oauth.yandex.ru/authorize?' + new URLSearchParams({
          response_type: 'code',
          client_id: appId,
          redirect_uri: functionUrl(),
          state,
        }).toString()
      }

      const { error: stErr } = await admin.from('oauth_states').insert({
        state,
        data: stateData,
        expires_at: new Date(Date.now() + STATE_TTL_MS).toISOString(),
      })
      if (stErr) return json({ ok: false, error: 'db_error' })

      return json({ ok: true, url })
    }

    return json({ ok: false, error: 'unknown_action' })
  } catch (e) {
    return json({ ok: false, error: 'internal', message: String(e) })
  }
})

async function handleCallback(req: Request, admin: any) {
  const base = redirectBase()
  const params = new URL(req.url).searchParams
  const error = params.get('error')
  const state = params.get('state')
  const code = params.get('code')

  const fail = (msg: string) => new Response(null, {
    status: 302,
    headers: { Location: `${base}/?oauth_error=${encodeURIComponent(msg)}` },
  })

  if (error) return fail(`Провайдер: ${error}`)
  if (!state || !code) return fail('Некорректный callback')

  const { data: stateRow } = await admin
    .from('oauth_states')
    .select('data, expires_at')
    .eq('state', state)
    .maybeSingle()
  await admin.from('oauth_states').delete().eq('state', state)

  if (!stateRow) return fail('State недействителен (истёк или уже использован)')
  if (new Date(stateRow.expires_at).getTime() < Date.now()) return fail('State истёк')

  const st = typeof stateRow.data === 'string' ? JSON.parse(stateRow.data) : stateRow.data
  const provider = st.provider as string
  const mode = st.mode as string
  const column = getProviderColumn(provider)

  try {
    const socialId = provider === 'vk'
      ? await resolveVkId(code, st.code_verifier, st.device_id)
      : await resolveYandexId(code)

    if (!socialId) return fail('Не удалось получить ID от провайдера')

    if (mode === 'link') {
      const { data: clash } = await admin
        .from('profiles')
        .select('id')
        .eq(column, String(socialId))
        .neq('id', st.profile_id)
        .maybeSingle()
      if (clash) return fail('Этот аккаунт уже привязан к другому профилю')

      const { error } = await admin
        .from('profiles')
        .update({ [column]: String(socialId) })
        .eq('id', st.profile_id)
      if (error) return fail('Ошибка сохранения')

      const { data: linkProfile } = await admin
        .from('profiles')
        .select('role')
        .eq('id', st.profile_id)
        .maybeSingle()
      const path = linkProfile?.role === 'teacher' ? '/teacher' : '/student'
      return new Response(null, { status: 302, headers: { Location: `${base}${path}?linked=${provider}` } })
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .eq(column, String(socialId))
      .maybeSingle()
    if (!profile) return fail('Профиль с этим соцаккаунтом не найден. Сначала войдите по коду и привяжите аккаунт в настройках.')

    const token = randomHex(24)
    const { error: tokErr } = await admin.from('oauth_tokens').insert({
      token,
      profile_id: profile.id,
      expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
    })
    if (tokErr) return fail('Ошибка создания токена')

    return new Response(null, { status: 302, headers: { Location: `${base}/?t=${token}` } })
  } catch (e) {
    return fail(`Ошибка обмена кода: ${String(e)}`)
  }
}

async function resolveVkId(code: string, verifier: string, deviceId?: string): Promise<string> {
  const appId = Deno.env.get('VK_APP_ID')
  const appSecret = Deno.env.get('VK_APP_SECRET')
  if (!appId || !appSecret) throw new Error('VK_APP_ID/SECRET не заданы')

  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: appId,
    code_verifier: verifier,
    redirect_uri: functionUrl(),
    client_secret: appSecret,
  })
  if (deviceId) form.set('device_id', deviceId)

  const res = await fetch('https://id.vk.com/oauth2/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  })
  const data = await res.json()
  if (!res.ok || data.error) {
    throw new Error(`VK token: ${data.error_description || data.error || res.status}`)
  }

  if (data.user_id) return String(data.user_id)
  const payload = data.id_token ? decodeJwtPayload(data.id_token) : null
  if (payload?.sub) return String(payload.sub)
  if (payload?.user_id) return String(payload.user_id)

  const vkRes = await fetch('https://api.vk.com/method/users.get?v=5.199', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ access_token: data.access_token }).toString(),
  })
  const vkData = await vkRes.json()
  const vkId = vkData?.response?.[0]?.id
  if (!vkId) throw new Error('VK: не удалось определить user_id')
  return String(vkId)
}

async function resolveYandexId(code: string): Promise<string> {
  const appId = Deno.env.get('YANDEX_APP_ID')
  const appSecret = Deno.env.get('YANDEX_APP_SECRET')
  if (!appId || !appSecret) throw new Error('YANDEX_APP_ID/SECRET не заданы')

  const res = await fetch('https://oauth.yandex.ru/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: appId,
      client_secret: appSecret,
    }).toString(),
  })
  const data = await res.json()
  if (!res.ok || !data.access_token) {
    throw new Error(`Yandex token: ${data.error_description || data.error || res.status}`)
  }

  const infoRes = await fetch(`https://login.yandex.ru/info?oauth_token=${data.access_token}&format=json`)
  const info = await infoRes.json()
  if (!info?.id) throw new Error('Yandex: не удалось получить id')
  return String(info.id)
}
