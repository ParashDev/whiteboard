// The one list of keyboard shortcuts. The in-app shortcuts dialog renders it,
// and the build renders it into /whiteboard-keyboard-shortcuts/ — so the page
// Google indexes and the app can never disagree. Keep it in step with
// Editor.onKeyDown.

export interface Shortcut {
  label: string;
  /** Alternatives; each alternative is a key combination. */
  keys: string[][];
}

export interface ShortcutGroup {
  id: string;
  title: string;
  items: Shortcut[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    id: "tools",
    title: "Tools",
    items: [
      { label: "Select", keys: [["V"], ["1"]] },
      { label: "Hand (move the canvas)", keys: [["H"]] },
      { label: "Rectangle", keys: [["R"], ["2"]] },
      { label: "Diamond", keys: [["D"], ["3"]] },
      { label: "Ellipse", keys: [["O"], ["4"]] },
      { label: "Sticky note", keys: [["N"]] },
      { label: "Arrow", keys: [["A"], ["5"]] },
      { label: "Line", keys: [["L"], ["6"]] },
      { label: "Pen", keys: [["P"], ["7"]] },
      { label: "Highlighter", keys: [["M"]] },
      { label: "Laser pointer", keys: [["K"]] },
      { label: "Text", keys: [["T"], ["8"]] },
      { label: "Insert image", keys: [["9"]] },
      { label: "Eraser", keys: [["E"], ["0"]] },
      { label: "Keep the tool active after drawing", keys: [["Q"]] },
    ],
  },
  {
    id: "editing",
    title: "Editing",
    items: [
      { label: "Undo", keys: [["Ctrl", "Z"]] },
      { label: "Redo", keys: [["Ctrl", "Shift", "Z"], ["Ctrl", "Y"]] },
      { label: "Copy, cut, paste", keys: [["Ctrl", "C"], ["Ctrl", "X"], ["Ctrl", "V"]] },
      { label: "Duplicate", keys: [["Ctrl", "D"], ["Alt", "Drag"]] },
      { label: "Delete", keys: [["Delete"], ["Backspace"]] },
      { label: "Select everything", keys: [["Ctrl", "A"]] },
      { label: "Edit text or a shape's label", keys: [["Enter"], ["Double-click"]] },
      { label: "Group", keys: [["Ctrl", "G"]] },
      { label: "Ungroup", keys: [["Ctrl", "Shift", "G"]] },
      { label: "Nudge by 1 px (10 px with Shift)", keys: [["Arrow keys"]] },
      { label: "Finish a multi-point line", keys: [["Enter"], ["Esc"]] },
      { label: "Deselect / back to Select", keys: [["Esc"]] },
    ],
  },
  {
    id: "drawing",
    title: "While drawing",
    items: [
      { label: "Perfect square or circle", keys: [["Shift", "Drag"]] },
      { label: "Draw from the centre", keys: [["Alt", "Drag"]] },
      { label: "Straight lines at 15° steps", keys: [["Shift", "Drag"]] },
      { label: "Resize keeping proportions", keys: [["Shift", "Drag handle"]] },
      { label: "Rotate in 15° steps", keys: [["Shift", "Drag handle"]] },
    ],
  },
  {
    id: "arrange",
    title: "Arrange",
    items: [
      { label: "Bring forward", keys: [["Ctrl", "]"]] },
      { label: "Send backward", keys: [["Ctrl", "["]] },
      { label: "Bring to front", keys: [["Ctrl", "Shift", "]"]] },
      { label: "Send to back", keys: [["Ctrl", "Shift", "["]] },
    ],
  },
  {
    id: "view",
    title: "Zoom and pan",
    items: [
      { label: "Zoom in", keys: [["Ctrl", "+"]] },
      { label: "Zoom out", keys: [["Ctrl", "−"]] },
      { label: "Zoom to 100%", keys: [["Ctrl", "0"]] },
      { label: "Zoom to fit the whole board", keys: [["Shift", "1"]] },
      { label: "Zoom to the selection", keys: [["Shift", "2"]] },
      { label: "Pan the canvas", keys: [["Space", "Drag"], ["Scroll"]] },
      { label: "Zoom with the mouse or trackpad", keys: [["Ctrl", "Scroll"], ["Pinch"]] },
    ],
  },
  {
    id: "file",
    title: "File",
    items: [
      { label: "Save the board to a file", keys: [["Ctrl", "S"]] },
      { label: "Open a board file", keys: [["Ctrl", "O"]] },
      { label: "Export as PNG or SVG", keys: [["Ctrl", "Shift", "E"]] },
      { label: "Show keyboard shortcuts", keys: [["?"]] },
    ],
  },
];
