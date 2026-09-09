export function YandexLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" style={{ flexShrink: 0 }}>
      <rect width="32" height="32" rx="7" fill="#FC3F1D"/>
      <circle cx="16" cy="16" r="11" fill="#fff"/>
      <path
        d="M20.5 23V9h-4a4 4 0 000 8h4M16.2 17l-3.7 6"
        stroke="#FC3F1D"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}
