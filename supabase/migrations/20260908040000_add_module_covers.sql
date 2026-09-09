-- =============================================
-- Миграция: фото модуля (обложка)
-- Выполнить в Supabase SQL Editor
-- =============================================

-- 1. Ссылка на фото обложки модуля
ALTER TABLE modules ADD COLUMN IF NOT EXISTS cover_url TEXT;

-- 2. Публичный бакет для обложек модулей
INSERT INTO storage.buckets (id, name, public)
VALUES ('module-covers', 'module-covers', true)
ON CONFLICT (id) DO NOTHING;
