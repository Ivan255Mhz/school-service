// Edge Function: send-telegram
// Действия:
//   send  — отправить сводку в родительский чат группы
//   bind  — получить список групповых чатов, где бот получает сообщения
//
// Секреты:
//   TELEGRAM_BOT_TOKEN — токен бота (@BotFather), задаётся через `supabase secrets set`
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_MESSAGE_LENGTH = 4000

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function splitText(text: string): string[] {
  if (text.length <= MAX_MESSAGE_LENGTH) return [text]
  const chunks: string[] = []
  let rest = text
  while (rest.length > 0) {
    if (rest.length <= MAX_MESSAGE_LENGTH) {
      chunks.push(rest)
      break
    }
    let cut = rest.lastIndexOf('\n\n', MAX_MESSAGE_LENGTH)
    if (cut < MAX_MESSAGE_LENGTH / 2) cut = rest.lastIndexOf('\n', MAX_MESSAGE_LENGTH)
    if (cut < MAX_MESSAGE_LENGTH / 2) cut = MAX_MESSAGE_LENGTH
    chunks.push(rest.slice(0, cut))
    rest = rest.slice(cut).replace(/^\n+/, '')
  }
  return chunks
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
    if (!botToken) {
      return json({ ok: false, error: 'TELEGRAM_BOT_TOKEN не задан. Выполните: supabase secrets set TELEGRAM_BOT_TOKEN=...' })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Требуем валидную сессию (вход в приложение)
    const authHeader = req.headers.get('Authorization') ?? ''
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData } = await authClient.auth.getUser()
    if (!userData?.user) {
      return json({ ok: false, error: 'unauthorized' }, 401)
    }

    // Сервисный клиент: обходит RLS для проверки кода преподавателя и группы
    const admin = createClient(supabaseUrl, serviceRoleKey)

    const body = await req.json()
    const { action, login_code, group_id, text } = body ?? {}

    if (!login_code || typeof login_code !== 'string') {
      return json({ ok: false, error: 'login_code required' })
    }

    const { data: teacher } = await admin
      .from('profiles')
      .select('id, role')
      .eq('login_code', login_code.toUpperCase())
      .eq('role', 'teacher')
      .maybeSingle()

    if (!teacher) {
      return json({ ok: false, error: 'forbidden' }, 403)
    }

    const verifyGroup = async () => {
      const { data: group } = await admin
        .from('groups')
        .select('id, teacher_id, telegram_chat_id')
        .eq('id', group_id)
        .maybeSingle()
      if (!group || group.teacher_id !== teacher.id) return null
      return group
    }

    // === Привязка чата: список групповых чатов из последних сообщений бота ===
    if (action === 'bind') {
      const group = await verifyGroup()
      if (!group) return json({ ok: false, error: 'forbidden' }, 403)

      const res = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?limit=100&allowed_updates=["message","my_chat_member"]`)
      const data = await res.json()
      if (!data.ok) {
        return json({ ok: false, error: `Telegram API: ${data.description ?? 'unknown error'}` })
      }

      const chats = new Map<number, string>()
      for (const upd of data.result ?? []) {
        const chat = upd.message?.chat ?? upd.my_chat_member?.chat
        if (chat && (chat.type === 'group' || chat.type === 'supergroup')) {
          chats.set(chat.id, chat.title ?? '')
        }
      }

      return json({
        ok: true,
        chats: Array.from(chats.entries()).map(([id, title]) => ({ id, title })),
      })
    }

    // === Сохранение/сброс привязки чата к группе ===
    if (action === 'set_chat') {
      const group = await verifyGroup()
      if (!group) return json({ ok: false, error: 'forbidden' }, 403)

      const chatId = body.chat_id ?? null
      if (chatId !== null && typeof chatId !== 'number') {
        return json({ ok: false, error: 'invalid chat_id' })
      }

      const { error: updErr } = await admin
        .from('groups')
        .update({ telegram_chat_id: chatId })
        .eq('id', group_id)

      if (updErr) {
        return json({ ok: false, error: 'db_error' })
      }

      return json({ ok: true })
    }

    // === Отправка сводки в привязанный чат группы ===
    if (action === 'send') {
      const group = await verifyGroup()
      if (!group) return json({ ok: false, error: 'forbidden' }, 403)
      if (!group.telegram_chat_id) {
        return json({ ok: false, error: 'chat_not_bound' })
      }
      if (!text || typeof text !== 'string') {
        return json({ ok: false, error: 'text required' })
      }

      for (const chunk of splitText(text)) {
        const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: group.telegram_chat_id,
            text: chunk,
            disable_web_page_preview: true,
          }),
        })
        const data = await res.json()
        if (!data.ok) {
          return json({ ok: false, error: `Telegram API: ${data.description ?? 'unknown error'}` })
        }
      }

      return json({ ok: true })
    }

    return json({ ok: false, error: 'unknown_action' })
  } catch (e) {
    return json({ ok: false, error: 'internal', message: String(e) })
  }
})
