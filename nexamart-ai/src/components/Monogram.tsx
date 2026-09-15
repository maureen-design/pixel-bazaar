interface MonogramProps {
  className?: string;
}

export function Monogram({ className = 'w-8 h-8' }: MonogramProps) {
  return (
    <div className={`${className} flex-shrink-0`}>
      <svg
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
        aria-label="NexaMart logo"
        role="img"
      >
        {/* Dark navy background */}
        <rect width="64" height="64" rx="14" fill="#0B1A2B" />

        {/* N structure — left vertical + diagonal + shared center vertical */}
        <path
          d="M14 16v32M14 16l22 32M36 16v32"
          stroke="#2563EB"
          strokeWidth="4.5"
          strokeLinecap="square"
        />

        {/* M structure — right vertical + diagonal + shared center vertical */}
        <path
          d="M50 16v32M50 16L28 48M36 16v32"
          stroke="#D4A853"
          strokeWidth="4.5"
          strokeLinecap="square"
        />

        {/* Diamond accent at the junction — subtle African-geometric detail */}
        <rect
          x="33"
          y="29"
          width="6"
          height="6"
          rx="1"
          transform="rotate(45 36 32)"
          fill="#D4A853"
          opacity="0.5"
        />
      </svg>
    </div>
  );
}
