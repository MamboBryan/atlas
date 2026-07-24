export function AtlasLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 -400 750 800"
      className={className}
      aria-hidden="true"
    >
      <g fill="currentColor">
        <path d="M225 -295 L350 -350 A300 350 0 0 0 50 0 A300 350 0 0 0 350 350 L225 295 Z" />
        <path d="M375 -295 L350 -350 A300 350 0 0 1 650 0 A300 350 0 0 1 350 350 L375 295 Z" />
        <rect x="650" y="-340" width="50" height="680" />
      </g>
    </svg>
  );
}
