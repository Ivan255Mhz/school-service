const store = new Map<string, { data: unknown; ts: number }>()

const TTL = 5 * 60 * 1000

export function getCached<T>(key: string): T | null {
  const hit = store.get(key)
  if (!hit) return null
  if (Date.now() - hit.ts > TTL) {
    store.delete(key)
    return null
  }
  return hit.data as T
}

export function setCached(key: string, data: unknown): void {
  store.set(key, { data, ts: Date.now() })
}
