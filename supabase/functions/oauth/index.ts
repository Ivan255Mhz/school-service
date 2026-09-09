// Edge Function: oauth
// Быстрый вход и привязка Яндекс ID
//
// POST /functions/v1/oauth   — JSON-действия:
//   start    { mode: 'link'|'login', login_code?, invite_code? } -> { url }
//   unlink   { login_code?, invite_code? }                       -> отвязать
//   exchange { token }                                           -> { profile }
// GET  /functions/v1/oauth  — OAuth callback от провайдера (?code=&state=)
//
// Секреты:
//   YANDEX_APP_ID, YANDEX_APP_SECRET,
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
    const { action, mode, login_code, invite_code, token } = body ?? {}

    // Отвязка соцаккаунта
    if (action === 'unlink') {
      const profile = await verifyProfileRole(admin, login_code, invite_code)
      if (!profile) return json({ ok: false, error: 'forbidden' }, 403)

      const { error } = await admin
        .from('profiles')
        .update({ yandex_id: null })
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
      if (mode !== 'link' && mode !== 'login') return json({ ok: false, error: 'invalid mode' })

      let profileId: string | null = null
      if (mode === 'link') {
        const profile = await verifyProfileRole(admin, login_code, invite_code)
        if (!profile) return json({ ok: false, error: 'forbidden' }, 403)
        profileId = profile.id
      }

      const appId = Deno.env.get('YANDEX_APP_ID')
      if (!appId) return json({ ok: false, error: 'YANDEX_APP_ID не задан' })

      const state = randomHex(16)
      const { error: stErr } = await admin.from('oauth_states').insert({
        state,
        data: {
          mode,
          login_code: login_code || null,
          invite_code: invite_code || null,
          profile_id: profileId,
        },
        expires_at: new Date(Date.now() + STATE_TTL_MS).toISOString(),
      })
      if (stErr) return json({ ok: false, error: 'db_error' })

      const url = 'https://oauth.yandex.ru/authorize?' + new URLSearchParams({
        response_type: 'code',
        client_id: appId,
        redirect_uri: functionUrl(),
        state,
      }).toString()

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
  const mode = st.mode as string

  try {
    const socialId = await resolveYandexId(code)
    if (!socialId) return fail('Не удалось получить ID от провайдера')

    if (mode === 'link') {
      const { data: clash } = await admin
        .from('profiles')
        .select('id')
        .eq('yandex_id', socialId)
        .neq('id', st.profile_id)
        .maybeSingle()
      if (clash) return fail('Этот аккаунт уже привязан к другому профилю')

      const { error } = await admin
        .from('profiles')
        .update({ yandex_id: socialId })
        .eq('id', st.profile_id)
      if (error) return fail('Ошибка сохранения')

      const { data: linkProfile } = await admin
        .from('profiles')
        .select('role')
        .eq('id', st.profile_id)
        .maybeSingle()
      const path = linkProfile?.role === 'teacher' ? '/teacher' : '/student'
      return new Response(null, { status: 302, headers: { Location: `${base}${path}?linked=yandex` } })
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .eq('yandex_id', socialId)
      .maybeSingle()
    if (!profile) return fail('Профиль с этим Яндекс ID не найден. Сначала войдите по коду и привяжите аккаунт в настройках.')

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
