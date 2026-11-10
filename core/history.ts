import { FormSchema } from './types';

export interface HistoryEntry {
  formId: string;
  label: string;
  before: FormSchema;
  after: FormSchema;
  timestamp: number;
  coalesceKey?: string;
  committed?: boolean;
}

export interface RecordChangeOptions {
  label?: string;
  coalesceKey?: string;
  timestamp?: number;
  coalesceWindowMs?: number;
}

interface FormHistoryStack {
  past: HistoryEntry[];
  future: HistoryEntry[];
}

function cloneFormSnapshot(form: FormSchema): FormSchema {
  return JSON.parse(JSON.stringify(form)) as FormSchema;
}

/**
 * Compares the authoring-relevant state of two FormSchema snapshots,
 * ignoring volatile fields like `updatedAt` and `revision` so we never push
 * empty no-op history steps.
 */
export function areFormAuthoringStatesEqual(
  a: FormSchema,
  b: FormSchema
): boolean {
  if (a.id !== b.id) return false;
  if (a.title !== b.title) return false;
  if (a.description !== b.description) return false;
  if (a.accentTheme !== b.accentTheme) return false;
  if (a.presentationMode !== b.presentationMode) return false;
  if (JSON.stringify(a.appearance) !== JSON.stringify(b.appearance)) {
    return false;
  }
  if (JSON.stringify(a.welcomeScreen) !== JSON.stringify(b.welcomeScreen)) {
    return false;
  }
  if (JSON.stringify(a.questions) !== JSON.stringify(b.questions)) {
    return false;
  }
  if (
    JSON.stringify(a.completionScreen) !== JSON.stringify(b.completionScreen)
  ) {
    return false;
  }
  if (
    JSON.stringify(a.flowCanvasLayout) !== JSON.stringify(b.flowCanvasLayout)
  ) {
    return false;
  }
  return true;
}

/**
 * Pure, framework-independent per-form Undo/Redo history manager.
 * - Maintains isolated undo/redo stacks per `formId`.
 * - Coalesces rapid keystrokes sharing the same `coalesceKey` within `coalesceWindowMs`
 *   into a single logical undo step.
 * - Bounds history depth per form (`maxDepth`, default 50).
 */
export class FormHistoryManager {
  private stacks = new Map<string, FormHistoryStack>();
  private readonly maxDepth: number;
  private readonly defaultCoalesceWindowMs: number;

  constructor(maxDepth = 50, defaultCoalesceWindowMs = 800) {
    this.maxDepth = Math.max(5, maxDepth);
    this.defaultCoalesceWindowMs = defaultCoalesceWindowMs;
  }

  private getStack(formId: string): FormHistoryStack {
    let stack = this.stacks.get(formId);
    if (!stack) {
      stack = { past: [], future: [] };
      this.stacks.set(formId, stack);
    }
    return stack;
  }

  /**
   * Records an authoring change on `formId`.
   * Returns true if the history stack was updated, or false if `prevForm` and `nextForm`
   * have identical authoring state.
   */
  recordChange(
    formId: string,
    prevForm: FormSchema,
    nextForm: FormSchema,
    options: RecordChangeOptions = {}
  ): boolean {
    if (areFormAuthoringStatesEqual(prevForm, nextForm)) {
      return false;
    }

    const stack = this.getStack(formId);
    const now = options.timestamp ?? Date.now();
    const windowMs = options.coalesceWindowMs ?? this.defaultCoalesceWindowMs;
    const label = options.label || 'Edit form';
    const top = stack.past[stack.past.length - 1];

    // Check if we should coalesce into the top undo entry (e.g., typing into the same input field)
    if (
      top &&
      !top.committed &&
      options.coalesceKey &&
      top.coalesceKey === options.coalesceKey &&
      now - top.timestamp <= windowMs
    ) {
      top.after = cloneFormSnapshot(nextForm);
      top.timestamp = now;
      top.label = label;
      stack.future = [];
      // If the coalesced edit reverted back to the original `before` state, remove the no-op entry
      if (areFormAuthoringStatesEqual(top.before, top.after)) {
        stack.past.pop();
      }
      return true;
    }

    const entry: HistoryEntry = {
      formId,
      label,
      before: cloneFormSnapshot(prevForm),
      after: cloneFormSnapshot(nextForm),
      timestamp: now,
      coalesceKey: options.coalesceKey,
      committed: !options.coalesceKey,
    };

    stack.past.push(entry);
    if (stack.past.length > this.maxDepth) {
      stack.past.shift();
    }

    // Any new authoring action after an undo clears the redo stack for this form
    stack.future = [];
    return true;
  }

  /**
   * Marks the latest entry for `formId` (or all forms) as committed so subsequent
   * edits with the same `coalesceKey` start a fresh undo step (e.g. on input blur).
   */
  commitPending(formId?: string): void {
    if (formId) {
      const stack = this.stacks.get(formId);
      const top = stack?.past[stack.past.length - 1];
      if (top) top.committed = true;
      return;
    }
    for (const stack of this.stacks.values()) {
      const top = stack.past[stack.past.length - 1];
      if (top) top.committed = true;
    }
  }

  canUndo(formId: string): boolean {
    const stack = this.stacks.get(formId);
    return Boolean(stack && stack.past.length > 0);
  }

  canRedo(formId: string): boolean {
    const stack = this.stacks.get(formId);
    return Boolean(stack && stack.future.length > 0);
  }

  getUndoLabel(formId: string): string | null {
    const stack = this.stacks.get(formId);
    if (!stack || stack.past.length === 0) return null;
    return stack.past[stack.past.length - 1].label;
  }

  getRedoLabel(formId: string): string | null {
    const stack = this.stacks.get(formId);
    if (!stack || stack.future.length === 0) return null;
    return stack.future[stack.future.length - 1].label;
  }

  getHistoryCounts(formId: string): { undoCount: number; redoCount: number } {
    const stack = this.stacks.get(formId);
    return {
      undoCount: stack ? stack.past.length : 0,
      redoCount: stack ? stack.future.length : 0,
    };
  }

  /**
   * Undoes the most recent authoring action for `formId`.
   */
  undo(
    formId: string,
    currentForm?: FormSchema
  ): { form: FormSchema; entry: HistoryEntry } | null {
    const stack = this.stacks.get(formId);
    if (!stack || stack.past.length === 0) return null;

    const entry = stack.past.pop()!;
    entry.committed = true;
    if (currentForm) {
      entry.after = cloneFormSnapshot(currentForm);
    }
    stack.future.push(entry);

    return {
      form: cloneFormSnapshot(entry.before),
      entry,
    };
  }

  /**
   * Redoes the most recently undone authoring action for `formId`.
   */
  redo(
    formId: string,
    currentForm?: FormSchema
  ): { form: FormSchema; entry: HistoryEntry } | null {
    const stack = this.stacks.get(formId);
    if (!stack || stack.future.length === 0) return null;

    const entry = stack.future.pop()!;
    entry.committed = true;
    if (currentForm) {
      entry.before = cloneFormSnapshot(currentForm);
    }
    stack.past.push(entry);

    return {
      form: cloneFormSnapshot(entry.after),
      entry,
    };
  }

  clearFormHistory(formId: string): void {
    this.stacks.delete(formId);
  }
}
