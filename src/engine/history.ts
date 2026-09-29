import type { BoardElement, FileMap } from "./types";

export interface Snapshot {
  elements: BoardElement[];
  files: FileMap;
}

const LIMIT = 200;

/** Undo/redo over immutable snapshots: storing a snapshot is storing two references. */
export class History {
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private committed: Snapshot;

  constructor(initial: Snapshot) {
    this.committed = initial;
  }

  /** Record the current document as a new step if it differs from the last one. */
  commit(current: Snapshot): boolean {
    if (current.elements === this.committed.elements && current.files === this.committed.files) return false;
    this.undoStack.push(this.committed);
    if (this.undoStack.length > LIMIT) this.undoStack.shift();
    this.redoStack = [];
    this.committed = current;
    return true;
  }

  undo(current: Snapshot): Snapshot | null {
    // An uncommitted change in flight is rolled back first.
    if (current.elements !== this.committed.elements || current.files !== this.committed.files) {
      return this.committed;
    }
    const prev = this.undoStack.pop();
    if (!prev) return null;
    this.redoStack.push(this.committed);
    this.committed = prev;
    return prev;
  }

  redo(): Snapshot | null {
    const next = this.redoStack.pop();
    if (!next) return null;
    this.undoStack.push(this.committed);
    this.committed = next;
    return next;
  }

  reset(initial: Snapshot): void {
    this.undoStack = [];
    this.redoStack = [];
    this.committed = initial;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}
