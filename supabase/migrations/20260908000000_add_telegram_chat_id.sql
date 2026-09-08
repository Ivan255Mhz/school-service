-- =============================================
-- Миграция: Telegram-чат для родительских сводок
-- Выполнить в Supabase SQL Editor
-- =============================================

-- 1. Колонка для привязки родительского чата к группе
ALTER TABLE groups ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT;

-- 2. Политика UPDATE: преподаватель может обновлять свои группы
--    (нужна для привязки/отвязки Telegram-чата)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'groups'
      AND policyname = 'Teachers can update own groups'
  ) THEN
    CREATE POLICY "Teachers can update own groups" ON groups
      FOR UPDATE USING (auth.uid() = teacher_id);
  END IF;
END $$;
