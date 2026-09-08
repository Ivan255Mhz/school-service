import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Notification } from '../lib/supabase'

const LIMIT = 30

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

export function NotificationBell({ recipientId }: { recipientId: string }) {
  const [items, setItems] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const load = async () => {
    if (!recipientId) return
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', recipientId)
      .order('created_at', { ascending: false })
      .limit(LIMIT)
    if (data) setItems(data)
  }

  useEffect(() => {
    if (!recipientId) return
    load()

    const channel = supabase
      .channel(`notifications-${recipientId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${recipientId}`,
        },
        (payload) => {
          const row = payload.new as Notification
          setItems(prev => [row, ...prev.filter(x => x.id !== row.id)].slice(0, LIMIT))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipientId])

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const markRead = async (n: Notification) => {
    if (n.is_read) return
    setItems(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x))
    await supabase.from('notifications').update({ is_read: true }).eq('id', n.id)
  }

  const markAllRead = async () => {
    if (!recipientId) return
    setItems(prev => prev.map(x => ({ ...x, is_read: true })))
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('recipient_id', recipientId)
      .eq('is_read', false)
  }

  const toggle = async () => {
    if (!open) {
      setLoading(true)
      await load()
      setLoading(false)
    }
    setOpen(!open)
  }

  const unread = items.filter(x => !x.is_read).length

  return (
    <div className="notif-bell-wrap" ref={wrapRef}>
      <button className="notif-bell" onClick={toggle} title="Уведомления">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 01-3.46 0"/>
        </svg>
        {unread > 0 && <span className="notif-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <div className="notif-dropdown">
          <div className="notif-dropdown-header">
            <span>Уведомления</span>
            {unread > 0 && (
              <button onClick={markAllRead} className="notif-mark-all">Прочитать все</button>
            )}
          </div>
          {loading ? (
            <p className="notif-empty">Загрузка...</p>
          ) : items.length === 0 ? (
            <p className="notif-empty">Уведомлений нет</p>
          ) : (
            <div className="notif-list">
              {items.map(n => (
                <button
                  key={n.id}
                  className={`notif-item ${n.is_read ? '' : 'unread'}`}
                  onClick={() => markRead(n)}
                >
                  <span className="notif-dot" />
                  <span className="notif-text">{n.title}</span>
                  <span className="notif-time">{formatTime(n.created_at)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
