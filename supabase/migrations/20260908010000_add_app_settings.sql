-- =============================================
-- Миграция: Telegram-чат директора (отчёт за день)
-- Выполнить в Supabase SQL Editor
-- =============================================

-- Хранилище глобальных настроек приложения (key/value).
-- RLS включена без политик: доступ только через service role (Edge Function).
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
