/** ClipFlow mark: a play shape with "flow" lines. */
export function LogoMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--primary)" />
      <rect x=".5" y=".5" width="31" height="31" rx="8.5" stroke="#fff" strokeOpacity=".14" />
      <path d="M13 10.5v11l8.5-5.5L13 10.5Z" fill="#fff" />
      <path d="M6.5 13h3.5M5.5 16h4.5M6.5 19h3.5" stroke="#fff" strokeOpacity=".7" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
