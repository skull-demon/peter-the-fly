export function EtchedFly({ className = "" }: { className?: string }) {
  return (
    <svg className={`etched-fly ${className}`} viewBox="0 0 60 52" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth=".9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M27 24C21 9 8 6 6 10C2 19 17 30 27 29M33 24C39 9 52 6 54 10C58 19 43 30 33 29" />
        <path d="M27 26 8 12M24 25 11 20M22 20 16 12M33 26l19-14M36 25l13-5M38 20l6-8" opacity=".65" />
        <path d="m25 29-11 4-8 9m20-7-8 6-1 8m17-20 11 4 8 9m-19-7 8 6 1 8M26 20l-6-6-1-7m15 13 6-6 1-7" />
        <path d="M26 32c-3 8 0 15 4 17 4-2 7-9 4-17" />
        <path d="M26 36h8m-8 4h8m-6 4h4" opacity=".75" />
        <ellipse cx="30" cy="26" rx="5" ry="8" />
        <path d="m28 22-1 10m3-11v12m2-11 1 10" />
        <ellipse cx="26.5" cy="16" rx="3.3" ry="4" /><ellipse cx="33.5" cy="16" rx="3.3" ry="4" />
        <path d="m28 12-2-5m6 5 2-5m-5 12 1 3 1-3" />
      </g>
    </svg>
  );
}

export function ArrowIcon({ diagonal = false }: { diagonal?: boolean }) {
  return <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><g stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">{diagonal ? <path d="M5 15 15 5M5 5h10v10" /> : <path d="M3 10h14m-5-5 5 5-5 5" />}</g></svg>;
}

export function Flourish() {
  return <svg className="flourish" viewBox="0 0 140 16" fill="none" aria-hidden="true"><g stroke="currentColor" strokeWidth=".7"><path d="M0 8h44c12 0 13-7 21-4l5 4-5 4c-8 3-9-4-21-4M140 8H96c-12 0-13-7-21-4l-5 4 5 4c8 3 9-4 21-4" /><path d="m70 1 3 7-3 7-3-7Z" /></g></svg>;
}

export function PauseIcon({ paused }: { paused: boolean }) {
  return <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">{paused ? <path d="m4 2 6 4-6 4V2Z" fill="currentColor" /> : <g stroke="currentColor" strokeWidth="1.2"><path d="M4 2v8M8 2v8" /></g>}</svg>;
}

export function CloseIcon() {
  return <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.2" /></svg>;
}

export function SoundIcon({ on }: { on: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M3 8v4h3l4 3.5v-11L6 8H3Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      {on ? (
        <g stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
          <path d="M13 7.5c1.6 1.4 1.6 3.6 0 5" />
          <path d="M15.5 5.5c2.7 2.5 2.7 6.5 0 9" />
        </g>
      ) : (
        <path d="m13 8 4 4m0-4-4 4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      )}
    </svg>
  );
}