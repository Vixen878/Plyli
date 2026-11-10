'use client';
import { ArrowLeft, Eye, Undo2, Redo2, Check, Code2, Archive, Settings2 } from 'lucide-react';
import { PaperButton } from './paper-primitives';
const workspaceLinks = [
  { mode: 'library', label: 'Forms', icon: null }, { mode: 'developers', label: 'Developers', icon: Code2 },
  { mode: 'archive', label: 'Archive', icon: Archive }, { mode: 'data', label: 'Data settings', icon: Settings2 },
] as const;
export type WorkspaceMode = 'library' | 'build' | 'flow' | 'design' | 'responses' | 'preview' | 'integration' | 'developers' | 'archive' | 'data';

interface WorkspaceHeaderProps {
  userName: string; title?: string; mode: WorkspaceMode; busy: boolean; dirty: boolean; published: boolean;
  canUndo: boolean; canRedo: boolean;
  onNavigate: (mode: WorkspaceMode) => void; onSave: () => void; onPublish: () => void;
  onTitleChange: (title: string) => void;
  onUndo: () => void; onRedo: () => void; onSignOut: () => void;
}
export function WorkspaceHeader(props: WorkspaceHeaderProps) {
  const editing = props.title !== undefined && !['library', 'developers', 'archive', 'data'].includes(props.mode);
  return <header className="sticky top-0 z-40 bg-[#FFFDF9] border-b-2 border-[#2A2623]">
    <div className="px-4 sm:px-6 lg:px-8 min-h-16 py-3 flex items-center gap-4">
      <button className="font-display text-xl font-extrabold shrink-0 focus-visible:outline-2" onClick={() => props.onNavigate('library')}>Plyli<span className="text-[#E86D52]">.</span></button>
      {editing && <div className="flex items-center gap-3 min-w-0 border-l border-[#2A2623]/20 pl-4">
        <button aria-label="Back to forms" title="Back to forms" onClick={() => props.onNavigate('library')} className="p-2 rounded-lg hover:bg-[#F2ECE1] focus-visible:outline-2"><ArrowLeft size={17} /></button>
        <div className="min-w-0 w-40 sm:w-64 lg:w-80"><label htmlFor="workspace-form-title" className="sr-only">Form title</label><input id="workspace-form-title" aria-label="Form title" maxLength={255} value={props.title ?? ''} onChange={(event) => props.onTitleChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} disabled={props.busy} placeholder="Untitled form" className="w-full font-display text-sm sm:text-base font-bold text-[#2A2623] bg-transparent border-b border-dashed border-transparent hover:border-[#2A2623]/40 focus:border-[#E86D52] focus:outline-none px-1 py-0.5 truncate" /><div className="text-[11px] text-[#6E655E] flex items-center gap-1 px-1">{props.dirty ? <><span className="w-1.5 h-1.5 bg-[#D4573B] rounded-full" />Unsaved changes</> : <><Check size={11} />Saved{props.published ? ' · Published' : ' · Draft'}</>}</div></div>
      </div>}
      <div className="ml-auto flex items-center gap-2 sm:gap-4 shrink-0">
        {!editing && <nav aria-label="Workspace" className="hidden sm:flex gap-1">{workspaceLinks.map(({ mode, label, icon: Icon }) => <button key={mode} aria-current={props.mode === mode ? 'page' : undefined} onClick={() => props.onNavigate(mode)} className={`inline-flex items-center gap-2 text-sm px-3 py-2 rounded-lg transition-colors focus-visible:outline-2 ${props.mode === mode ? 'bg-[#F2ECE1] font-semibold' : 'text-[#6E655E] hover:bg-[#F2ECE1]'}`}>{Icon && <Icon size={15} />}{label}</button>)}</nav>}
        <div className="flex items-center gap-2 border-l border-[#2A2623]/15 pl-3 sm:pl-4">
          <span className="hidden md:inline text-sm font-semibold max-w-40 truncate" title={props.userName}>{props.userName}</span>
          <PaperButton size="sm" variant="ivory" disabled={props.busy} onClick={props.onSignOut}>Sign out</PaperButton>
        </div>
      </div>
    </div>
    {editing ? <div className="px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-3 border-t border-[#2A2623]/10">
      <nav aria-label="Form editor" className="flex gap-1 overflow-x-auto">{(['build', 'flow', 'design', 'responses', 'integration'] as const).map((mode) => <button key={mode} onClick={() => props.onNavigate(mode)} aria-current={props.mode === mode ? 'page' : undefined} className={`px-3 sm:px-4 py-3 text-sm whitespace-nowrap border-b-2 transition-colors focus-visible:outline-2 ${props.mode === mode ? 'border-[#D4573B] text-[#2A2623] font-semibold' : 'border-transparent text-[#6E655E] hover:text-[#2A2623]'}`}>{mode === 'integration' ? 'Integration' : mode[0].toUpperCase() + mode.slice(1)}</button>)}</nav>
      <div className="flex items-center gap-2 py-2 ml-auto">
        <div className="flex mr-2 border-r border-[#2A2623]/15 pr-3"><button title="Undo" aria-label="Undo" disabled={!props.canUndo || props.busy} onClick={props.onUndo} className="p-2 rounded-lg hover:bg-[#F2ECE1] disabled:opacity-30 focus-visible:outline-2"><Undo2 size={16} /></button><button title="Redo" aria-label="Redo" disabled={!props.canRedo || props.busy} onClick={props.onRedo} className="p-2 rounded-lg hover:bg-[#F2ECE1] disabled:opacity-30 focus-visible:outline-2"><Redo2 size={16} /></button></div>
        <PaperButton size="sm" variant="ghost" disabled={props.busy} onClick={() => props.onNavigate('preview')}><Eye size={14} />Preview</PaperButton>
        <PaperButton size="sm" disabled={props.busy || !props.dirty} onClick={props.onSave}>{props.busy ? 'Working…' : 'Save draft'}</PaperButton>
        <PaperButton size="sm" variant="coral" disabled={props.busy || props.dirty} onClick={props.onPublish}>{props.published ? 'Publish changes' : 'Publish'}</PaperButton>
      </div>
    </div> : <nav aria-label="Workspace on mobile" className="sm:hidden flex overflow-x-auto px-4 pb-2 gap-4">{(['library', 'developers', 'archive', 'data'] as const).map((mode) => <button key={mode} className={`py-2 text-sm whitespace-nowrap ${mode === props.mode ? 'font-bold underline underline-offset-4' : ''}`} onClick={() => props.onNavigate(mode)}>{mode === 'library' ? 'Forms' : mode === 'data' ? 'Data settings' : mode[0].toUpperCase() + mode.slice(1)}</button>)}</nav>}
  </header>;
}
