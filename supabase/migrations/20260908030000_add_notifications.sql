-- =============================================
-- Миграция: система оповещений (колокольчик)
-- Выполнить в Supabase SQL Editor
-- =============================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  lesson_id UUID,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Open notifications" ON notifications
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient
  ON notifications (recipient_id, is_read, created_at DESC);

-- Realtime: мгновенная доставка новых уведомлений
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
