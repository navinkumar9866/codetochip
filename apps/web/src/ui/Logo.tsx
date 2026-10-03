/** The CodeToChip mark (a chip with a "C"), from the "CodeToChip Logo - Final" design. */
export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden>
      <path
        d="M22 10v2M22 52v2M10 22h2M52 22h2M32 10v2M32 52v2M10 32h2M52 32h2M42 10v2M42 52v2M10 42h2M52 42h2"
        fill="none"
        stroke="#EC3013"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <rect x="12" y="12" width="40" height="40" rx="10" fill="#EC3013" />
      <path
        d="M39.8 24.2A11 11 0 1 0 39.8 39.8"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Mark and name: "To" is always the brand red, the rest follows the theme's text colour. */
export function Logo() {
  return (
    <span className="flex items-center gap-2 text-xl font-bold tracking-tight whitespace-nowrap">
      <LogoMark size={28} />
      <span>
        Code<span className="text-[#ec3013]">To</span>Chip
      </span>
    </span>
  );
}
