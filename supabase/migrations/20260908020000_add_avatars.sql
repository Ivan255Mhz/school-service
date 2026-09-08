-- =============================================
-- Миграция: фото профиля (аватарки)
-- Выполнить в Supabase SQL Editor
-- =============================================

-- 1. Ссылка на фото профиля
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 2. Публичный бакет для аватарок
--    (RLS storage открыт политикой "Open storage" —
--     удаление чужих фото идёт через Edge Function с service role)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;
