/** Cofre de LawChest con los colores del despacho */
export function ChestMark({ className = 'size-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path d="M8 28c0-11 10.7-18 24-18s24 7 24 18v4H8z" fill="#7A2836" />
      <path d="M8 28c0-11 10.7-18 24-18s24 7 24 18" fill="none" stroke="#561823" strokeWidth="2" />
      <rect x="6" y="30" width="52" height="26" rx="5" fill="#6A1F2B" />
      <rect x="6" y="30" width="52" height="6" fill="#F8A11B" />
      <rect x="15" y="12.5" width="5" height="43.5" fill="#F8A11B" opacity=".9" />
      <rect x="44" y="12.5" width="5" height="43.5" fill="#F8A11B" opacity=".9" />
      <rect x="26" y="30" width="12" height="15" rx="3" fill="#F8A11B" stroke="#561823" strokeWidth="1.5" />
      <circle cx="32" cy="36" r="2.2" fill="#3F111A" />
      <path d="M32 37.5v4" stroke="#3F111A" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function Logo() {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <ChestMark />
      <span className="font-display text-[28px] leading-none tracking-wide text-brand-700">
        Law<span className="text-accent-600">Chest</span>
      </span>
    </div>
  )
}
