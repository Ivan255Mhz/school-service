import { useRef, useState } from 'react'

const TRIGGER = 55
const MAX_PULL = 70

export function usePullToRefresh(onRefresh: () => Promise<void>) {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef<number | null>(null)

  const onTouchStart = (e: React.TouchEvent) => {
    const scrollTop = document.scrollingElement?.scrollTop ?? 0
    startY.current = scrollTop <= 0 ? e.touches[0].clientY : null
  }

  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current === null || refreshing) return
    const delta = e.touches[0].clientY - startY.current
    if (delta > 0) setPull(Math.min(delta * 0.4, MAX_PULL))
    else setPull(0)
  }

  const onTouchEnd = async () => {
    const shouldRefresh = pull >= TRIGGER
    startY.current = null
    if (!shouldRefresh || refreshing) {
      setPull(0)
      return
    }
    setRefreshing(true)
    setPull(TRIGGER)
    try {
      await onRefresh()
    } finally {
      setRefreshing(false)
      setPull(0)
    }
  }

  return {
    refreshing,
    indicatorHeight: refreshing ? TRIGGER : pull,
    ready: pull >= TRIGGER && !refreshing,
    containerProps: { onTouchStart, onTouchMove, onTouchEnd },
  }
}
