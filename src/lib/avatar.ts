import { supabase } from './supabase'

export const MAX_AVATAR_SIZE = 5 * 1024 * 1024

export async function uploadAvatar(profileId: string, file: File): Promise<string> {
  const path = `${profileId}/avatar`
  const { error: upErr } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type })

  if (upErr) throw upErr

  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  const url = `${data.publicUrl}?t=${Date.now()}`

  const { error: updErr } = await supabase
    .from('profiles')
    .update({ avatar_url: url })
    .eq('id', profileId)

  if (updErr) throw updErr
  return url
}

export async function uploadModuleCover(moduleId: string, file: File): Promise<string> {
  const path = `${moduleId}/cover`
  const { error: upErr } = await supabase.storage
    .from('module-covers')
    .upload(path, file, { upsert: true, contentType: file.type })

  if (upErr) throw upErr

  const { data } = supabase.storage.from('module-covers').getPublicUrl(path)
  const url = `${data.publicUrl}?t=${Date.now()}`

  const { error: updErr } = await supabase
    .from('modules')
    .update({ cover_url: url })
    .eq('id', moduleId)

  if (updErr) throw updErr
  return url
}

export async function uploadTemplateCover(templateId: string, file: File): Promise<string> {
  const path = `${templateId}/cover`
  const { error: upErr } = await supabase.storage
    .from('module-covers')
    .upload(path, file, { upsert: true, contentType: file.type })

  if (upErr) throw upErr

  const { data } = supabase.storage.from('module-covers').getPublicUrl(path)
  const url = `${data.publicUrl}?t=${Date.now()}`

  const { error: updErr } = await supabase
    .from('module_templates')
    .update({ cover_url: url })
    .eq('id', templateId)

  if (updErr) throw updErr
  return url
}

export async function deleteAvatar(profileId: string): Promise<void> {
  const loginCode = localStorage.getItem('login_code')
  if (!loginCode) throw new Error('no login_code')

  const { data, error } = await supabase.functions.invoke('send-telegram', {
    body: { action: 'delete_avatar', login_code: loginCode, profile_id: profileId },
  })

  if (error || !data?.ok) throw new Error(data?.error || 'delete failed')
}
