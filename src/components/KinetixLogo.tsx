interface Props {
  size?: number;
  showWordmark?: boolean;
}

export function KinetixLogo({ size = 32, showWordmark = true }: Props) {
  return (
    <div className="flex items-center gap-2.5 shrink-0 select-none">
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <rect width="40" height="40" rx="11" fill="#1C1C1E" />
        <rect
          x="0.75"
          y="0.75"
          width="38.5"
          height="38.5"
          rx="10.25"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth="1.5"
        />
        {/* Original interlocking aperture blades */}
        <path
          d="M12 10.5L22.5 20L12 29.5V10.5Z"
          fill="#00E5FF"
        />
        <path
          d="M21 12.5L29.5 20L21 27.5V22.8L24.2 20L21 17.2V12.5Z"
          fill="#FF2D6F"
        />
      </svg>
      {showWordmark && (
        <span className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap">
          Kinetix
        </span>
      )}
    </div>
  );
}
