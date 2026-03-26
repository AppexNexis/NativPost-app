/**
 * NativPost Branded Loading Screen
 *
 * Shows the NativPost "N" logo mark with a rotating ring animation.
 * Used during auth resolution, page transitions, and initial load.
 */

export function NativPostLoader({ message }: { message?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#FCFCFD]">
      <div className="relative flex items-center justify-center">
        {/* Spinning ring */}
        <svg
          className="absolute size-[88px] animate-spin"
          style={{ animationDuration: '1.4s' }}
          viewBox="0 0 88 88"
          fill="none"
        >
          <circle
            cx="44"
            cy="44"
            r="40"
            stroke="#864FFE"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="200 60"
            opacity="0.3"
          />
          <circle
            cx="44"
            cy="44"
            r="40"
            stroke="#864FFE"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="80 180"
          />
        </svg>

        {/* NativPost "N" logo mark — matches logo.svg */}
        <svg
          className="size-10"
          viewBox="0 0 44 44"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="22" cy="22" r="22" fill="#864FFE" />
          {/* Stylized N mark */}
          <path
            d="M14 30V14h3.5l9 12V14H30v16h-3.5l-9-12v12H14z"
            fill="white"
          />
          {/* Small publish arrow at top-right */}
          <path
            d="M31 11l2.5-2.5M33.5 8.5V12M33.5 8.5H30"
            stroke="white"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.8"
          />
        </svg>
      </div>

      {message && (
        <p className="mt-6 text-sm font-medium text-[#1A1A1C]/40">
          {message}
        </p>
      )}
    </div>
  );
}

/**
 * Minimal inline loader for smaller contexts (page sections, cards).
 */
export function NativPostSpinner({ className = 'size-6' }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      style={{ animationDuration: '1.2s' }}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="#864FFE"
        strokeWidth="2"
        opacity="0.2"
      />
      <path
        d="M12 2a10 10 0 019.8 8"
        stroke="#864FFE"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
