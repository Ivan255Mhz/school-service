import { showToast } from './Toast'

export function CopyCode({ code }: { code: string }) {
  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    try {
      await navigator.clipboard.writeText(code)
      showToast('success', `Код ${code} скопирован`)
    } catch {
      showToast('error', 'Не удалось скопировать код')
    }
  }

  return (
    <span className="copy-code" onClick={copy} title="Нажмите, чтобы скопировать код">
      <code>{code}</code>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
      </svg>
    </span>
  )
}
