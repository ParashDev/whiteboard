// Small glyphs for style settings that no icon library draws (stroke widths,
// sloppiness, arrowheads…). 20×20, currentColor, same 1.75 stroke as the
// lucide icons beside them.

import type { ReactNode, SVGProps } from "react";
import type { Arrowhead } from "../../engine/types";

type P = SVGProps<SVGSVGElement>;

const base = (props: P): P => ({
  width: 20,
  height: 20,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  ...props,
});

export const StrokeWidthIcon = ({ w, ...p }: P & { w: number }) => (
  <svg {...base(p)}>
    <path d="M4 10h12" strokeWidth={w === 1 ? 1.25 : w === 2 ? 2.5 : 4.25} />
  </svg>
);

export const StrokeStyleIcon = ({ kind, ...p }: P & { kind: "solid" | "dashed" | "dotted" }) => (
  <svg {...base(p)}>
    <path d="M3.5 10h13" strokeDasharray={kind === "dashed" ? "3.5 3" : kind === "dotted" ? "0.2 3.2" : undefined} strokeWidth={2} />
  </svg>
);

export const SloppinessIcon = ({ level, ...p }: P & { level: 0 | 1 | 2 }) => (
  <svg {...base(p)}>
    {level === 0 && <path d="M3 13c2.5-3 4.5-5.5 7-5.5S14.5 10 17 7" />}
    {level === 1 && (
      <>
        <path d="M3 13c2.5-3 4.5-5.5 7-5.5S14.5 10 17 7" />
        <path d="M3.5 14c2.4-3.4 4.6-5.4 6.8-5.3s4.1 2.1 6.6-2" strokeWidth={1.1} />
      </>
    )}
    {level === 2 && (
      <>
        <path d="M3 13c1-1.5 2.5-3.7 3.7-4.4 1.5-.9 2.3.6 3.4.2 1.4-.5 2.2-3.4 3.6-3.1 1 .2 1.7 1.3 3.3.3" />
        <path d="M3.4 14.5c1.8-3 3-5.3 5.1-5.1 1.7.2 2.3 1.5 4 .3 1.2-.9 2.1-2.9 4-2.5" strokeWidth={1.1} />
      </>
    )}
  </svg>
);

export const EdgesIcon = ({ round, ...p }: P & { round: boolean }) => (
  <svg {...base(p)}>
    {round ? <path d="M4 16V9a5 5 0 0 1 5-5h7" /> : <path d="M4 16V4h12" />}
    <path d="M9 16h.01M13 16h.01M16 16h.01M16 12h.01M16 8.5h.01" strokeWidth={2.2} />
  </svg>
);

export const FillIcon = ({ kind, ...p }: P & { kind: "solid" | "hachure" | "cross-hatch" }) => (
  <svg {...base(p)}>
    <rect x="3.5" y="3.5" width="13" height="13" rx="2.5" fill={kind === "solid" ? "currentColor" : "none"} fillOpacity={0.9} />
    {kind !== "solid" && <path d="M6 16.5l10.5-10.5M3.5 13 13 3.5M10.5 16.5l6-6" strokeWidth={1.2} />}
    {kind === "cross-hatch" && <path d="M6 3.5l10.5 10.5M3.5 7l9.5 9.5M3.5 11.5l5 5" strokeWidth={1.2} />}
  </svg>
);

export const ArrowTypeIcon = ({ curved, ...p }: P & { curved: boolean }) => (
  <svg {...base(p)}>
    {curved ? <path d="M3.5 15.5C5 8 10 5.5 16 5" /> : <path d="M3.5 15.5 16 5" />}
    <path d="M11.5 4.5 16 5l-1.7 4.3" />
  </svg>
);

export const ArrowheadIcon = ({ head, flip, ...p }: P & { head: Arrowhead; flip?: boolean }) => (
  <svg {...base(p)} style={flip ? { transform: "scaleX(-1)" } : undefined}>
    <path d={head === "none" ? "M3 10h14" : head === "dot" || head === "triangle" ? "M3 10h10" : "M3 10h13.5"} />
    {head === "arrow" && <path d="M12 6l4.5 4-4.5 4" />}
    {head === "triangle" && <path d="M12 6l5 4-5 4z" fill="currentColor" />}
    {head === "dot" && <circle cx="14.5" cy="10" r="2.6" fill="currentColor" />}
    {head === "bar" && <path d="M16.5 5.5v9" />}
  </svg>
);

export const PatternIcon = ({ kind, ...p }: P & { kind: "plain" | "dots" | "grid" }) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="14" height="14" rx="3" strokeWidth={1.5} />
    {kind === "dots" && <path d="M7 7h.01M10 7h.01M13 7h.01M7 10h.01M10 10h.01M13 10h.01M7 13h.01M10 13h.01M13 13h.01" strokeWidth={2} />}
    {kind === "grid" && <path d="M8 3.5v13M12 3.5v13M3.5 8h13M3.5 12h13" strokeWidth={1.1} />}
  </svg>
);

/** Toolbar-sized shape icons for symbols lucide doesn't draw, on its 24-unit grid. */
function shapeIcon(body: ReactNode, name: string) {
  const Icon = ({ size = 24, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {body}
    </svg>
  );
  Icon.displayName = name;
  return Icon;
}

export const ParallelogramIcon = shapeIcon(<path d="M7.5 5h13.5l-4.5 14H3z" />, "ParallelogramIcon");
export const TerminatorIcon = shapeIcon(<rect x="2.5" y="7" width="19" height="10" rx="5" />, "TerminatorIcon");
export const DocumentShapeIcon = shapeIcon(<path d="M4 4h16v12.5c-4-2.5-7 4.5-11.5 2-1.6-.9-3-.8-4.5.1z" />, "DocumentShapeIcon");
export const SubroutineIcon = shapeIcon(
  <>
    <rect x="3" y="6" width="18" height="12" rx="1" />
    <path d="M6.5 6v12M17.5 6v12" />
  </>,
  "SubroutineIcon",
);
export const ManualInputIcon = shapeIcon(<path d="M3 10.5 21 5v14H3z" />, "ManualInputIcon");
export const TrapezoidIcon = shapeIcon(<path d="M3 6h18l-3.5 12h-11z" />, "TrapezoidIcon");
export const DelayIcon = shapeIcon(<path d="M4 5h9a7 7 0 0 1 0 14H4z" />, "DelayIcon");
export const OffPageIcon = shapeIcon(<path d="M5 3.5h14v10.5l-7 6.5-7-6.5z" />, "OffPageIcon");
export const ActorIcon = shapeIcon(
  <>
    <circle cx="12" cy="5" r="2.5" />
    <path d="M12 7.5v7.5M6 11h12M7.5 21l4.5-6 4.5 6" />
  </>,
  "ActorIcon",
);

/** The whiteboard mark: a teal tile with a marker stroke across it. */
export const Logo = ({ size = 28, ...p }: P & { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden {...p}>
    <rect width="32" height="32" rx="8" fill="#0d9488" />
    <path d="M7.5 19.5c2.4-5.2 4.6-7.4 6.3-6.2 1.9 1.3.1 6 2.1 6.6 2.1.6 3.9-5.2 8.6-6.4" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8.5 24.5h15" stroke="#fff" strokeOpacity=".55" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
