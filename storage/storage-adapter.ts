import {
  FormSchema,
  FormResponseRecord,
  FormRevisionSnapshot,
  generateId,
} from '@/core/types';
import {
  AnalyticsEvent,
  appendAnalyticsEventsWithRetention,
} from '@/core/analytics';
import {
  exportWorkspaceBackup,
  parseWorkspaceBackup,
  hasFormContentChanged,
} from '@/core/migrations';
import { createRevisionSnapshot } from '@/core/submissions';

// Persisted key: retain it so existing device backups remain readable.
export const WORKSPACE_STORAGE_KEY = 'fieldnote_studio_workspace_v1';

export interface WorkspaceState {
  forms: FormSchema[];
  responses: FormResponseRecord[];
  revisions: FormRevisionSnapshot[];
  analyticsEvents?: AnalyticsEvent[];
}

export interface FormStorageAdapter {
  loadWorkspace(fallbackSeed: () => WorkspaceState): WorkspaceState;
  saveWorkspace(state: WorkspaceState): { ok: boolean; error?: string };
  listForms(): FormSchema[];
  getForm(formId: string): FormSchema | undefined;
  saveForm(form: FormSchema): FormSchema;
  deleteForm(formId: string): void;
  getRevisions(formId?: string): FormRevisionSnapshot[];
  saveRevisionSnapshot(snapshot: FormRevisionSnapshot): void;
  listSubmissions(formId?: string): FormResponseRecord[];
  saveSubmission(
    submission: FormResponseRecord,
    revisionSnapshot?: FormRevisionSnapshot
  ): void;
  deleteSubmission(submissionId: string): void;
  clearFormSubmissions(formId: string): void;
  listAnalyticsEvents(formId?: string): AnalyticsEvent[];
  recordAnalyticsEvent(event: AnalyticsEvent): void;
  recordAnalyticsEvents(events: AnalyticsEvent[]): void;
  clearFormAnalyticsEvents(formId: string): void;
  exportData(singleFormId?: string): string;
  importData(rawJson: string): {
    valid: boolean;
    state?: WorkspaceState;
    error?: string;
    warnings?: string[];
  };
}

/**
 * Pure helper that updates a form in a WorkspaceState, automatically preserving
 * an immutable FormRevisionSnapshot of the previous revision if any submission
 * references that revision and the form's content/structure actually changed.
 */
export function applyFormUpdateWithRevisionIntegrity(
  state: WorkspaceState,
  updatedForm: FormSchema
): WorkspaceState {
  const existing = state.forms.find((f) => f.id === updatedForm.id);
  if (!existing) {
    return {
      ...state,
      forms: [updatedForm, ...state.forms],
    };
  }

  const contentChanged = hasFormContentChanged(existing, updatedForm);
  const currentRev = existing.revision || 1;
  const isReferencedBySubmissions = state.responses.some(
    (r) => r.formId === existing.id && (r.formRevision || 1) === currentRev
  );

  let nextRevisions = state.revisions;
  let nextRevNumber = updatedForm.revision || currentRev;

  if (contentChanged && isReferencedBySubmissions) {
    const alreadySaved = state.revisions.some(
      (rev) => rev.formId === existing.id && rev.revision === currentRev
    );
    if (!alreadySaved) {
      nextRevisions = [...state.revisions, createRevisionSnapshot(existing)];
    }
    nextRevNumber = currentRev + 1;
  }

  const finalForm: FormSchema = {
    ...updatedForm,
    revision: nextRevNumber,
    questionOrder: updatedForm.questions.map((q) => q.id),
    updatedAt: new Date().toISOString(),
  };

  return {
    ...state,
    forms: state.forms.map((f) => (f.id === finalForm.id ? finalForm : f)),
    revisions: nextRevisions,
  };
}

/**
 * Framework-independent in-memory storage adapter for unit tests and headless usage.
 */
export class InMemoryStorageAdapter implements FormStorageAdapter {
  private state: WorkspaceState = {
    forms: [],
    responses: [],
    revisions: [],
    analyticsEvents: [],
  };

  constructor(initialState?: Partial<WorkspaceState>) {
    if (initialState) {
      this.state = {
        forms: initialState.forms || [],
        responses: initialState.responses || [],
        revisions: initialState.revisions || [],
        analyticsEvents: appendAnalyticsEventsWithRetention(
          [],
          initialState.analyticsEvents || []
        ),
      };
    }
  }

  loadWorkspace(fallbackSeed: () => WorkspaceState): WorkspaceState {
    if (this.state.forms.length === 0 && this.state.responses.length === 0) {
      const seeded = fallbackSeed();
      this.state = {
        forms: seeded.forms || [],
        responses: seeded.responses || [],
        revisions: seeded.revisions || [],
        analyticsEvents: appendAnalyticsEventsWithRetention(
          [],
          seeded.analyticsEvents || []
        ),
      };
    }
    return this.state;
  }

  saveWorkspace(state: WorkspaceState): { ok: boolean; error?: string } {
    this.state = {
      forms: [...state.forms],
      responses: [...state.responses],
      revisions: [...state.revisions],
      analyticsEvents: appendAnalyticsEventsWithRetention(
        [],
        state.analyticsEvents ?? this.state.analyticsEvents ?? []
      ),
    };
    return { ok: true };
  }

  listForms(): FormSchema[] {
    return this.state.forms;
  }

  getForm(formId: string): FormSchema | undefined {
    return this.state.forms.find((f) => f.id === formId);
  }

  saveForm(form: FormSchema): FormSchema {
    this.state = applyFormUpdateWithRevisionIntegrity(this.state, form);
    return this.getForm(form.id)!;
  }

  deleteForm(formId: string): void {
    this.state = {
      forms: this.state.forms.filter((f) => f.id !== formId),
      responses: this.state.responses.filter((r) => r.formId !== formId),
      revisions: this.state.revisions.filter((rev) => rev.formId !== formId),
      analyticsEvents: (this.state.analyticsEvents || []).filter(
        (ev) => ev.formId !== formId
      ),
    };
  }

  getRevisions(formId?: string): FormRevisionSnapshot[] {
    if (!formId) return this.state.revisions;
    return this.state.revisions.filter((r) => r.formId === formId);
  }

  saveRevisionSnapshot(snapshot: FormRevisionSnapshot): void {
    const exists = this.state.revisions.some(
      (r) => r.formId === snapshot.formId && r.revision === snapshot.revision
    );
    if (!exists) {
      this.state = {
        ...this.state,
        revisions: [...this.state.revisions, snapshot],
      };
    }
  }

  listSubmissions(formId?: string): FormResponseRecord[] {
    if (!formId) return this.state.responses;
    return this.state.responses.filter((r) => r.formId === formId);
  }

  saveSubmission(
    submission: FormResponseRecord,
    revisionSnapshot?: FormRevisionSnapshot
  ): void {
    if (revisionSnapshot) {
      this.saveRevisionSnapshot(revisionSnapshot);
    }
    this.state = {
      ...this.state,
      responses: [submission, ...this.state.responses],
    };
  }

  deleteSubmission(submissionId: string): void {
    this.state = {
      ...this.state,
      responses: this.state.responses.filter((r) => r.id !== submissionId),
    };
  }

  clearFormSubmissions(formId: string): void {
    this.state = {
      ...this.state,
      responses: this.state.responses.filter((r) => r.formId !== formId),
    };
  }

  listAnalyticsEvents(formId?: string): AnalyticsEvent[] {
    const all = this.state.analyticsEvents || [];
    if (!formId) return all;
    return all.filter((e) => e.formId === formId);
  }

  recordAnalyticsEvent(event: AnalyticsEvent): void {
    this.recordAnalyticsEvents([event]);
  }

  recordAnalyticsEvents(events: AnalyticsEvent[]): void {
    this.state = {
      ...this.state,
      analyticsEvents: appendAnalyticsEventsWithRetention(
        this.state.analyticsEvents || [],
        events
      ),
    };
  }

  clearFormAnalyticsEvents(formId: string): void {
    this.state = {
      ...this.state,
      analyticsEvents: (this.state.analyticsEvents || []).filter(
        (e) => e.formId !== formId
      ),
    };
  }

  exportData(singleFormId?: string): string {
    if (singleFormId) {
      const target = this.getForm(singleFormId);
      if (!target) return exportWorkspaceBackup([], [], [], []);
      const relatedResponses = this.listSubmissions(singleFormId);
      const relatedRevisions = this.getRevisions(singleFormId);
      const relatedEvents = this.listAnalyticsEvents(singleFormId);
      return exportWorkspaceBackup(
        [target],
        relatedResponses,
        relatedRevisions,
        relatedEvents
      );
    }
    return exportWorkspaceBackup(
      this.state.forms,
      this.state.responses,
      this.state.revisions,
      this.state.analyticsEvents || []
    );
  }

  importData(rawJson: string): {
    valid: boolean;
    state?: WorkspaceState;
    error?: string;
    warnings?: string[];
  } {
    const parsed = parseWorkspaceBackup(rawJson);
    if (!parsed.valid || !parsed.forms) {
      return { valid: false, error: parsed.error };
    }
    this.state = {
      forms: parsed.forms,
      responses: parsed.responses || [],
      revisions: parsed.revisions || [],
      analyticsEvents: appendAnalyticsEventsWithRetention(
        [],
        parsed.analyticsEvents || []
      ),
    };
    return {
      valid: true,
      state: this.state,
      warnings: parsed.warnings,
    };
  }
}

/**
 * Browser localStorage adapter with automatic schema migration, bounded analytics
 * retention, and quota error handling.
 */
export class BrowserLocalStorageAdapter implements FormStorageAdapter {
  private memoryCache = new InMemoryStorageAdapter();
  private storageKey: string;
  private unreadableData: string | null = null;

  constructor(storageKey = WORKSPACE_STORAGE_KEY) {
    this.storageKey = storageKey;
  }

  loadWorkspace(fallbackSeed: () => WorkspaceState): WorkspaceState {
    if (typeof window === 'undefined') {
      return this.memoryCache.loadWorkspace(fallbackSeed);
    }
    try {
      const raw = window.localStorage.getItem(this.storageKey);
      if (raw) {
        const imported = this.memoryCache.importData(raw);
        if (imported.valid && imported.state) {
          this.unreadableData = null;
          return imported.state;
        }
        // Preserve the original bytes until an explicit restore can retain a copy.
        this.unreadableData = raw;
        return this.memoryCache.loadWorkspace(fallbackSeed);
      }
    } catch {
      // Malformed or inaccessible localStorage falls back safely to seed
    }
    const seeded = fallbackSeed();
    this.saveWorkspace(seeded);
    return this.memoryCache.loadWorkspace(() => seeded);
  }

  saveWorkspace(state: WorkspaceState): { ok: boolean; error?: string } {
    this.memoryCache.saveWorkspace(state);
    if (this.unreadableData !== null) return { ok: false, error: 'Saved data could not be opened. Export a backup before restoring.' };
    if (typeof window === 'undefined') {
      return { ok: true };
    }

    const boundedEvents = this.memoryCache.listAnalyticsEvents();
    try {
      const serialized = exportWorkspaceBackup(
        state.forms,
        state.responses,
        state.revisions,
        boundedEvents
      );
      window.localStorage.setItem(this.storageKey, serialized);
      return { ok: true };
    } catch {
      // If analytics events exist and caused a quota overflow, try pruning older events first
      if (boundedEvents.length > 0) {
        try {
          const reducedEvents = boundedEvents.slice(
            Math.floor(boundedEvents.length / 2)
          );
          const fallbackSerialized = exportWorkspaceBackup(
            state.forms,
            state.responses,
            state.revisions,
            reducedEvents
          );
          window.localStorage.setItem(this.storageKey, fallbackSerialized);
          return { ok: true };
        } catch {
          // Proceed to return quota error
        }
      }
      return {
        ok: false,
        error:
          'Device storage is full. Export a backup before removing data to free up space.',
      };
    }
  }

  listForms(): FormSchema[] {
    return this.memoryCache.listForms();
  }

  getForm(formId: string): FormSchema | undefined {
    return this.memoryCache.getForm(formId);
  }

  saveForm(form: FormSchema): FormSchema {
    const saved = this.memoryCache.saveForm(form);
    this.saveWorkspace({
      forms: this.memoryCache.listForms(),
      responses: this.memoryCache.listSubmissions(),
      revisions: this.memoryCache.getRevisions(),
      analyticsEvents: this.memoryCache.listAnalyticsEvents(),
    });
    return saved;
  }

  deleteForm(formId: string): void {
    this.memoryCache.deleteForm(formId);
    this.saveWorkspace({
      forms: this.memoryCache.listForms(),
      responses: this.memoryCache.listSubmissions(),
      revisions: this.memoryCache.getRevisions(),
      analyticsEvents: this.memoryCache.listAnalyticsEvents(),
    });
  }

  getRevisions(formId?: string): FormRevisionSnapshot[] {
    return this.memoryCache.getRevisions(formId);
  }

  saveRevisionSnapshot(snapshot: FormRevisionSnapshot): void {
    this.memoryCache.saveRevisionSnapshot(snapshot);
    this.saveWorkspace({
      forms: this.memoryCache.listForms(),
      responses: this.memoryCache.listSubmissions(),
      revisions: this.memoryCache.getRevisions(),
      analyticsEvents: this.memoryCache.listAnalyticsEvents(),
    });
  }

  listSubmissions(formId?: string): FormResponseRecord[] {
    return this.memoryCache.listSubmissions(formId);
  }

  saveSubmission(
    submission: FormResponseRecord,
    revisionSnapshot?: FormRevisionSnapshot
  ): void {
    this.memoryCache.saveSubmission(submission, revisionSnapshot);
    this.saveWorkspace({
      forms: this.memoryCache.listForms(),
      responses: this.memoryCache.listSubmissions(),
      revisions: this.memoryCache.getRevisions(),
      analyticsEvents: this.memoryCache.listAnalyticsEvents(),
    });
  }

  deleteSubmission(submissionId: string): void {
    this.memoryCache.deleteSubmission(submissionId);
    this.saveWorkspace({
      forms: this.memoryCache.listForms(),
      responses: this.memoryCache.listSubmissions(),
      revisions: this.memoryCache.getRevisions(),
      analyticsEvents: this.memoryCache.listAnalyticsEvents(),
    });
  }

  clearFormSubmissions(formId: string): void {
    this.memoryCache.clearFormSubmissions(formId);
    this.saveWorkspace({
      forms: this.memoryCache.listForms(),
      responses: this.memoryCache.listSubmissions(),
      revisions: this.memoryCache.getRevisions(),
      analyticsEvents: this.memoryCache.listAnalyticsEvents(),
    });
  }

  listAnalyticsEvents(formId?: string): AnalyticsEvent[] {
    return this.memoryCache.listAnalyticsEvents(formId);
  }

  recordAnalyticsEvent(event: AnalyticsEvent): void {
    this.memoryCache.recordAnalyticsEvent(event);
    this.saveWorkspace({
      forms: this.memoryCache.listForms(),
      responses: this.memoryCache.listSubmissions(),
      revisions: this.memoryCache.getRevisions(),
      analyticsEvents: this.memoryCache.listAnalyticsEvents(),
    });
  }

  recordAnalyticsEvents(events: AnalyticsEvent[]): void {
    this.memoryCache.recordAnalyticsEvents(events);
    this.saveWorkspace({
      forms: this.memoryCache.listForms(),
      responses: this.memoryCache.listSubmissions(),
      revisions: this.memoryCache.getRevisions(),
      analyticsEvents: this.memoryCache.listAnalyticsEvents(),
    });
  }

  clearFormAnalyticsEvents(formId: string): void {
    this.memoryCache.clearFormAnalyticsEvents(formId);
    this.saveWorkspace({
      forms: this.memoryCache.listForms(),
      responses: this.memoryCache.listSubmissions(),
      revisions: this.memoryCache.getRevisions(),
      analyticsEvents: this.memoryCache.listAnalyticsEvents(),
    });
  }

  exportData(singleFormId?: string): string {
    if (this.unreadableData !== null && !singleFormId) return this.unreadableData;
    return this.memoryCache.exportData(singleFormId);
  }

  importData(rawJson: string): {
    valid: boolean;
    state?: WorkspaceState;
    error?: string;
    warnings?: string[];
  } {
    const res = this.memoryCache.importData(rawJson);
    if (res.valid && res.state) {
      if (this.unreadableData !== null) {
        try {
          const recoveryKey = `${this.storageKey}_recovery_${generateId()}`;
          if (window.localStorage.getItem(recoveryKey) !== null) throw new Error('Recovery copy already exists.');
          window.localStorage.setItem(recoveryKey, this.unreadableData);
        } catch {
          return { valid: false, error: 'The original saved data could not be preserved. Export a backup and free device storage before restoring.' };
        }
        this.unreadableData = null;
      }
      this.saveWorkspace(res.state);
    }
    return res;
  }
}
