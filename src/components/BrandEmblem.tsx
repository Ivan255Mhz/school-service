export function BrandEmblem({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <rect x="10" y="27" width="10" height="25" rx="1" fill="#a0349c"/>
      <circle cx="15" cy="21.5" r="6" fill="#a0349c"/>
      <rect x="20" y="35" width="8" height="17" rx="1" fill="#ec1e79"/>
      <circle cx="24" cy="30" r="5.5" fill="#ec1e8c"/>
      <rect x="30" y="22" width="9" height="30" rx="1" fill="#29a9f0"/>
      <circle cx="34.5" cy="16" r="6.5" fill="#29a9f0"/>
      <circle cx="39" cy="39" r="5" fill="#ffb300" opacity="0.9"/>
      <rect x="43" y="30" width="9" height="20" rx="1" fill="#8bc34a"/>
      <circle cx="47.5" cy="26.5" r="6" fill="#9ccb4b"/>
      <circle cx="44" cy="43" r="4" fill="#26a69a" opacity="0.85"/>
    </svg>
  )
}
