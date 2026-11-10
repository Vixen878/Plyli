// Generated from Plyli core/conflicts.ts; run pnpm sdk:sync in Plyli.
import type { FormSchema } from './types.js';
export interface FieldConflict { field: string; local: unknown; remote: unknown }
export function mergeFormChanges(base: FormSchema, local: FormSchema, remote: FormSchema, choices: Record<string, 'local' | 'remote'> = {}) {
  const conflicts: FieldConflict[] = [];
  function pick<T>(field: string, original: T, mine: T, theirs: T): T {
    const equal = (a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);
    if (equal(mine, original)) return theirs;
    if (equal(theirs, original) || equal(mine, theirs)) return mine;
    conflicts.push({ field, local: mine, remote: theirs });
    return choices[field] === 'remote' ? theirs : mine;
  }
  const questions = pick('questions', base.questions, local.questions, remote.questions);
  const merged: FormSchema = {
    ...remote,
    title: pick('title', base.title, local.title, remote.title), description: pick('description', base.description, local.description, remote.description),
    questions, questionOrder: questions.map((q) => q.id),
    accentTheme: pick('accentTheme', base.accentTheme, local.accentTheme, remote.accentTheme),
    appearance: pick('appearance', base.appearance, local.appearance, remote.appearance),
    welcomeScreen: pick('welcomeScreen', base.welcomeScreen, local.welcomeScreen, remote.welcomeScreen),
    completionScreen: pick('completionScreen', base.completionScreen, local.completionScreen, remote.completionScreen),
    metadata: pick('metadata', base.metadata, local.metadata, remote.metadata),
    presentationMode: pick('presentationMode', base.presentationMode, local.presentationMode, remote.presentationMode),
    flowCanvasLayout: pick('flowCanvasLayout', base.flowCanvasLayout, local.flowCanvasLayout, remote.flowCanvasLayout),
  };
  return { merged, conflicts };
}
