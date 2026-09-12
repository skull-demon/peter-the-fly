import { useEffect, useRef } from "react";

export type BootFlyPose = "cruise" | "landing" | "sitting";

type Props = {
  pose: BootFlyPose;
  className?: string;
};

/**
 * A small house fly in the plate style (matches EtchedFly's etching
 * language, but with a soft sepia body like the bench photo). It has a
 * cruising pose (gentle bob + wing flutter), a landing pose (descend,
 * wings settle), and a sitting pose (tiny idle twitches + occasional
 * wing flick).
 */
export default function BootFly({ pose, className }: Props) {
  const wingRef = useRef<SVGGElement>(null);
  const bodyRef = useRef<SVGGElement>(null);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const loop = (now: number) => {
      const t = (now - start) / 1000;
      if (wingRef.current) {
        const isSitting = pose === "sitting";
        const isLanding = pose === "landing";
        const flutter = isSitting
          ? Math.sin(t * 9) * 3 + (Math.sin(t * 0.9) > 0.985 ? 14 : 0)
          : Math.sin(t * (isLanding ? 30 : 42)) * (isLanding ? 10 : 16);
        wingRef.current.setAttribute("transform", `rotate(${flutter} 31 27)`);
      }
      if (bodyRef.current) {
        const isSitting = pose === "sitting";
        const isLanding = pose === "landing";
        const bob = isSitting
          ? Math.sin(t * 2.1) * 0.35
          : isLanding
            ? 0
            : Math.sin(t * 2.3) * 1.6;
        bodyRef.current.setAttribute("transform", `translate(0 ${bob})`);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [pose]);

  return (
    <svg
      className={className}
      viewBox="0 0 64 56"
      role="img"
      aria-label="A small house fly"
    >
      <g ref={bodyRef}>
        {/* wings (behind body) */}
        <g ref={wingRef} opacity=".8">
          <path
            d="M31 27 C18 20 8 22 6 28 C10 34 24 34 31 29 Z"
            fill="#e7dfc9"
            opacity=".55"
            stroke="#74684f"
            strokeWidth=".8"
          />
          <path
            d="M33 27 C46 20 56 22 58 28 C54 34 40 34 33 29 Z"
            fill="#e7dfc9"
            opacity=".55"
            stroke="#74684f"
            strokeWidth=".8"
          />
        </g>
        {/* legs */}
        <g stroke="#3a3128" strokeWidth="1.4" strokeLinecap="round" opacity=".9">
          <path d="M26 36 C23 40 20 42 17 43" />
          <path d="M29 37 C27 42 25 45 23 47" />
          <path d="M32 37 C32 42 32 45 31 48" />
          <path d="M35 37 C37 42 39 45 41 47" />
          <path d="M38 36 C41 40 44 42 47 43" />
        </g>
        {/* body: thorax + abdomen */}
        <ellipse cx="31" cy="30" rx="7.5" ry="6" fill="#3a3128" />
        <ellipse cx="26" cy="33.5" rx="7" ry="5" fill="#2e2a22" />
        {/* bristle hints */}
        <g stroke="#57503f" strokeWidth=".6" opacity=".8">
          <path d="M28 25 l-1.5 -2.5" />
          <path d="M32 24.5 l.5 -3" />
          <path d="M35 25.5 l2 -2.2" />
        </g>
        {/* eyes */}
        <circle cx="37.2" cy="26.5" r="3.1" fill="#6b3128" />
        <circle cx="37.2" cy="26.5" r="3.1" fill="none" stroke="#4e231c" strokeWidth=".7" />
        {/* halteres */}
        <circle cx="24.5" cy="30" r="1.1" fill="#8d7a55" />
      </g>
    </svg>
  );
}
