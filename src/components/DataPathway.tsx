import { useEffect, useState, type RefObject } from "react";

type Props = { shellRef: RefObject<HTMLDivElement | null>; sceneRef: RefObject<HTMLDivElement | null>; portRef: RefObject<HTMLSpanElement | null>; active: boolean; motion: boolean };

export default function DataPathway({ shellRef, sceneRef, portRef, active, motion }: Props) {
  const [path, setPath] = useState("");
  useEffect(() => {
    const shell = shellRef.current;
    const scene = sceneRef.current;
    const port = portRef.current;
    if (!shell || !scene || !port) return;
    const update = () => {
      if (window.innerWidth < 980) { setPath(""); return; }
      const root = shell.getBoundingClientRect();
      const image = scene.getBoundingClientRect();
      const socket = port.getBoundingClientRect();
      const scale = Math.max(image.width / 1568, image.height / 1045);
      // Match the cable to the actual jack, including object-fit cropping.
      const x = image.left - root.left + (image.width - 1568 * scale) / 2 + 1350 * scale;
      const y = image.top - root.top + (image.height - 1045 * scale) / 2 + 489 * scale;
      const seam = image.right - root.left - 7;
      const endX = socket.left - root.left + socket.width / 2;
      const endY = socket.top - root.top + socket.height / 2;
      setPath(`M${x},${y} C${x + 27},${y} ${seam},${y + 16} ${seam},${y - 22} L${seam},${endY + 22} Q${seam},${endY} ${seam + 22},${endY} L${endX},${endY}`);
    };
    const observer = new ResizeObserver(update);
    observer.observe(shell);
    observer.observe(scene);
    observer.observe(port);
    window.addEventListener("resize", update);
    document.fonts.ready.then(update);
    update();
    return () => { observer.disconnect(); window.removeEventListener("resize", update); };
  }, [shellRef, sceneRef, portRef]);

  if (!path) return null;
  return (
    <svg className="connecting-wire" aria-hidden="true">
      <defs><path id="translation-cable" d={path} /></defs>
      <use href="#translation-cable" stroke="#3a2417" strokeWidth="3.2" opacity=".15" transform="translate(0 2)" />
      <use href="#translation-cable" stroke="#906743" strokeWidth="1.7" />
      <use href="#translation-cable" stroke="#ceb18a" strokeWidth=".45" transform="translate(0 -.5)" />
      {motion && [0, 1].map((n) => (
        <circle key={`${n}-${active}`} r="2.3" fill="#cfa160" opacity=".95">
          <animateMotion dur={active ? "2.7s" : "7s"} begin={`${n * -3.5}s`} repeatCount="indefinite"><mpath href="#translation-cable" /></animateMotion>
        </circle>
      ))}
    </svg>
  );
}