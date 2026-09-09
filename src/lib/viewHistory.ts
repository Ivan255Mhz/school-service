export function pushView(): void {
  window.history.pushState({ appView: true }, '')
}

export function isAppView(state: unknown): boolean {
  return !!(state as { appView?: boolean } | null)?.appView
}
export function closeView(fallback: () => void): void {
  if (isAppView(window.history.state)) window.history.back()
  else fallback()
}
