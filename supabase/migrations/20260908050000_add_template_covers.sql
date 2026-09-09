-- =============================================
-- Миграция: фото шаблона модуля (обложка)
-- Выполнить в Supabase SQL Editor
-- =============================================

-- Ссылка на фото обложки шаблона
-- (бакет module-covers переиспользуется: путь ${template_id}/cover)
ALTER TABLE module_templates ADD COLUMN IF NOT EXISTS cover_url TEXT;
