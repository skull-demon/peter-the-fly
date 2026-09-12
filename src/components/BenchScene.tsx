import type { RefObject } from "react";

type Props = { active: boolean; motion: boolean; sceneRef: RefObject<HTMLDivElement | null> };

// Overlay coordinates share the photograph's 1568 x 1045 frame.
const inputTraces = [
  "M533 703 C560 548 656 876 734 700 C777 618 783 546 864 523",
  "M546 704 C566 557 684 854 742 754 C811 641 781 601 874 565",
];

export default function BenchScene({ active, motion, sceneRef }: Props) {
  return (
    <div className={`bench-visual ${active ? "is-transmitting" : ""}`} ref={sceneRef}>
      <img
        className="bench-photograph"
        src="/images/flybrain-bench.jpg"
        alt="A small house fly resting on an ivory examination platform, fine wires from its head connected to an intricate antique brass and walnut neural translation machine. Specimen bottles, a coffee cup and scientific notes surround the apparatus."
        width="1568"
        height="1045"
        fetchPriority="high"
      />
      <svg className="bench-animation" viewBox="0 0 1568 1045" preserveAspectRatio="xMidYMid slice" fill="none" aria-hidden="true">
        <defs>{inputTraces.map((d, i) => <path key={i} id={`head-signal-${i}`} d={d} />)}</defs>
        {motion && inputTraces.map((_, i) => (
          <circle key={`${i}-${active}`} r={active ? 3.2 : 2.3} fill="#d4ad71" opacity=".85">
            <animateMotion dur={`${active ? 2.1 : 5.4 + i * 1.7}s`} begin={`${i * .6}s`} repeatCount="indefinite"><mpath href={`#head-signal-${i}`} /></animateMotion>
          </circle>
        ))}
        <g className="meter-needle" style={{ transformOrigin: "936px 382px" }} stroke="#493123" strokeWidth="2.2" opacity=".8"><path d="M936 382 954 330" /><circle cx="936" cy="382" r="4" fill="#9e7a43" strokeWidth="1" /></g>
        <g className="meter-needle secondary" style={{ transformOrigin: "1129px 410px" }} stroke="#493123" strokeWidth="2" opacity=".65"><path d="M1129 410 1155 358" /></g>
        {[940, 981, 1018, 1201, 1244, 1285].map((x, i) => <path className="tube-filament" key={x} d={`M${x} 124v29`} stroke="#ddae65" strokeWidth="1.8" opacity={active ? .7 : .24} style={{ animationDelay: `${i * .45}s` }} />)}
        <g className="coffee-steam" stroke="#f9f1e0" strokeWidth="2.5" opacity=".22"><path d="M219 677c-13-19 14-26 1-46" /><path d="M241 675c13-15-9-23 0-41" /></g>
      </svg>
    </div>
  );
}