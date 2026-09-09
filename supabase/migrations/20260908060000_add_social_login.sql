-- =============================================
-- Миграция: быстрый вход через VK ID / Яндекс ID
-- Выполнить в Supabase SQL Editor
-- =============================================

-- Связанные аккаунты
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS vk_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS yandex_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_vk_id ON profiles(vk_id) WHERE vk_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_yandex_id ON profiles(yandex_id) WHERE yandex_id IS NOT NULL;

-- Одноразовые токены после OAuth-входа
CREATE TABLE IF NOT EXISTS oauth_tokens (
  token TEXT PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Состояния OAuth (PKCE-верификатор + контекст между start и callback)
CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
