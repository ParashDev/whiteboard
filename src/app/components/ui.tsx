import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { keyLabel } from "../editor-context";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type Placement = "bottom-start" | "bottom-end" | "bottom" | "top" | "top-start" | "right-start";

/** Anchored floating panel in a portal. Closes on outside pointer-down and Escape. */
export function Popover({
  anchor,
  open,
  onClose,
  placement = "bottom-start",
  offset = 8,
  className,
  children,
  label,
}: {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  placement?: Placement;
  offset?: number;
  className?: string;
  children: ReactNode;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      const p = ref.current?.getBoundingClientRect();
      if (!a || !p) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = a.left;
      let top = a.bottom + offset;
      if (placement === "bottom-end") left = a.right - p.width;
      if (placement === "bottom" || placement === "top") left = a.left + a.width / 2 - p.width / 2;
      if (placement === "top" || placement === "top-start") top = a.top - p.height - offset;
      if (placement === "right-start") {
        left = a.right + offset;
        top = a.top;
      }
      if (top + p.height > vh - 8 && placement.startsWith("bottom")) top = a.top - p.height - offset;
      if (top < 8) top = placement.startsWith("top") ? a.bottom + offset : 8;
      left = Math.max(8, Math.min(left, vw - p.width - 8));
      top = Math.max(8, Math.min(top, vh - p.height - 8));
      setPos({ left, top });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, anchor, placement, offset]);

  useEffect(() => {
    if (!open) return;
    let cleanup = () => {};
    // Attach on the next frame so the click that opened the popover does not close it.
    const frame = requestAnimationFrame(() => {
      const onDown = (e: PointerEvent) => {
        const t = e.target as Node;
        if (ref.current?.contains(t) || anchor.current?.contains(t)) return;
        onClose();
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
      };
      document.addEventListener("pointerdown", onDown, true);
      document.addEventListener("keydown", onKey);
      cleanup = () => {
        document.removeEventListener("pointerdown", onDown, true);
        document.removeEventListener("keydown", onKey);
      };
    });
    return () => {
      cancelAnimationFrame(frame);
      cleanup();
    };
  }, [open, onClose, anchor]);

  if (!open) return null;
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      style={{ position: "fixed", left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
      className={cx("z-50 rounded-xl bg-island text-ink shadow-pop pop-in", className)}
    >
      {children}
    </div>,
    document.body,
  );
}

/** Centered dialog. Custom (not a library) so opening it never stalls the canvas. */
export const Modal = memo(function Modal({
  open,
  onClose,
  title,
  children,
  width = 440,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => {
      const first = ref.current?.querySelector<HTMLElement>("[data-autofocus], button, input, a[href]");
      (first ?? ref.current)?.focus();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/30 p-2 wide:items-center wide:p-6"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{ maxWidth: width }}
        className="pop-in thin-scroll flex max-h-[92dvh] w-full flex-col overflow-y-auto rounded-2xl bg-island text-ink shadow-pop outline-none"
      >
        <div className="flex items-center justify-between gap-4 px-5 pt-4 pb-2">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="focus-ring -mr-2 grid size-9 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>
        <div className="px-5 pb-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
});

export function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-md bg-well px-1.5 font-sans text-[11px] font-medium text-muted">
      {keyLabel(children)}
    </kbd>
  );
}

export function KeyCombo({ keys }: { keys: string[] }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      {keys.map((k) => (
        <Kbd key={k}>{k}</Kbd>
      ))}
    </span>
  );
}

/** A square icon button used across the islands. `active` gets the soft teal treatment. */
export function IconButton({
  active,
  size = "md",
  className,
  children,
  ...rest
}: ComponentProps<"button"> & { active?: boolean; size?: "sm" | "md" | "lg" }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      {...rest}
      className={cx(
        "focus-ring relative grid shrink-0 place-items-center rounded-lg border transition-colors duration-100 disabled:pointer-events-none disabled:opacity-35",
        size === "sm" && "size-8",
        size === "md" && "size-9",
        size === "lg" && "size-10",
        active ? "border-active-line bg-active text-active-ink" : "border-transparent text-ink hover:bg-hover",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Primary/secondary buttons for dialogs — they look like buttons: filled or outlined, with an icon. */
export function Button({
  variant = "secondary",
  className,
  children,
  ...rest
}: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "danger" }) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        "focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-[background-color,scale] duration-100 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40",
        variant === "primary" && "bg-accent text-accent-ink hover:brightness-110",
        variant === "secondary" && "bg-well text-ink ring-1 ring-line ring-inset hover:bg-hover",
        variant === "danger" && "bg-danger text-white hover:brightness-110",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function useToggle(initial = false): [boolean, () => void, (v: boolean) => void] {
  const [on, setOn] = useState(initial);
  const toggle = useCallback(() => setOn((v) => !v), []);
  return [on, toggle, setOn];
}
