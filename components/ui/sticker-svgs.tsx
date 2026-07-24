"use client";

import type { StickerName } from "./sticker";

// Each component is a 1:1 conversion of the corresponding public/stickers/*.svg file.
// stroke="currentColor" on the root <svg> means the wrapper's text-ink class drives outline colour in dark mode.

function CalendarSVG(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 200"
      fill="none"
      stroke="currentColor"
      strokeWidth={10}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="20" y="40" width="160" height="140" rx="16" fill="var(--sticker-fill)" />
      <line x1="20" y1="80" x2="180" y2="80" />
      <line x1="60" y1="20" x2="60" y2="60" />
      <line x1="140" y1="20" x2="140" y2="60" />
      <path d="M100 110 l12 24 26 4 -19 18 5 26 -24 -13 -24 13 5 -26 -19 -18 26 -4z" fill="#FFD84A" />
    </svg>
  );
}

function SpeechBubbleSVG(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 200"
      fill="none"
      stroke="currentColor"
      strokeWidth={10}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* bubble body */}
      <rect x="15" y="20" width="170" height="120" rx="32" fill="var(--sticker-fill)" />
      {/* tail pointing down-left */}
      <path
        d="M40 140 L24 175 L68 148"
        fill="var(--sticker-fill)"
        stroke="currentColor"
        strokeWidth={10}
        strokeLinejoin="round"
      />
      {/* three dots */}
      <circle cx="70" cy="80" r="6" fill="currentColor" stroke="none" />
      <circle cx="100" cy="80" r="6" fill="currentColor" stroke="none" />
      <circle cx="130" cy="80" r="6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function PeaceHandSVG(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 200"
      fill="none"
      stroke="currentColor"
      strokeWidth={10}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* yellow starburst behind hand */}
      <polygon
        points="100,30 110,55 135,45 122,68 148,72 128,88 140,112 115,105 108,132 100,110 92,132 85,105 60,112 72,88 52,72 78,68 65,45 90,55"
        fill="#FFD84A"
        stroke="none"
      />
      {/* index finger */}
      <rect x="68" y="55" width="26" height="82" rx="13" fill="var(--sticker-fill)" stroke="currentColor" strokeWidth={10} />
      {/* middle finger */}
      <rect x="104" y="55" width="26" height="82" rx="13" fill="var(--sticker-fill)" stroke="currentColor" strokeWidth={10} />
      {/* curled fingers + thumb lump */}
      <rect x="135" y="100" width="30" height="54" rx="15" fill="var(--sticker-fill)" stroke="currentColor" strokeWidth={10} />
      {/* wrist */}
      <rect x="68" y="138" width="97" height="40" rx="16" fill="var(--sticker-fill)" stroke="currentColor" strokeWidth={10} />
    </svg>
  );
}

function EyesSVG(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 200"
      fill="none"
      stroke="currentColor"
      strokeWidth={10}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* left eye */}
      <circle cx="65" cy="100" r="45" fill="var(--sticker-fill)" />
      {/* left pupil, slightly right of center for personality */}
      <circle cx="75" cy="100" r="15" fill="currentColor" stroke="none" />
      {/* right eye */}
      <circle cx="145" cy="100" r="45" fill="var(--sticker-fill)" />
      {/* right pupil */}
      <circle cx="155" cy="100" r="15" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ThumbsUpSVG(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 200"
      fill="none"
      stroke="currentColor"
      strokeWidth={10}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* yellow 10-point starburst behind */}
      <polygon
        points="100,18 108,42 130,28 126,53 150,48 138,70 162,74 144,90 160,108 136,106 138,132 116,122 108,148 100,124 92,148 84,122 62,132 64,106 40,108 56,90 38,74 62,70 50,48 74,53 70,28 92,42"
        fill="#FFD84A"
        stroke="none"
      />
      {/* thumb pill (vertical rounded rect) */}
      <rect x="74" y="30" width="44" height="90" rx="22" fill="var(--sticker-fill)" stroke="currentColor" strokeWidth={10} />
      {/* fist body below thumb */}
      <rect x="55" y="110" width="90" height="62" rx="18" fill="var(--sticker-fill)" stroke="currentColor" strokeWidth={10} />
    </svg>
  );
}

function EmptyBoxSVG(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 200"
      fill="none"
      stroke="currentColor"
      strokeWidth={10}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* box body */}
      <rect x="30" y="100" width="140" height="80" rx="8" fill="var(--sticker-fill)" />
      {/* left flap open/flared outward */}
      <path
        d="M30 100 L10 62 L100 62 L100 100"
        fill="var(--sticker-fill)"
        stroke="currentColor"
        strokeWidth={10}
        strokeLinejoin="round"
      />
      {/* right flap open/flared outward */}
      <path
        d="M170 100 L190 62 L100 62 L100 100"
        fill="var(--sticker-fill)"
        stroke="currentColor"
        strokeWidth={10}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloudsSVG(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 700 200"
      fill="none"
      stroke="currentColor"
      strokeWidth={10}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* left cloud fills */}
      <circle cx="130" cy="120" r="55" fill="var(--sticker-fill)" />
      <circle cx="185" cy="100" r="50" fill="var(--sticker-fill)" />
      <circle cx="245" cy="115" r="45" fill="var(--sticker-fill)" />
      <rect x="80" y="130" width="210" height="50" rx="14" fill="var(--sticker-fill)" />
      {/* left cloud outline */}
      <path
        d="M80 155 Q80 125 130 120 Q128 68 185 68 Q200 52 245 70 Q280 72 290 115 Q310 118 290 178 L80 178 Q70 178 80 155z"
        fill="var(--sticker-fill)"
        stroke="currentColor"
        strokeWidth={10}
      />
      {/* right cloud fills */}
      <circle cx="440" cy="130" r="48" fill="var(--sticker-fill)" />
      <circle cx="495" cy="108" r="52" fill="var(--sticker-fill)" />
      <circle cx="558" cy="122" r="46" fill="var(--sticker-fill)" />
      <rect x="392" y="138" width="214" height="46" rx="14" fill="var(--sticker-fill)" />
      {/* right cloud outline */}
      <path
        d="M392 162 Q392 134 440 128 Q438 76 495 76 Q510 58 558 78 Q596 80 604 122 Q624 126 604 182 L392 182 Q380 182 392 162z"
        fill="var(--sticker-fill)"
        stroke="currentColor"
        strokeWidth={10}
      />
    </svg>
  );
}

function BellSVG(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 200"
      fill="none"
      stroke="currentColor"
      strokeWidth={10}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* bell body */}
      <path
        d="M100 20 Q100 20 100 25 Q130 30 148 60 Q162 85 162 115 L38 115 Q38 85 52 60 Q70 30 100 25 Z"
        fill="var(--sticker-fill)"
      />
      {/* bell base rim (yellow ring arc) */}
      <path
        d="M32 115 Q32 138 100 138 Q168 138 168 115"
        fill="none"
        stroke="#FFD84A"
        strokeWidth={12}
      />
      {/* bell outline arc (same path, currentColor) */}
      <path
        d="M100 20 Q100 20 100 25 Q130 30 148 60 Q162 85 162 115 L38 115 Q38 85 52 60 Q70 30 100 25 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth={10}
      />
      {/* base flat edge */}
      <line x1="32" y1="115" x2="168" y2="115" />
      {/* clapper */}
      <circle cx="100" cy="152" r="12" fill="var(--sticker-fill)" stroke="currentColor" strokeWidth={10} />
      {/* hanger at top */}
      <path d="M88 25 Q88 10 100 10 Q112 10 112 25" fill="none" stroke="currentColor" strokeWidth={10} />
    </svg>
  );
}

export const stickerRegistry: Record<StickerName, React.FC<React.SVGProps<SVGSVGElement>>> = {
  calendar: CalendarSVG,
  "speech-bubble": SpeechBubbleSVG,
  "peace-hand": PeaceHandSVG,
  eyes: EyesSVG,
  "thumbs-up": ThumbsUpSVG,
  "empty-box": EmptyBoxSVG,
  clouds: CloudsSVG,
  bell: BellSVG,
};
