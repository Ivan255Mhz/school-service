// Edge Function: send-telegram
// Действия:
//   send              — отправить сводку в родительский чат группы (teacher)
//   bind              — список групповых чатов, где бот получает сообщения (teacher)
//   set_chat          — сохранить/сбросить привязку чата к группе (teacher)
//   get_director      — текущий chat_id директора (admin)
//   bind_director     — список чатов + текущий chat_id директора (admin)
//   set_director_chat — сохранить/сбросить chat_id директора (admin)
//   send_director     — отправить отчёт директору (teacher или admin)
//   delete_avatar     — удалить фото профиля (admin)
//
// Секреты:
//   TELEGRAM_BOT_TOKEN — токен бота (@BotFather), задаётся через `supabase secrets set`
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_MESSAGE_LENGTH = 4000
const DIRECTOR_CHAT_KEY = 'director_chat_id'

type Profile = { id: string; role: string }
type Chat = { id: number; title: string }

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

async function listGroupChats(botToken: string): Promise<{ chats: Chat[]; total: number; error?: string }> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?limit=100&allowed_updates=["message","my_chat_member"]`)
  const data = await res.json()
  if (!data.ok) {
    return { chats: [], total: 0, error: `Telegram API: ${data.description ?? 'unknown error'}` }
  }

  const updates = data.result ?? []
  const chats = new Map<number, string>()
  for (const upd of updates) {
    const chat = upd.message?.chat ?? upd.my_chat_member?.chat
    if (!chat) continue
    if (chat.type === 'group' || chat.type === 'supergroup') {
      chats.set(chat.id, chat.title ?? '')
    } else if (chat.type === 'private') {
      const title = [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username || `Чат ${chat.id}`
      chats.set(chat.id, title)
    }
  }

  return { chats: Array.from(chats.entries()).map(([id, title]) => ({ id, title })), total: updates.length }
}

async function sendToChat(botToken: string, chatId: number, text: string): Promise<string | null> {
  for (const chunk of splitText(text)) {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        disable_web_page_preview: true,
      }),
    })
    const data = await res.json()
    if (!data.ok) {
      return `Telegram API: ${data.description ?? 'unknown error'}`
    }
  }
  return null
}

async function getDirectorChatId(admin: any): Promise<number | null> {
  const { data: setting } = await admin
    .from('app_settings')
    .select('value')
    .eq('key', DIRECTOR_CHAT_KEY)
    .maybeSingle()
  if (!setting?.value) return null
  const parsed = Number(setting.value)
  return Number.isFinite(parsed) ? parsed : null
}

async function setDirectorChatId(admin: any, chatId: number | null): Promise<boolean> {
  if (chatId === null) {
    const { error } = await admin.from('app_settings').delete().eq('key', DIRECTOR_CHAT_KEY)
    return !error
  }
  const { error } = await admin
    .from('app_settings')
    .upsert({ key: DIRECTOR_CHAT_KEY, value: String(chatId) }, { onConflict: 'key' })
  return !error
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

    // Сервисный клиент: обходит RLS для проверки кода и чтения настроек
    const admin = createClient(supabaseUrl, serviceRoleKey)

    const body = await req.json()
    const { action, login_code, group_id, text, chat_id } = body ?? {}

    if (!login_code || typeof login_code !== 'string') {
      return json({ ok: false, error: 'login_code required' })
    }

    const code = login_code.toUpperCase()

    const verifyProfile = async (role: string): Promise<Profile | null> => {
      const { data: profile } = await admin
        .from('profiles')
        .select('id, role')
        .eq('login_code', code)
        .eq('role', role)
        .maybeSingle()
      return profile ?? null
    }

    // === Действия директора/администратора ===
    if (action === 'get_director' || action === 'bind_director' || action === 'set_director_chat') {
      const adminProfile = await verifyProfile('admin')
      if (!adminProfile) return json({ ok: false, error: 'forbidden' }, 403)

      if (action === 'get_director') {
        return json({ ok: true, director_chat_id: await getDirectorChatId(admin) })
      }

      if (action === 'bind_director') {
        const { chats, total, error: tgErr } = await listGroupChats(botToken)
        if (tgErr) return json({ ok: false, error: tgErr })
        return json({ ok: true, chats, total, director_chat_id: await getDirectorChatId(admin) })
      }

      // set_director_chat
      const newChatId = chat_id ?? null
      if (newChatId !== null && typeof newChatId !== 'number') {
        return json({ ok: false, error: 'invalid chat_id' })
      }
      if (!(await setDirectorChatId(admin, newChatId))) {
        return json({ ok: false, error: 'db_error' })
      }
      return json({ ok: true })
    }

    // === Действия преподавателя (групповые чаты) ===
    const teacher = await verifyProfile('teacher')
    if (!teacher) return json({ ok: false, error: 'forbidden' }, 403)

    const verifyGroup = async () => {
      const { data: group } = await admin
        .from('groups')
        .select('id, teacher_id, telegram_chat_id')
        .eq('id', group_id)
        .maybeSingle()
      if (!group || group.teacher_id !== teacher.id) return null
      return group
    }

    // Привязка чата: список групповых чатов из последних сообщений бота
    if (action === 'bind') {
      const group = await verifyGroup()
      if (!group) return json({ ok: false, error: 'forbidden' }, 403)

      const { chats, total, error: tgErr } = await listGroupChats(botToken)
      if (tgErr) return json({ ok: false, error: tgErr })

      return json({ ok: true, chats, total })
    }

    // Сохранение/сброс привязки чата к группе
    if (action === 'set_chat') {
      const group = await verifyGroup()
      if (!group) return json({ ok: false, error: 'forbidden' }, 403)

      const newChatId = chat_id ?? null
      if (newChatId !== null && typeof newChatId !== 'number') {
        return json({ ok: false, error: 'invalid chat_id' })
      }

      const { error: updErr } = await admin
        .from('groups')
        .update({ telegram_chat_id: newChatId })
        .eq('id', group_id)

      if (updErr) {
        return json({ ok: false, error: 'db_error' })
      }

      return json({ ok: true })
    }

    // Отправка сводки в привязанный чат группы
    if (action === 'send') {
      const group = await verifyGroup()
      if (!group) return json({ ok: false, error: 'forbidden' }, 403)
      if (!group.telegram_chat_id) {
        return json({ ok: false, error: 'chat_not_bound' })
      }
      if (!text || typeof text !== 'string') {
        return json({ ok: false, error: 'text required' })
      }

      const sendErr = await sendToChat(botToken, group.telegram_chat_id, text)
      if (sendErr) return json({ ok: false, error: sendErr })

      return json({ ok: true })
    }

    // Отправка отчёта директору (разрешено преподавателю или админу)
    if (action === 'send_director') {
      if (!text || typeof text !== 'string') {
        return json({ ok: false, error: 'text required' })
      }

      const directorChatId = await getDirectorChatId(admin)
      if (!directorChatId) {
        return json({ ok: false, error: 'director_not_bound' })
      }

      const sendErr = await sendToChat(botToken, directorChatId, text)
      if (sendErr) return json({ ok: false, error: sendErr })

      return json({ ok: true })
    }

    // Удаление фото профиля администратором
    if (action === 'delete_avatar') {
      const adminProfile = await verifyProfile('admin')
      if (!adminProfile) return json({ ok: false, error: 'forbidden' }, 403)

      const profileId = body.profile_id
      if (!profileId || typeof profileId !== 'string') {
        return json({ ok: false, error: 'profile_id required' })
      }

      // Удаляем файл (ошибка не критична — файла может не быть)
      await admin.storage.from('avatars').remove([`${profileId}/avatar`])

      const { error: updErr } = await admin
        .from('profiles')
        .update({ avatar_url: null })
        .eq('id', profileId)

      if (updErr) {
        return json({ ok: false, error: 'db_error' })
      }

      return json({ ok: true })
    }

    return json({ ok: false, error: 'unknown_action' })
  } catch (e) {
    return json({ ok: false, error: 'internal', message: String(e) })
  }
})
