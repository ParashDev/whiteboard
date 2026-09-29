import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Check, ClipboardCopy, Copy, Download, Plus, TriangleAlert } from "lucide-react";
import { paintPreview } from "../../engine/preview";
import { ImageStore } from "../../engine/render";
import { usedFiles } from "../../engine/serialize";
import type { BoardElement } from "../../engine/types";
import {
  clipboardImagesSupported,
  copyPngToClipboard,
  downloadBlob,
  exportPngBlob,
  exportToSvg,
  type ExportOptions,
} from "../../engine/export";
import { TEMPLATES, buildScene, type TemplateId } from "../../engine/templates";
import { SHORTCUT_GROUPS } from "../../shared/shortcuts";
import { useEditor, useEditorState } from "../editor-context";
import { Button, KeyCombo, Modal, cx } from "./ui";

function stamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-well p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "focus-ring h-8 min-w-12 rounded-md px-3 text-[13px] font-medium transition-colors duration-100",
            value === o.value ? "bg-island text-ink shadow-island" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="focus-ring flex h-9 w-full items-center justify-between gap-3 rounded-lg text-[13.5px]"
    >
      {label}
      <span className={cx("relative h-5 w-9 rounded-full transition-colors duration-150", checked ? "bg-accent" : "bg-line")}>
        <span
          className={cx(
            "absolute top-0.5 size-4 rounded-full bg-white shadow transition-[left] duration-150",
            checked ? "left-[18px]" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

// Dialogs mount their body only while open. A closed dialog must not subscribe
// to the scene: it would re-render on every pointer move, and an effect that
// sets state there trips React's nested-update limit mid-drag.
const ExportDialog = memo(function ExportDialog() {
  const open = useEditorState((s) => s.dialog === "export");
  return open ? <ExportDialogBody /> : null;
});

function ExportDialogBody() {
  const editor = useEditor();
  const selectedCount = useEditorState((s) => s.selectedIds.length);
  const background = useEditorState((s) => s.canvas.background);
  const sceneVersion = useEditorState((s) => s.sceneVersion);
  const [format, setFormat] = useState<"png" | "svg">("png");
  const [scale, setScale] = useState(2);
  const [withBackground, setWithBackground] = useState(true);
  const [onlySelected, setOnlySelected] = useState(false);
  const [busy, setBusy] = useState(false);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const images = useMemo(() => new ImageStore(), []);

  const elements = useMemo(() => {
    void sceneVersion;
    return onlySelected && selectedCount ? editor.getSelectedElements() : editor.elements;
  }, [editor, onlySelected, selectedCount, sceneVersion]);

  const opts = (s: number): ExportOptions => ({
    elements,
    files: editor.files,
    background: withBackground ? background : null,
    scale: s,
  });

  // The preview is drawn straight into a canvas at its display size — no full-size
  // render and no PNG encoding, which is what made opening this dialog stall.
  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas || !elements.length) return;
    const bg = withBackground ? background : null;
    const paint = () =>
      paintPreview(canvas, elements, { pad: 24, pattern: "plain", maxZoom: 2, background: bg, files: editor.files, images });
    paint();
    let cancelled = false;
    void images.ensure(usedFiles(elements, editor.files)).then(() => {
      if (!cancelled) paint();
    });
    const ro = new ResizeObserver(paint);
    ro.observe(canvas);
    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, [elements, editor, withBackground, background, images]);

  const name = `whiteboard-${stamp()}`;
  const download = async () => {
    setBusy(true);
    try {
      if (format === "png") downloadBlob(await exportPngBlob(opts(scale)), `${name}.png`);
      else downloadBlob(new Blob([await exportToSvg(opts(1))], { type: "image/svg+xml" }), `${name}.svg`);
      editor.closeDialog();
    } catch {
      editor.toast("The image couldn't be created. Try a smaller scale.");
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    try {
      await copyPngToClipboard(() => exportPngBlob(opts(scale)));
      editor.toast("Image copied — paste it anywhere.");
      editor.closeDialog();
    } catch {
      editor.toast("Your browser blocked the clipboard. Download the PNG instead.");
    }
  };

  const empty = elements.length === 0;
  return (
    <Modal open onClose={editor.closeDialog} title="Export image" width={620}>
      <div
        className={cx(
          "relative grid h-[230px] place-items-center overflow-hidden rounded-xl ring-1 ring-line wide:h-[280px]",
          withBackground ? "bg-well" : "checker",
        )}
      >
        {empty ? (
          <span className="text-[13px] text-muted">Nothing to export yet.</span>
        ) : (
          <canvas ref={previewRef} role="img" aria-label="Preview of the exported whiteboard image" className="absolute inset-0 size-full" />
        )}
      </div>
      <div className="mt-4 grid gap-3 wide:grid-cols-2 wide:gap-x-6">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13.5px]">Format</span>
          <Segmented label="Format" value={format} onChange={setFormat} options={[{ value: "png", label: "PNG" }, { value: "svg", label: "SVG" }]} />
        </div>
        <div className={cx("flex items-center justify-between gap-3", format === "svg" && "opacity-40")}>
          <span className="text-[13.5px]">Scale</span>
          <Segmented
            label="Scale"
            value={scale}
            onChange={(v) => format === "png" && setScale(v)}
            options={[
              { value: 1, label: "1×" },
              { value: 2, label: "2×" },
              { value: 3, label: "3×" },
            ]}
          />
        </div>
        <Switch checked={withBackground} onChange={setWithBackground} label="Background" />
        {selectedCount > 0 && <Switch checked={onlySelected} onChange={setOnlySelected} label="Only the selection" />}
      </div>
      <div className="mt-5 flex flex-col-reverse gap-2 wide:flex-row wide:justify-end">
        {format === "png" && clipboardImagesSupported() && (
          <Button onClick={copy} disabled={empty || busy}>
            <ClipboardCopy size={16} strokeWidth={1.75} />
            Copy to clipboard
          </Button>
        )}
        <Button variant="primary" onClick={download} disabled={empty || busy} data-autofocus>
          <Download size={16} strokeWidth={1.75} />
          Download {format.toUpperCase()}
        </Button>
      </div>
    </Modal>
  );
}

const ShareDialog = memo(function ShareDialog() {
  const open = useEditorState((s) => s.dialog === "share");
  return open ? <ShareDialogBody /> : null;
});

function ShareDialogBody() {
  const editor = useEditor();
  const [result, setResult] = useState<{ url: string; droppedImages: number } | { error: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    editor
      .createShareLink()
      .then((r) => !cancelled && setResult(r))
      .catch(() => !cancelled && setResult({ error: "The link couldn't be created." }));
    return () => {
      cancelled = true;
    };
  }, [editor]);

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      editor.toast("Copy blocked — select the link and copy it by hand.");
    }
  };

  return (
    <Modal open onClose={editor.closeDialog} title="Share a copy of this board" width={480}>
      <p className="text-[13.5px] text-muted">The board travels inside the link — nothing is uploaded.</p>
      {!result && <div className="mt-4 h-10 animate-pulse rounded-lg bg-well" />}
      {result && "error" in result && (
        <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-well p-3 text-[13.5px]">
          <TriangleAlert size={17} strokeWidth={1.75} className="mt-0.5 shrink-0 text-danger" />
          {result.error}
        </div>
      )}
      {result && "url" in result && (
        <>
          <div className="mt-4 flex gap-2">
            <input
              readOnly
              value={result.url}
              aria-label="Share link"
              onFocus={(e) => e.currentTarget.select()}
              className="focus-ring h-10 min-w-0 flex-1 rounded-lg bg-well px-3 text-[13px] text-ink outline-none ring-1 ring-line ring-inset"
            />
            <Button variant="primary" onClick={() => copy(result.url)} data-autofocus>
              {copied ? <Check size={16} strokeWidth={2} /> : <Copy size={16} strokeWidth={1.75} />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          {result.droppedImages > 0 && (
            <p className="mt-3 text-[12.5px] text-muted">
              {result.droppedImages === 1 ? "1 image isn't" : `${result.droppedImages} images aren't`} included — links carry drawings only. Save to file to send images.
            </p>
          )}
        </>
      )}
    </Modal>
  );
}

const ShortcutsDialog = memo(function ShortcutsDialog() {
  const editor = useEditor();
  const open = useEditorState((s) => s.dialog === "shortcuts");
  return (
    <Modal open={open} onClose={editor.closeDialog} title="Keyboard shortcuts" width={820}>
      <div className="gap-8 wide:columns-2">
        {SHORTCUT_GROUPS.map((group) => (
          <section key={group.id} className="mb-6 break-inside-avoid">
            <h3 className="mb-2 text-[12px] font-semibold tracking-[0.04em] text-muted uppercase">{group.title}</h3>
            <ul className="divide-y divide-line">
              {group.items.map((item) => (
                <li key={item.label} className="flex items-center justify-between gap-4 py-2 text-[13.5px]">
                  <span>{item.label}</span>
                  <span className="flex flex-wrap justify-end gap-x-2 gap-y-1">
                    {item.keys.map((combo, i) => (
                      <KeyCombo key={i} keys={combo} />
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  );
});

// Built once per session: a template's elements never change.
const sceneCache = new Map<TemplateId, BoardElement[]>();

/** The template itself, painted by the board renderer into a canvas that fills its card. */
function TemplatePreview({ id, label, order }: { id: TemplateId; label: string; order: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let ro: ResizeObserver | null = null;
    // One preview per frame, so opening the dialog never blocks on all four at once.
    const timer = window.setTimeout(() => {
      let scene = sceneCache.get(id);
      if (!scene) {
        scene = buildScene(id);
        sceneCache.set(id, scene);
      }
      const elements = scene;
      const paint = () => paintPreview(canvas, elements, { pad: 22, maxZoom: 1 });
      paint();
      ro = new ResizeObserver(paint);
      ro.observe(canvas);
    }, 16 + order * 34);
    return () => {
      window.clearTimeout(timer);
      ro?.disconnect();
    };
  }, [id, order]);
  return <canvas ref={ref} role="img" aria-label={label} className="absolute inset-0 size-full" />;
}

const TemplatesDialog = memo(function TemplatesDialog() {
  const editor = useEditor();
  const open = useEditorState((s) => s.dialog === "templates");
  return (
    <Modal open={open} onClose={editor.closeDialog} title="Start from a template" width={760}>
      <p className="-mt-1 mb-4 text-[13px] text-muted">Added beside anything already on your board.</p>
      <div className="grid grid-cols-1 gap-4 min-[34rem]:grid-cols-2">
        {TEMPLATES.map((t, i) => (
          <button
            key={t.id}
            type="button"
            onClick={() => editor.insertTemplate(t.id)}
            className="focus-ring group flex flex-col overflow-hidden rounded-xl bg-white text-left ring-1 ring-line transition-[box-shadow] duration-150 hover:ring-active-line"
          >
            <span className="relative block aspect-[16/10] w-full overflow-hidden">
              <TemplatePreview id={t.id} order={i} label={`${t.name} template preview`} />
            </span>
            <span className="flex items-center gap-3 border-t border-line bg-island px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold text-ink">{t.name}</span>
                <span className="block truncate text-[12.5px] text-muted">{t.description}</span>
              </span>
              <span className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-medium text-ink ring-1 ring-line ring-inset transition-colors duration-100 group-hover:bg-accent group-hover:text-accent-ink group-hover:ring-accent">
                <Plus size={14} strokeWidth={2} />
                Insert
              </span>
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
});

function Confirm({
  open,
  title,
  fact,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
  cancelLabel = "Cancel",
}: {
  open: boolean;
  title: string;
  fact: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  cancelLabel?: string;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title} width={400}>
      <p className="text-[13.5px] text-muted">{fact}</p>
      <div className="mt-5 flex flex-col-reverse gap-2 wide:flex-row wide:justify-end">
        <Button onClick={onCancel}>{cancelLabel}</Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} data-autofocus>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

export const Dialogs = memo(function Dialogs() {
  const editor = useEditor();
  const resetOpen = useEditorState((s) => s.dialog === "reset");
  const pendingShared = useEditorState((s) => s.pendingShared);
  return (
    <>
      <ExportDialog />
      <ShareDialog />
      <ShortcutsDialog />
      <TemplatesDialog />
      <Confirm
        open={resetOpen}
        title="Clear the whole board?"
        fact="Undo brings it back."
        confirmLabel="Clear board"
        danger
        onConfirm={editor.resetCanvas}
        onCancel={editor.closeDialog}
      />
      <Confirm
        open={!!pendingShared}
        title="Open the shared board?"
        fact="It replaces what's on your canvas. Undo brings yours back."
        confirmLabel="Open shared board"
        cancelLabel="Keep mine"
        onConfirm={() => editor.resolvePendingShared(true)}
        onCancel={() => editor.resolvePendingShared(false)}
      />
    </>
  );
});
