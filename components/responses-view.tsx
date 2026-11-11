'use client';

import React, { useState, useMemo } from 'react';
import {
  FormSchema,
  FormResponseRecord,
  FormRevisionSnapshot,
  AnalyticsEvent,
  AnalyticsDateRangePreset,
  QUESTION_TYPE_META,
  normalizeAnswerString,
  resolveHistoricalSubmissionItems,
  computeFormAnalyticsReport,
  buildCampaignUrl,
  exportSubmissionsToCsv,
  exportSubmissionsToJson,
  deriveFlowGraph,
} from '@/lib/form-engine';
import { campaignFields } from '@/lib/campaign-fields';
import { PaperButton, SketchEmptyFolderGraphic } from './paper-primitives';
import {
  Play,
  Trash2,
  Download,
  BarChart3,
  ListChecks,
  Clock,
  CheckCircle2,
  History,
  Compass,
  Link2,
  Copy,
  Check,
  RotateCcw,
  Filter,
  Search,
  ShieldCheck,
  TrendingUp,
  AlertCircle,
  GitBranch,
  Smartphone,
  Monitor,
  Tablet,
  Globe,
  FileSpreadsheet,
  FileJson,
  Eye,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

export type AnalyticsSectionTab =
  | 'overview'
  | 'questions'
  | 'acquisition'
  | 'submissions';

type AcquisitionDimensionTab =
  | 'bySource'
  | 'byMedium'
  | 'byCampaign'
  | 'byContent'
  | 'byTerm'
  | 'byReferrer';

const questionSections = [
  ['metrics', 'Question metrics', BarChart3],
  ['reach', 'Question reach', ListChecks],
  ['branches', 'Branch paths', GitBranch],
] as const;

const acquisitionSections = [
  ['traffic', 'Traffic sources', Compass],
  ['links', 'Campaign links', Link2],
  ['questions', 'Question completion', BarChart3],
] as const;

function ResponseSectionLayout<View extends string>({ label, sections, current, onChange, children }: {
  label: string;
  sections: readonly (readonly [View, string, LucideIcon])[];
  current: View;
  onChange: (view: View) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[13.5rem_minmax(0,1fr)]">
      <nav aria-label={label} className="flex flex-wrap gap-1 rounded-xl border border-[#2A2623]/25 bg-[#FFFDF9] p-1.5 lg:grid">
        {sections.map(([id, title, Icon]) => (
          <button
            key={id}
            type="button"
            aria-current={current === id ? 'true' : undefined}
            onClick={() => onChange(id)}
            className={`flex min-h-10 items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm font-semibold leading-tight focus-visible:outline-2 ${
              current === id ? 'border-[#2A2623]/60 bg-[#F6D97A]/50' : 'border-transparent hover:bg-[#FAF6F0]'
            }`}
          >
            <Icon size={16} aria-hidden="true" className="shrink-0" />
            {title}
          </button>
        ))}
      </nav>
      <div className="min-w-0 space-y-5">{children}</div>
    </div>
  );
}

interface ResponsesViewProps {
  persistenceMode?: 'local' | 'account';
  publicFormUrl?: string;
  form: FormSchema;
  responses: FormResponseRecord[];
  revisions?: FormRevisionSnapshot[];
  analyticsEvents?: AnalyticsEvent[];
  onLaunchPreview: (simulatedUtmQuery?: string) => void;
  onDeleteResponse: (responseId: string) => void;
  onClearFormResponses: (formId: string) => void;
  onClearFormAnalytics?: (formId: string) => void;
  onExportFormResponses: (formId: string) => void;
  onNavigateToFlowCanvas?: () => void;
  responseTrash?: { onOpen: () => void; content: React.ReactNode; busy: boolean };
}

export function ResponsesView({
  persistenceMode = 'local',
  publicFormUrl,
  form,
  responses,
  revisions = [],
  analyticsEvents = [],
  onLaunchPreview,
  onDeleteResponse,
  onClearFormResponses,
  onClearFormAnalytics,
  onExportFormResponses,
  onNavigateToFlowCanvas,
  responseTrash,
}: ResponsesViewProps) {
  const [activeTab, setActiveTab] = useState<AnalyticsSectionTab>('submissions');
  const [questionView, setQuestionView] = useState<(typeof questionSections)[number][0]>('metrics');
  const [dateRangePreset, setDateRangePreset] =
    useState<AnalyticsDateRangePreset>('all');

  const [acquisitionView, setAcquisitionView] = useState<(typeof acquisitionSections)[number][0]>('traffic');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [mediumFilter, setMediumFilter] = useState<string>('all');
  const [campaignFilter, setCampaignFilter] = useState<string>('all');
  const [dimensionTab, setDimensionTab] =
    useState<AcquisitionDimensionTab>('bySource');

  // Campaign Link Builder state (derived default URL without useEffect setState)
  const [customBaseUrl, setCustomBaseUrl] = useState<string | null>(null);
  const effectiveBaseUrl =
    customBaseUrl !== null
      ? customBaseUrl
      : publicFormUrl ?? '';

  const [utmSourceInput, setUtmSourceInput] = useState<string>('');
  const [utmMediumInput, setUtmMediumInput] = useState<string>('');
  const [utmCampaignInput, setUtmCampaignInput] =
    useState<string>('');
  const [utmContentInput, setUtmContentInput] = useState<string>('');
  const [utmTermInput, setUtmTermInput] = useState<string>('');
  const [copiedCampaignUrl, setCopiedCampaignUrl] = useState<boolean>(false);

  // Submissions tab filters & selection
  const [submissionSearch, setSubmissionSearch] = useState<string>('');
  const [oldestFirst, setOldestFirst] = useState(false);
  const [submissionLimit, setSubmissionLimit] = useState(40);
  const [deletePending, setDeletePending] = useState<string | null>(null);
  const [submissionRevisionFilter, setSubmissionRevisionFilter] =
    useState<string>('all');
  const [submissionSourceFilter, setSubmissionSourceFilter] =
    useState<string>('all');
  const [submissionViewportFilter, setSubmissionViewportFilter] =
    useState<string>('all');
  const [selectedResponseId, setSelectedResponseId] = useState<string | null>(
    null
  );
  const [confirmClearAll, setConfirmClearAll] = useState<boolean>(false);

  // Compute full analytics report for the current filter selection
  const report = useMemo(() => {
    return computeFormAnalyticsReport(form, activeTab === 'submissions' ? [] : responses, activeTab === 'submissions' ? [] : analyticsEvents, {
      dateRange: dateRangePreset,
      utmSource: sourceFilter === 'all' ? undefined : sourceFilter,
      utmMedium: mediumFilter === 'all' ? undefined : mediumFilter,
      utmCampaign: campaignFilter === 'all' ? undefined : campaignFilter,
    });
  }, [
    activeTab,
    form,
    responses,
    analyticsEvents,
    dateRangePreset,
    sourceFilter,
    mediumFilter,
    campaignFilter,
  ]);

  const flowGraph = useMemo(() => deriveFlowGraph(form), [form]);
  const hasSessionData = report.overview.hasTrackedBehavioralEvents;

  // Campaign URL builder result
  const campaignBuildResult = useMemo(() => {
    return buildCampaignUrl({
      baseUrl: effectiveBaseUrl,
      formId: persistenceMode === 'local' ? form.id : undefined,
      utm_source: utmSourceInput,
      utm_medium: utmMediumInput,
      utm_campaign: utmCampaignInput,
      utm_content: utmContentInput,
      utm_term: utmTermInput,
    });
  }, [
    effectiveBaseUrl,
    form.id,
    persistenceMode,
    utmSourceInput,
    utmMediumInput,
    utmCampaignInput,
    utmContentInput,
    utmTermInput,
  ]);

  // Form responses sorted newest first
  const allFormResponses = useMemo(() => {
    return responses
      .filter((r) => r.formId === form.id)
      .sort(
        (a, b) =>
          new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
      );
  }, [responses, form.id]);

  const filteredSubmissions = useMemo(() => {
    const ordered = oldestFirst ? [...allFormResponses].reverse() : allFormResponses;
    return ordered.filter((resp) => {
      if (
        submissionRevisionFilter !== 'all' &&
        String(resp.formRevision || 1) !== submissionRevisionFilter
      ) {
        return false;
      }
      if (submissionSourceFilter !== 'all') {
        const respSource =
          resp.attribution?.utm.utm_source ||
          (resp.attribution ? 'Direct / Unknown' : 'Not recorded');
        if (respSource !== submissionSourceFilter) return false;
      }
      if (
        submissionViewportFilter !== 'all' &&
        (resp.viewport || 'unknown') !== submissionViewportFilter
      ) {
        return false;
      }
      if (submissionSearch.trim()) {
        const needle = submissionSearch.trim().toLowerCase();
        const answerText = Object.values(resp.answers)
          .map((v) => normalizeAnswerString(v))
          .join(' ')
          .toLowerCase();
        const utmText = [
          resp.attribution?.utm.utm_source,
          resp.attribution?.utm.utm_medium,
          resp.attribution?.utm.utm_campaign,
          resp.attribution?.referrerOrigin,
          resp.id,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!answerText.includes(needle) && !utmText.includes(needle)) {
          return false;
        }
      }
      return true;
    });
  }, [
    allFormResponses,
    oldestFirst,
    submissionRevisionFilter,
    submissionSourceFilter,
    submissionViewportFilter,
    submissionSearch,
  ]);

  const selectedResponse =
    filteredSubmissions.find((r) => r.id === selectedResponseId) ||
    filteredSubmissions[0] ||
    null;

  const resolvedHistoricalItems = selectedResponse
    ? resolveHistoricalSubmissionItems(form, selectedResponse, revisions)
    : [];

  const availableRevisions = useMemo(() => {
    const set = new Set<number>();
    allFormResponses.forEach((r) => set.add(r.formRevision || 1));
    return Array.from(set).sort((a, b) => b - a);
  }, [allFormResponses]);

  const availableSubmissionSources = useMemo(() => {
    const set = new Set<string>();
    allFormResponses.forEach((r) => {
      if (r.attribution?.utm.utm_source) {
        set.add(r.attribution.utm.utm_source);
      } else if (r.attribution) {
        set.add('Direct / Unknown');
      } else {
        set.add('Not recorded');
      }
    });
    return Array.from(set);
  }, [allFormResponses]);

  const formatTimestamp = (iso: string) => {
    try {
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(iso));
    } catch {
      return 'Recently';
    }
  };

  const formatRate = (rate: number | null | undefined) =>
    rate === null || rate === undefined ? '—' : `${rate}%`;

  const formatSeconds = (sec: number | null | undefined) =>
    sec === null || sec === undefined ? '—' : `${sec}s`;

  const handleDownloadCsv = () => {
    const csvContent = exportSubmissionsToCsv(
      form,
      filteredSubmissions,
      revisions
    );
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${form.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-submissions.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadJson = () => {
    const jsonContent = exportSubmissionsToJson(
      form,
      filteredSubmissions,
      revisions
    );
    const blob = new Blob([jsonContent], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${form.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-submissions.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyCampaignUrl = async () => {
    if (!campaignBuildResult.valid || !campaignBuildResult.url) return;
    try {
      await navigator.clipboard.writeText(campaignBuildResult.url);
      setCopiedCampaignUrl(true);
      setTimeout(() => setCopiedCampaignUrl(false), 1800);
    } catch {
      // Ignore clipboard failures in restricted environments
    }
  };

  const handleResetCampaignFields = () => {
    setUtmSourceInput('');
    setUtmMediumInput('');
    setUtmCampaignInput('');
    setUtmContentInput('');
    setUtmTermInput('');
  };

  const handleTestCampaignInPreview = () => {
    if (!campaignBuildResult.valid) return;
    try {
      const parsed = new URL(campaignBuildResult.url);
      onLaunchPreview(parsed.search);
    } catch {
      onLaunchPreview();
    }
  };

  const { overview, questions: questionMetrics, funnel, acquisition } = report;

  const activeDimensionRows = acquisition[dimensionTab];
  const campaignInputs = {
    utm_source: [utmSourceInput, setUtmSourceInput],
    utm_medium: [utmMediumInput, setUtmMediumInput],
    utm_campaign: [utmCampaignInput, setUtmCampaignInput],
    utm_content: [utmContentInput, setUtmContentInput],
    utm_term: [utmTermInput, setUtmTermInput],
  } as const;
  const campaignErrors = Object.values(campaignBuildResult.errors).filter(
    Boolean
  );
  const hasResponseData = allFormResponses.length > 0 || analyticsEvents.length > 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[#2A2623]/15 pb-3">
        <div>
          <h2 className="font-display text-2xl font-bold">Responses</h2>
          <p className="mt-1 text-xs text-[#6E655E]">{persistenceMode === 'account' ? 'Review published submissions and form performance.' : 'Review preview responses saved on this device.'}</p>
        </div>
        {activeTab === 'submissions' && (responseTrash || hasResponseData) && (
          <details className="max-w-xs">
            <summary className="cursor-pointer text-sm font-semibold underline underline-offset-4">Manage data</summary>
            <div className="mt-2 space-y-2 rounded-lg border border-[#2A2623]/25 bg-[#FFFDF9] p-3">
              {hasResponseData && <PaperButton variant="ghost" size="sm" onClick={() => onExportFormResponses(form.id)}><Download size={14} />Export all JSON</PaperButton>}
              {responseTrash && <PaperButton variant="ghost" size="sm" disabled={responseTrash.busy} aria-expanded={Boolean(responseTrash.content)} aria-controls={responseTrash.content ? 'response-trash' : undefined} onClick={responseTrash.onOpen}><Trash2 size={14} />Response trash</PaperButton>}
              {hasResponseData && (confirmClearAll ? <>
                <p className="text-xs">{persistenceMode === 'account' ? 'Move all responses to recoverable trash?' : 'Clear all responses and analytics from this device?'}</p>
                <PaperButton variant="coral" size="sm" onClick={() => { onClearFormResponses(form.id); onClearFormAnalytics?.(form.id); setConfirmClearAll(false); }}>Confirm</PaperButton>
                <PaperButton variant="ghost" size="sm" onClick={() => setConfirmClearAll(false)}>Cancel</PaperButton>
              </> : <PaperButton variant="ghost" size="sm" onClick={() => setConfirmClearAll(true)}><Trash2 size={14} />{persistenceMode === 'account' ? 'Trash all responses' : 'Clear data'}</PaperButton>)}
            </div>
          </details>
        )}
      </header>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#2A2623]/15 pb-3">
        <div role="tablist" aria-label="Response views" className="flex flex-wrap items-center gap-1">
          {([
            ['submissions', 'Submissions', ListChecks],
            ['overview', 'Overview', TrendingUp],
            ['questions', 'Questions & Flow', BarChart3],
            ['acquisition', 'Acquisition', Compass],
          ] as const).map(([tab, label, Icon], index, tabs) => (
            <button type="button" role="tab" key={tab} id={'response-tab-' + tab}
              aria-selected={activeTab === tab} aria-controls={'response-panel-' + tab}
              tabIndex={activeTab === tab ? 0 : -1} data-testid={'analytics-tab-' + tab}
              onClick={() => setActiveTab(tab)}
              onKeyDown={(event) => {
                const offsets: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, Home: -index, End: tabs.length - index - 1 };
                if (!(event.key in offsets)) return;
                event.preventDefault();
                const next = tabs[(index + offsets[event.key] + tabs.length) % tabs.length][0];
                setActiveTab(next);
                document.getElementById('response-tab-' + next)?.focus();
              }}
              className={'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold focus-visible:outline-2 ' + (activeTab === tab ? 'border-[#2A2623] bg-[#F6D97A]/50' : 'border-transparent text-[#6E655E] hover:bg-[#FFFDF9]')}>
              <Icon size={14} />{label}
            </button>
          ))}
        </div>
        {activeTab !== 'submissions' && <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#6E655E]">
            <Filter className="w-3.5 h-3.5 text-[#2A2623]" />
            <label htmlFor="analytics-date-range">Period:</label>
          </div>
          <select
            id="analytics-date-range"
            data-testid="analytics-date-range-select"
            value={dateRangePreset}
            onChange={(e) =>
              setDateRangePreset(e.target.value as AnalyticsDateRangePreset)
            }
            className="px-2.5 py-1.5 rounded-xl bg-[#FAF6F0] border-2 border-[#2A2623] text-xs font-bold text-[#2A2623] cursor-pointer"
          >
            <option value="all">All Time</option>
            <option value="30d">Last 30 Days</option>
            <option value="7d">Last 7 Days</option>
            <option value="today">Today</option>
          </select>

          {(sourceFilter !== 'all' ||
            mediumFilter !== 'all' ||
            campaignFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSourceFilter('all');
                setMediumFilter('all');
                setCampaignFilter('all');
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#FDECE8] border border-[#2A2623] text-xs font-bold text-[#D4573B] cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset UTM Filters</span>
            </button>
          )}
        </div>}
      </div>

      {/* =====================================================================
          TAB 1: OVERVIEW
         ===================================================================== */}
      {activeTab === 'overview' && (
        <div className="space-y-6" role="tabpanel" id="response-panel-overview" aria-labelledby="response-tab-overview" data-testid="analytics-section-overview">
          {!hasSessionData && <p className="rounded-xl bg-[#FDF7E2] px-4 py-3 text-sm">No behavioral history is available for this form. Submission totals and recorded response durations are still available.</p>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="bg-[#FFFDF9] border-2 border-[#2A2623] rounded-2xl p-4 shadow-[2px_2px_0px_#2A2623] space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#6E655E] block">
                Form Views
              </span>
              <span
                data-testid="metric-form-views"
                className="font-mono text-2xl font-bold text-[#2A2623] tabular-nums block"
              >
                {hasSessionData ? overview.formViews : '—'}
              </span>
              <span className="text-[11px] text-[#6E655E] block">
                Recorded form views
              </span>
            </div>

            <div className="bg-[#FFFDF9] border-2 border-[#2A2623] rounded-2xl p-4 shadow-[2px_2px_0px_#2A2623] space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#6E655E] block">
                Form Starts
              </span>
              <span
                data-testid="metric-form-starts"
                className="font-mono text-2xl font-bold text-[#2A2623] tabular-nums block"
              >
                {hasSessionData ? overview.formStarts : '—'}
              </span>
              <span className="text-[11px] text-[#6E655E] tabular-nums block">
                View → Start: {formatRate(overview.viewToStartRate)}
              </span>
            </div>

            <div className="bg-[#FFFDF9] border-2 border-[#2A2623] rounded-2xl p-4 shadow-[2px_2px_0px_#2A2623] space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#6E655E] block">
                Submissions
              </span>
              <span
                data-testid="metric-completed-submissions"
                className="font-mono text-2xl font-bold text-[#2A2623] tabular-nums block"
              >
                {overview.totalSubmissions}
              </span>
              <span className="text-[11px] text-[#6E655E] tabular-nums block">
                {overview.historicalPreAnalyticsSubmissions} without session history
              </span>
            </div>

            <div className="bg-[#FFFDF9] border-2 border-[#2A2623] rounded-2xl p-4 shadow-[2px_2px_0px_#2A2623] space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#6E655E] block">
                View → Complete
              </span>
              <span
                data-testid="metric-view-to-complete"
                className="font-mono text-2xl font-bold text-[#2A2623] tabular-nums block"
              >
                {formatRate(overview.viewToCompletionRate)}
              </span>
              <span className="text-[11px] text-[#6E655E] tabular-nums block">
                Start → Complete: {formatRate(overview.startToCompletionRate)}
              </span>
            </div>

            <div className="bg-[#FFFDF9] border-2 border-[#2A2623] rounded-2xl p-4 shadow-[2px_2px_0px_#2A2623] space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#6E655E] block">
                Completion Time
              </span>
              <span
                data-testid="metric-avg-duration"
                className="font-mono text-2xl font-bold text-[#2A2623] tabular-nums block"
              >
                {formatSeconds(overview.avgCompletionSeconds)}
              </span>
              <span className="text-[11px] text-[#6E655E] tabular-nums block">
                Median: {formatSeconds(overview.medianCompletionSeconds)}
              </span>
            </div>

            <div className="bg-[#FFFDF9] border-2 border-[#2A2623] rounded-2xl p-4 shadow-[2px_2px_0px_#2A2623] space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#6E655E] block">
                Incomplete
              </span>
              <span
                data-testid="metric-incomplete-sessions"
                className="font-mono text-2xl font-bold text-[#2A2623] tabular-nums block"
              >
                {hasSessionData ? overview.incompleteSessions : '—'}
              </span>
              <span className="text-[11px] text-[#6E655E] block truncate">
                Exited or &gt;15m idle
              </span>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-[#FFFDF9] border-2 border-[#2A2623] rounded-2xl p-5 shadow-[3px_3px_0px_#2A2623] space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#2A2623]/15 pb-3">
                <div>
                  <h3 className="font-display text-base font-bold text-[#2A2623]">
                    Activity Trends Over Time
                  </h3>
                  <p className="text-xs text-[#6E655E]">
                    Daily views, starts, and completed submissions by UTC date
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs font-semibold text-[#2A2623]">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#D8E8F5] border border-[#2A2623]" />
                    Views
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#F6D97A] border border-[#2A2623]" />
                    Starts
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#E86D52] border border-[#2A2623]" />
                    Submissions
                  </span>
                </div>
              </div>

              {overview.dailyTrends.length < 2 ? (
                <div className="py-10 text-center space-y-2">
                  <p className="text-sm font-bold text-[#2A2623]">
                    No activity recorded in this period
                  </p>
                  <p className="text-xs text-[#6E655E]">
                    Responses will appear here when people submit your form.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(() => {
                    const maxDaily = Math.max(
                      1,
                      ...overview.dailyTrends.map((d) =>
                        Math.max(d.views, d.starts, d.submissions)
                      )
                    );
                    return overview.dailyTrends.slice(-10).map((day) => (
                      <div
                        key={day.dateKey}
                        className="grid grid-cols-12 items-center gap-3 text-xs tabular-nums py-1"
                      >
                        <span className="col-span-3 sm:col-span-2 font-mono font-bold text-[#2A2623]">
                          {day.label}
                        </span>
                        <div className="col-span-6 sm:col-span-7 space-y-1">
                          <div
                            className="h-2 rounded-full bg-[#D8E8F5] border border-[#2A2623]"
                            style={{
                              width: `${Math.max(
                                (day.views / maxDaily) * 100,
                                day.views > 0 ? 6 : 2
                              )}%`,
                            }}
                            title={`${day.views} views`}
                          />
                          <div
                            className="h-2 rounded-full bg-[#F6D97A] border border-[#2A2623]"
                            style={{
                              width: `${Math.max(
                                (day.starts / maxDaily) * 100,
                                day.starts > 0 ? 6 : 2
                              )}%`,
                            }}
                            title={`${day.starts} starts`}
                          />
                          <div
                            className="h-2 rounded-full bg-[#E86D52] border border-[#2A2623]"
                            style={{
                              width: `${Math.max(
                                (day.submissions / maxDaily) * 100,
                                day.submissions > 0 ? 6 : 2
                              )}%`,
                            }}
                            title={`${day.submissions} submissions`}
                          />
                        </div>
                        <div className="col-span-3 text-right font-mono text-[11px] text-[#6E655E]">
                          {day.views}V · {day.starts}S ·{' '}
                          <strong className="text-[#2A2623]">
                            {day.submissions}C
                          </strong>
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>
            <div className="lg:col-span-5 bg-[#FFFDF9] border-2 border-[#2A2623] rounded-2xl p-5 shadow-[3px_3px_0px_#2A2623] space-y-4">
              <div className="border-b border-[#2A2623]/15 pb-3">
                <h3 className="font-display text-base font-bold text-[#2A2623]">
                  Session Conversion Breakdown
                </h3>
                <p className="text-xs text-[#6E655E]">
                  Conversion rates are computed strictly from tracked behavioral
                  sessions
                </p>
              </div>

              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-[#FAF6F0] border border-[#2A2623]/30 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-[#2A2623] block">
                      1. Form Views (Session Entry)
                    </span>
                    <span className="text-[11px] text-[#6E655E]">
                      Unique respondent sessions that opened the form
                    </span>
                  </div>
                  <span className="font-mono text-base font-bold text-[#2A2623] tabular-nums">
                    {overview.formViews}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-[#FAF6F0] border border-[#2A2623]/30 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-[#2A2623] block">
                      2. Form Starts (Reached Question 1)
                    </span>
                    <span className="text-[11px] text-[#6E655E]">
                      View-to-start conversion:{' '}
                      <strong className="text-[#2A2623] tabular-nums">
                        {formatRate(overview.viewToStartRate)}
                      </strong>
                    </span>
                  </div>
                  <span className="font-mono text-base font-bold text-[#2A2623] tabular-nums">
                    {overview.formStarts}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-[#FAF6F0] border border-[#2A2623]/30 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-[#2A2623] block">
                      3. Completed Tracked Sessions
                    </span>
                    <span className="text-[11px] text-[#6E655E]">
                      Start-to-complete:{' '}
                      <strong className="text-[#2A2623] tabular-nums">
                        {formatRate(overview.startToCompletionRate)}
                      </strong>{' '}
                      · Overall:{' '}
                      <strong className="text-[#2A2623] tabular-nums">
                        {formatRate(overview.viewToCompletionRate)}
                      </strong>
                    </span>
                  </div>
                  <span className="font-mono text-base font-bold text-[#2A2623] tabular-nums">
                    {overview.completedTrackedSessions}
                  </span>
                </div>
              </div>

              {overview.historicalPreAnalyticsSubmissions > 0 && (
                <div className="p-3 rounded-xl bg-[#FFF9EB] border border-[#2A2623] text-xs text-[#6E655E] space-y-1">
                  <div className="font-bold text-[#2A2623] flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5 text-[#E86D52]" />
                    <span>
                      {overview.historicalPreAnalyticsSubmissions}{' '}
                      {overview.historicalPreAnalyticsSubmissions === 1
                        ? 'Submission'
                        : 'Submissions'}{' '}
                      Without Session Details
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    These responses count toward your totals. Views, starts and
                    campaign sources are shown only when recorded.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 2: QUESTIONS & FLOW
         ===================================================================== */}
      {activeTab === 'questions' && (
        <div role="tabpanel" id="response-panel-questions" aria-labelledby="response-tab-questions" data-testid="analytics-section-questions">
          <ResponseSectionLayout label="Questions & Flow views" sections={questionSections} current={questionView} onChange={setQuestionView}>
          {questionView === 'reach' && <section className="space-y-4 rounded-2xl border-2 border-[#2A2623] bg-[#FFFDF9] p-5 shadow-[3px_3px_0px_#2A2623]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#2A2623]/15 pb-3">
              <div>
                <h3 className="font-display text-base font-bold text-[#2A2623]">
                  Question reach
                </h3>
              </div>
              {onNavigateToFlowCanvas && (
                <PaperButton
                  variant="ivory"
                  size="sm"
                  onClick={onNavigateToFlowCanvas}
                >
                  <GitBranch className="w-3.5 h-3.5" />
                  <span>View Traffic on Flow Canvas</span>
                </PaperButton>
              )}
            </div>

            <div className="space-y-3">
              <p className="text-sm text-[#6E655E]">Reach combines recorded activity with paths reconstructed from submitted answers. Only tracked sessions contribute to exits and validation errors.</p>
              {funnel.map((step) => (
                <div
                  key={step.stepId}
                  className="p-3.5 rounded-xl bg-[#FAF6F0] border border-[#2A2623]/30 space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="px-2 py-0.5 rounded bg-[#FFFDF9] border border-[#2A2623] font-mono font-bold text-[#2A2623] uppercase text-[10px]">
                        {step.kind}
                      </span>
                      <span className="min-w-0 font-bold text-[#2A2623] [overflow-wrap:anywhere]">
                        {step.kind === 'view' ? 'Paths entering the form' : step.kind === 'complete' ? 'Completed paths' : step.label}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] text-[#6E655E] tabular-nums">
                      <span>Path count <strong className="text-[#2A2623]">{step.sessionCount}</strong></span>
                      {step.kind === 'question' && step.dropOffCount > 0 && (
                        <span>
                          Tracked exits:{' '}
                          <strong className="text-[#D4573B]">
                            {step.dropOffCount}
                          </strong>
                        </span>
                      )}
                    </div>
                  </div>

                </div>
              ))}
            </div>
          </section>}
          {questionView === 'branches' && <section className="bg-[#FFFDF9] border-2 border-[#2A2623] rounded-2xl p-5 shadow-[3px_3px_0px_#2A2623] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#2A2623]/15 pb-3">
              <div>
                <h3 className="font-display text-base font-bold text-[#2A2623]">
                  Branch paths
                </h3>
                <p className="text-xs text-[#6E655E]">
                  Recorded transitions and paths reconstructed from submissions
                </p>
              </div>
              <span className="text-xs font-mono text-[#6E655E] tabular-nums">
                {flowGraph.edges.length} flow connections
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {flowGraph.edges.map((edge) => {
                const stat = report.flowOverlay.edgeTraversals[edge.id];
                const count = stat?.count ?? 0;
                const pct = stat?.percentageOfSource ?? 0;
                const sourceNode = flowGraph.nodes.find(
                  (n) => n.id === edge.sourceNodeId
                );
                const targetNode = flowGraph.nodes.find(
                  (n) => n.id === edge.targetNodeId
                );
                return (
                  <div
                    key={edge.id}
                    className="p-3 rounded-xl bg-[#FAF6F0] border border-[#2A2623]/30 flex flex-col justify-between gap-2"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-full border border-[#2A2623] text-[10px] font-bold ${
                            edge.kind === 'rule'
                              ? 'bg-[#FDECE8] text-[#D4573B]'
                              : 'bg-[#FFFDF9] text-[#6E655E]'
                          }`}
                        >
                          {edge.conditionLabel}
                        </span>
                        <span className="font-mono text-xs font-bold text-[#2A2623] tabular-nums">
                          {count} ({pct}%)
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-[#2A2623] truncate">
                        {sourceNode?.title || edge.sourceNodeId} →{' '}
                        {targetNode?.title || edge.targetNodeId}
                      </p>
                    </div>
                    <div className="h-1.5 bg-[#FFFDF9] border border-[#2A2623]/40 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${
                          edge.kind === 'rule' ? 'bg-[#E86D52]' : 'bg-[#2A2623]'
                        }`}
                        style={{ width: `${Math.max(pct, count > 0 ? 6 : 0)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>}
          {questionView === 'metrics' && <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {questionMetrics.map((stat) => {
              const meta = QUESTION_TYPE_META[stat.questionType];
              const choiceRows =
                stat.choiceDistribution || stat.ratingMetrics?.distribution;

              return (
                <div
                  key={stat.questionId}
                  data-testid={`question-analytics-card-${stat.questionId}`}
                  className="bg-[#FFFDF9] border-2 border-[#2A2623] rounded-2xl p-5 shadow-[3px_3px_0px_#2A2623] space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-2 border-b border-[#2A2623]/15 pb-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#6E655E] tabular-nums">
                          <span className="font-mono font-bold text-[#2A2623]">
                            Q{String(stat.questionIndex + 1).padStart(2, '0')}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{meta.label}</span>
                          {stat.required && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-[#D4573B] font-semibold">
                                Required
                              </span>
                            </>
                          )}
                        </div>
                        <h3 className="font-display text-base font-bold text-[#2A2623]">
                          {stat.questionTitle}
                        </h3>
                      </div>

                      {stat.ratingMetrics &&
                        stat.ratingMetrics.average !== null && (
                          <div className="px-3 py-1 rounded-xl bg-[#F6D97A] border border-[#2A2623] text-right shrink-0">
                            <span className="block text-[10px] font-bold text-[#2A2623]">
                              AVG RATING
                            </span>
                            <span className="font-mono text-base font-bold text-[#2A2623] tabular-nums">
                              {stat.ratingMetrics.average} /{' '}
                              {stat.ratingMetrics.maxRating}
                            </span>
                          </div>
                        )}

                      {stat.numericMetrics && (
                        <div className="px-3 py-1 rounded-xl bg-[#F6D97A] border border-[#2A2623] text-right shrink-0">
                          <span className="block text-[10px] font-bold text-[#2A2623]">
                            AVG VALUE
                          </span>
                          <span className="font-mono text-base font-bold text-[#2A2623] tabular-nums">
                            {stat.numericMetrics.average}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-3 xl:grid-cols-6 gap-2 text-center bg-[#FAF6F0] border border-[#2A2623]/25 rounded-xl p-2.5 tabular-nums">
                      <div>
                        <span className="block text-[10px] text-[#6E655E]">
                          Reached
                        </span>
                        <span className="font-mono text-xs font-bold text-[#2A2623]">
                          {stat.reachedCount}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-[#6E655E]">
                          Answered
                        </span>
                        <span className="font-mono text-xs font-bold text-[#2A2623]">
                          {stat.answeredCount}
                        </span>
                      </div>
                      <div>
                        <span title="Includes questions skipped by branching and questions reached without an answer" className="block text-[10px] text-[#6E655E]">
                          Unanswered
                        </span>
                        <span className="font-mono text-xs font-bold text-[#2A2623]">
                          {stat.skippedCount}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-[#6E655E]">
                          Tracked exits
                        </span>
                        <span className="font-mono text-xs font-bold text-[#D4573B]">
                          {stat.exitCount}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-[#6E655E]">
                          Avg Time
                        </span>
                        <span className="font-mono text-xs font-bold text-[#2A2623]">
                          {formatSeconds(stat.avgTimeSpentSeconds)}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-[#6E655E]">
                          Validation errors
                        </span>
                        <span className="font-mono text-xs font-bold text-[#2A2623]">
                          {stat.validationErrorCount}
                        </span>
                      </div>
                    </div>
                    {choiceRows && choiceRows.length > 0 && (
                      <div className="space-y-2">
                        {choiceRows.map((item) => (
                          <div key={item.id} className="space-y-1">
                            <div className="flex items-center justify-between text-xs font-semibold text-[#2A2623] tabular-nums">
                              <span className="truncate pr-2">
                                {item.label}
                              </span>
                              <span className="font-mono text-[#6E655E]">
                                {item.count} ({item.percentage}%)
                              </span>
                            </div>
                            <div className="h-2.5 bg-[#FAF6F0] border border-[#2A2623] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[#E86D52] transition-all duration-200"
                                style={{
                                  width: `${Math.max(
                                    item.percentage,
                                    item.count > 0 ? 6 : 0
                                  )}%`,
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {stat.numericMetrics && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-4 gap-2 text-center bg-[#FFF9EB] border border-[#2A2623] rounded-xl p-2 text-xs tabular-nums">
                          <div>
                            <span className="text-[10px] text-[#6E655E] block">
                              Min
                            </span>
                            <span className="font-mono font-bold text-[#2A2623]">
                              {stat.numericMetrics.min}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-[#6E655E] block">
                              Max
                            </span>
                            <span className="font-mono font-bold text-[#2A2623]">
                              {stat.numericMetrics.max}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-[#6E655E] block">
                              Average
                            </span>
                            <span className="font-mono font-bold text-[#2A2623]">
                              {stat.numericMetrics.average}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-[#6E655E] block">
                              Median
                            </span>
                            <span className="font-mono font-bold text-[#2A2623]">
                              {stat.numericMetrics.median}
                            </span>
                          </div>
                        </div>
                        {stat.numericMetrics.buckets.length > 0 && (
                          <div className="space-y-1.5">
                            {stat.numericMetrics.buckets.map((b) => (
                              <div
                                key={b.label}
                                className="flex items-center justify-between text-xs tabular-nums"
                              >
                                <span className="font-mono text-[#2A2623]">
                                  {b.label}
                                </span>
                                <span className="font-mono text-[#6E655E]">
                                  {b.count} ({b.percentage}%)
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {stat.dateMetrics && (
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between text-xs bg-[#FFF9EB] border border-[#2A2623] rounded-xl px-3 py-2 tabular-nums">
                          <span>
                            Earliest:{' '}
                            <strong className="font-mono text-[#2A2623]">
                              {stat.dateMetrics.earliestDate || '—'}
                            </strong>
                          </span>
                          <span>
                            Latest:{' '}
                            <strong className="font-mono text-[#2A2623]">
                              {stat.dateMetrics.latestDate || '—'}
                            </strong>
                          </span>
                          <span>
                            Distinct:{' '}
                            <strong className="font-mono text-[#2A2623]">
                              {stat.dateMetrics.distinctDatesCount}
                            </strong>
                          </span>
                        </div>
                      </div>
                    )}
                    {stat.textPrivacyMetrics && (
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between gap-2 text-xs text-[#6E655E] bg-[#FAF6F0] border border-[#2A2623]/25 rounded-xl px-3 py-2">
                          <span className="inline-flex items-center gap-1.5 font-semibold text-[#2A2623]">
                            <ShieldCheck className="w-3.5 h-3.5 text-[#E86D52]" />
                            Response length distribution
                          </span>
                          <span className="font-mono tabular-nums">
                            {stat.textPrivacyMetrics.totalResponses} responses
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center text-xs tabular-nums">
                          <div className="p-2 rounded-xl bg-[#FAF6F0] border border-[#2A2623]/20">
                            <span className="block text-[10px] text-[#6E655E]">
                              Short (&lt;25 chars)
                            </span>
                            <span className="font-mono font-bold text-[#2A2623]">
                              {stat.textPrivacyMetrics.shortCount}
                            </span>
                          </div>
                          <div className="p-2 rounded-xl bg-[#FAF6F0] border border-[#2A2623]/20">
                            <span className="block text-[10px] text-[#6E655E]">
                              Medium (25–100)
                            </span>
                            <span className="font-mono font-bold text-[#2A2623]">
                              {stat.textPrivacyMetrics.mediumCount}
                            </span>
                          </div>
                          <div className="p-2 rounded-xl bg-[#FAF6F0] border border-[#2A2623]/20">
                            <span className="block text-[10px] text-[#6E655E]">
                              Detailed (&gt;100)
                            </span>
                            <span className="font-mono font-bold text-[#2A2623]">
                              {stat.textPrivacyMetrics.longCount}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  {stat.textPrivacyMetrics && (
                    <div className="pt-2 border-t border-[#2A2623]/10 flex items-center justify-between text-xs">
                      <span className="text-[11px] text-[#6E655E]">
                        Raw text/email values are only shown in Submissions
                      </span>
                      <button
                        type="button"
                        onClick={() => setActiveTab('submissions')}
                        className="inline-flex items-center gap-1 font-bold text-[#D4573B] hover:underline cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Inspect Answers</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>}
          </ResponseSectionLayout>
        </div>
      )}

      {/* =====================================================================
          TAB 3: ACQUISITION & CAMPAIGN LINK BUILDER
         ===================================================================== */}
      {activeTab === 'acquisition' && (
        <div role="tabpanel" id="response-panel-acquisition" aria-labelledby="response-tab-acquisition" data-testid="analytics-section-acquisition">
          <ResponseSectionLayout label="Acquisition views" sections={acquisitionSections} current={acquisitionView} onChange={setAcquisitionView}>
          {acquisitionView === 'links' && ((persistenceMode === 'local' || publicFormUrl) ? <div className="bg-[#FFFDF9] border-2 border-[#2A2623] rounded-2xl p-5 sm:p-6 shadow-[4px_4px_0px_#2A2623] space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#2A2623]/15 pb-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link2 className="w-4 h-4 text-[#E86D52]" />
                  <h3 className="font-display text-lg font-bold text-[#2A2623]">
                    Create a campaign link
                  </h3>
                  {persistenceMode === 'local' && campaignBuildResult.isLocalTestUrl && (
                    <span className="px-2 py-0.5 rounded-md bg-[#F6D97A] border border-[#2A2623] font-mono text-[10px] font-bold text-[#2A2623]">
                      Preview link
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#6E655E]">
                  Use a different link for each place you share this form. For example, set Source to “newsletter”, Medium to “email”, and Campaign to “open_house” to group those responses in Traffic sources.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-bold text-[#6E655E] mr-1">
                  Presets:
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setUtmSourceInput('newsletter');
                    setUtmMediumInput('email');
                    setUtmCampaignInput('spring_launch');
                    setUtmContentInput('header_cta');
                  }}
                  className="px-2 py-1 rounded-lg bg-[#FAF6F0] border border-[#2A2623] text-[11px] font-bold text-[#2A2623] hover:bg-[#EFE9DE] cursor-pointer"
                >
                  Newsletter
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUtmSourceInput('linkedin');
                    setUtmMediumInput('social');
                    setUtmCampaignInput('founder_post');
                    setUtmContentInput('bio_link');
                  }}
                  className="px-2 py-1 rounded-lg bg-[#FAF6F0] border border-[#2A2623] text-[11px] font-bold text-[#2A2623] hover:bg-[#EFE9DE] cursor-pointer"
                >
                  LinkedIn
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUtmSourceInput('producthunt');
                    setUtmMediumInput('referral');
                    setUtmCampaignInput('launch_day');
                    setUtmContentInput('gallery_card');
                  }}
                  className="px-2 py-1 rounded-lg bg-[#FAF6F0] border border-[#2A2623] text-[11px] font-bold text-[#2A2623] hover:bg-[#EFE9DE] cursor-pointer"
                >
                  Product Hunt
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label
                  htmlFor="utm-base-url"
                  className="block text-xs font-bold text-[#2A2623]"
                >
                  Base Form URL
                </label>
                <input
                  id="utm-base-url"
                  type="text"
                  value={effectiveBaseUrl}
                  onChange={(e) => setCustomBaseUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border-2 border-[#2A2623] text-xs font-mono text-[#2A2623]"
                />
                <span className="block text-[11px] text-[#6E655E]">
                  Destination URL where your form is hosted or previewed
                </span>
              </div>

              {campaignFields.map(({ key, label, example, help }) => {
                const input = campaignInputs[key];
                const name = key.slice(4);
                const id = "utm-" + name + "-input";
                return <div key={key} className="min-w-0 space-y-1">
                  <label htmlFor={id} className="block text-xs font-bold">{label}</label>
                  <input id={id} aria-describedby={id + "-help"} data-testid={"campaign-input-" + name} type="text"
                    maxLength={120} placeholder={example} value={input[0]} onChange={(event) => input[1](event.target.value)}
                    className="w-full rounded-xl border-2 border-[#2A2623] bg-[#FAF6F0] px-3 py-2 text-xs" />
                  <p id={id + "-help"} className="text-xs leading-relaxed text-[#6E655E]">{help}</p>
                </div>;
              })}
            </div>
            <div className="p-4 rounded-2xl bg-[#FAF6F0] border-2 border-[#2A2623] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#2A2623]">
                  Generated Campaign URL
                </span>
                {campaignBuildResult.isLocalTestUrl && persistenceMode === 'local' && (
                  <span className="text-[11px] text-[#6E655E]">
                    Test this campaign link in the preview below.
                  </span>
                )}
              </div>

              {campaignBuildResult.valid ? (
                <div
                  data-testid="campaign-generated-url"
                  className="p-3 rounded-xl bg-[#FFFDF9] border border-[#2A2623] font-mono text-xs text-[#2A2623] break-all select-all"
                >
                  {campaignBuildResult.url}
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-[#FDECE8] border border-[#D4573B] text-xs font-bold text-[#D4573B] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>
                    {campaignErrors.join(' ') || 'Please enter a valid URL.'}
                  </span>
                </div>
              )}

              {campaignBuildResult.warnings.length > 0 && (
                <p className="text-[11px] text-[#6E655E]">
                  Note: {campaignBuildResult.warnings.join(' ')}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <PaperButton
                    variant="ivory"
                    size="sm"
                    onClick={handleCopyCampaignUrl}
                    disabled={!campaignBuildResult.valid}
                    data-testid="campaign-copy-url"
                  >
                    {copiedCampaignUrl ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-[#2E6F40]" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy URL</span>
                      </>
                    )}
                  </PaperButton>

                  <PaperButton
                    variant="ivory"
                    size="sm"
                    onClick={handleResetCampaignFields}
                    data-testid="campaign-reset-fields"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Fields</span>
                  </PaperButton>
                </div>

                <PaperButton
                  variant="coral"
                  size="sm"
                  onClick={handleTestCampaignInPreview}
                  disabled={!campaignBuildResult.valid}
                  data-testid="campaign-test-in-preview"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Test Campaign Link in Preview</span>
                </PaperButton>
              </div>
            </div>
          </div> : <div className="rounded-2xl border border-[#2A2623]/35 bg-[#FFFDF9] p-5">
            <h3 className="font-display text-lg font-bold">Create a campaign link</h3>
            <p className="mt-1 text-sm text-[#6E655E]">Publish a form with public access to create campaign links.</p>
          </div>)}
          {acquisitionView === 'traffic' && <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3.5">
            <div className="bg-[#FFFDF9] border-2 border-[#2A2623] rounded-2xl p-4 shadow-[2px_2px_0px_#2A2623]">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#6E655E] block">
                Attributed Views
              </span>
              <span
                data-testid="acquisition-attributed-views"
                className="font-mono text-2xl font-bold text-[#2A2623] tabular-nums"
              >
                {acquisition.attributedViews}
              </span>
              <span className="text-[11px] text-[#6E655E] block">
                With UTM or external referrer
              </span>
            </div>

            <div className="bg-[#FFFDF9] border-2 border-[#2A2623] rounded-2xl p-4 shadow-[2px_2px_0px_#2A2623]">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#6E655E] block">
                Direct / Unknown Views
              </span>
              <span
                data-testid="acquisition-direct-views"
                className="font-mono text-2xl font-bold text-[#2A2623] tabular-nums"
              >
                {acquisition.directOrUnknownViews}
              </span>
              <span className="text-[11px] text-[#6E655E] block">
                No UTM or external referrer
              </span>
            </div>

            <div className="bg-[#FFFDF9] border-2 border-[#2A2623] rounded-2xl p-4 shadow-[2px_2px_0px_#2A2623]">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#6E655E] block">
                Attributed Submissions
              </span>
              <span
                data-testid="acquisition-attributed-submissions"
                className="font-mono text-2xl font-bold text-[#2A2623] tabular-nums"
              >
                {acquisition.attributedSubmissions}
              </span>
              <span className="text-[11px] text-[#6E655E] block">
                Direct/Unknown: {acquisition.directOrUnknownSubmissions}
              </span>
            </div>

            <div className="bg-[#FFFDF9] border-2 border-[#2A2623] rounded-2xl p-4 shadow-[2px_2px_0px_#2A2623]">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#6E655E] block">
                Without session history
              </span>
              <span className="font-mono text-2xl font-bold text-[#2A2623] tabular-nums">
                {overview.historicalPreAnalyticsSubmissions}
              </span>
              <span className="text-[11px] text-[#6E655E] block">
                No session details available
              </span>
            </div>
          </div>
          <div className="bg-[#FFFDF9] border-2 border-[#2A2623] rounded-2xl p-5 shadow-[3px_3px_0px_#2A2623] space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-[#2A2623]/15 pb-3">
              <div className="flex flex-wrap items-center gap-1 p-1 bg-[#EFE9DE] border border-[#2A2623] rounded-xl">
                {(
                  [
                    { id: 'bySource', label: 'Source' },
                    { id: 'byMedium', label: 'Medium' },
                    { id: 'byCampaign', label: 'Campaign' },
                    { id: 'byContent', label: 'Content' },
                    { id: 'byTerm', label: 'Term' },
                    { id: 'byReferrer', label: 'Referring website' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setDimensionTab(tab.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                      dimensionTab === tab.id
                        ? 'bg-[#FFFDF9] text-[#2A2623] border border-[#2A2623]'
                        : 'text-[#6E655E] hover:text-[#2A2623]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Filter by UTM Source"
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value)}
                  className="px-2.5 py-1 rounded-xl bg-[#FAF6F0] border border-[#2A2623] text-xs font-bold text-[#2A2623]"
                >
                  <option value="all">All Sources</option>
                  {acquisition.availableSources.map((s) => (
                    <option key={s} value={s}>
                      Source: {s}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="Filter by UTM Medium"
                  value={mediumFilter}
                  onChange={(e) => setMediumFilter(e.target.value)}
                  className="px-2.5 py-1 rounded-xl bg-[#FAF6F0] border border-[#2A2623] text-xs font-bold text-[#2A2623]"
                >
                  <option value="all">All Mediums</option>
                  {acquisition.availableMediums.map((m) => (
                    <option key={m} value={m}>
                      Medium: {m}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="Filter by UTM Campaign"
                  value={campaignFilter}
                  onChange={(e) => setCampaignFilter(e.target.value)}
                  className="px-2.5 py-1 rounded-xl bg-[#FAF6F0] border border-[#2A2623] text-xs font-bold text-[#2A2623]"
                >
                  <option value="all">All Campaigns</option>
                  {acquisition.availableCampaigns.map((c) => (
                    <option key={c} value={c}>
                      Campaign: {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {activeDimensionRows.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <p className="text-sm font-bold text-[#2A2623]">
                  No attributed sessions recorded yet
                </p>
                <p className="text-xs text-[#6E655E]">
                  Campaign details appear here when responses include source or campaign information.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs tabular-nums">
                  <thead>
                    <tr className="border-b-2 border-[#2A2623] text-[#6E655E] font-bold">
                      <th className="py-2.5 px-3">Attribution Value</th>
                      <th className="py-2.5 px-3 text-right">Views</th>
                      <th className="py-2.5 px-3 text-right">Starts</th>
                      <th className="py-2.5 px-3 text-right">Submissions</th>
                      <th className="py-2.5 px-3 text-right">
                        Start → Complete
                      </th>
                      <th className="py-2.5 px-3 text-right">
                        View → Complete
                      </th>
                      <th className="py-2.5 px-3 text-right">Avg Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2A2623]/15">
                    {activeDimensionRows.map((row) => (
                      <tr
                        key={row.key}
                        className="hover:bg-[#FAF6F0] transition-colors"
                      >
                        <td className="py-2.5 px-3 font-mono font-bold text-[#2A2623]">
                          {row.label}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          {row.views}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          {row.starts}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-[#2A2623]">
                          {row.submissions}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          {formatRate(row.startToCompletionRate)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-[#E86D52]">
                          {formatRate(row.viewToCompletionRate)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          {formatSeconds(row.avgCompletionSeconds)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          </>}
          {acquisitionView === 'questions' && (acquisition.sourceQuestionComparison.length > 0 ? (
            <div className="bg-[#FFFDF9] border-2 border-[#2A2623] rounded-2xl p-5 shadow-[3px_3px_0px_#2A2623] space-y-4">
              <div className="border-b border-[#2A2623]/15 pb-3">
                <h3 className="font-display text-base font-bold text-[#2A2623]">
                  Question completion by source
                </h3>
                <p className="text-xs text-[#6E655E]">
                  Compare how visitors from different UTM sources progress
                  through individual questions
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs tabular-nums">
                  <thead>
                    <tr className="border-b-2 border-[#2A2623] text-[#6E655E] font-bold">
                      <th className="py-2 px-3">Source</th>
                      {form.questions.map((q, idx) => (
                        <th key={q.id} className="py-2 px-3 text-right">
                          Q{String(idx + 1).padStart(2, '0')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2A2623]/15">
                    {acquisition.sourceQuestionComparison.map((srcRow) => (
                      <tr key={srcRow.sourceLabel}>
                        <td className="py-2.5 px-3 font-mono font-bold text-[#2A2623]">
                          {srcRow.sourceLabel}
                        </td>
                        {form.questions.map((q) => {
                          const cell = srcRow.questionCompletionRates[q.id];
                          return (
                            <td
                              key={q.id}
                              className="py-2.5 px-3 text-right font-mono"
                            >
                              {cell
                                ? `${cell.answered}/${cell.reached} (${cell.completionRate}%)`
                                : '0/0 (0%)'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : <div className="rounded-2xl border border-[#2A2623]/35 bg-[#FFFDF9] p-5">
            <h3 className="font-display text-lg font-bold">Question completion by source</h3>
            <p className="mt-1 text-sm text-[#6E655E]">This comparison appears once Plyli records question activity from a campaign source.</p>
          </div>)}
          </ResponseSectionLayout>
        </div>
      )}

      {/* =====================================================================
          TAB 4: SUBMISSIONS
         ===================================================================== */}
      {activeTab === 'submissions' && (
        <div className="space-y-6" role="tabpanel" id="response-panel-submissions" aria-labelledby="response-tab-submissions" data-testid="analytics-section-submissions">
          {responseTrash?.content}
          <div className="bg-[#FFFDF9] border-2 border-[#2A2623] rounded-2xl p-4 shadow-[3px_3px_0px_#2A2623] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5 flex-1">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-[#6E655E] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  aria-label="Search submissions"
                  data-testid="submissions-search-input"
                  placeholder="Search answers, UTM source, campaign, or ID..."
                  value={submissionSearch}
                  onChange={(e) => setSubmissionSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#FAF6F0] border border-[#2A2623] text-xs text-[#2A2623]"
                />
              </div>

              <select
                aria-label="Filter submissions by form revision"
                value={submissionRevisionFilter}
                onChange={(e) => setSubmissionRevisionFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl bg-[#FAF6F0] border border-[#2A2623] text-xs font-bold text-[#2A2623]"
              >
                <option value="all">All Revisions</option>
                {availableRevisions.map((rev) => (
                  <option key={rev} value={String(rev)}>
                    Revision v{rev}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter submissions by attribution source"
                value={submissionSourceFilter}
                onChange={(e) => setSubmissionSourceFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl bg-[#FAF6F0] border border-[#2A2623] text-xs font-bold text-[#2A2623]"
              >
                <option value="all">All Sources</option>
                {availableSubmissionSources.map((src) => (
                  <option key={src} value={src}>
                    Source: {src}
                  </option>
                ))}
              </select>

              <select aria-label="Sort submissions" className="rounded-xl border border-[#2A2623] bg-[#FAF6F0] px-2.5 py-1.5 text-xs" value={oldestFirst ? 'oldest' : 'newest'} onChange={(event) => setOldestFirst(event.target.value === 'oldest')}>
                <option value="newest">Newest first</option><option value="oldest">Oldest first</option>
              </select>
              <select
                aria-label="Filter submissions by viewport category"
                value={submissionViewportFilter}
                onChange={(e) => setSubmissionViewportFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl bg-[#FAF6F0] border border-[#2A2623] text-xs font-bold text-[#2A2623]"
              >
                <option value="all">All Viewports</option>
                <option value="desktop">Desktop</option>
                <option value="tablet">Tablet</option>
                <option value="mobile">Mobile</option>
              </select>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <PaperButton
                variant="ivory"
                size="sm"
                onClick={handleDownloadCsv}
                disabled={filteredSubmissions.length === 0}
                data-testid="submissions-export-csv-btn"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>CSV ({filteredSubmissions.length})</span>
              </PaperButton>
              <PaperButton
                variant="ivory"
                size="sm"
                onClick={handleDownloadJson}
                disabled={filteredSubmissions.length === 0}
                data-testid="submissions-export-json-btn"
              >
                <FileJson className="w-3.5 h-3.5" />
                <span>JSON ({filteredSubmissions.length})</span>
              </PaperButton>
            </div>
          </div>

          {filteredSubmissions.length === 0 ? (
            <div className="bg-[#FFFDF9] border-2 border-[#2A2623] rounded-3xl p-10 text-center max-w-xl mx-auto shadow-[4px_4px_0px_#2A2623] space-y-4">
              <div className="flex justify-center">
                <SketchEmptyFolderGraphic className="w-24 h-20" />
              </div>
              <h3 className="font-display text-2xl font-bold text-[#2A2623]">
                {allFormResponses.length === 0
                  ? persistenceMode === 'account' ? 'No responses yet' : 'No preview responses yet'
                  : 'No submissions match your filters'}
              </h3>
              <p className="text-sm text-[#6E655E] max-w-md mx-auto leading-relaxed">
                {allFormResponses.length === 0
                  ? persistenceMode === 'account' ? 'Publish your form to collect responses, or submit through a permitted application integration.' : 'Preview your form to try the questions and branching rules.'
                  : 'Try clearing your search query or adjusting the revision and source filters above.'}
              </p>
              <div className="pt-2">
                <PaperButton
                  variant="coral"
                  size="md"
                  onClick={() => onLaunchPreview()}
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Preview form</span>
                </PaperButton>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-5 bg-[#FFFDF9] border-2 border-[#2A2623] rounded-2xl p-4 shadow-[3px_3px_0px_#2A2623] space-y-2.5">
                <h3 className="font-display text-base font-bold text-[#2A2623] px-1 tabular-nums">
                  Submissions ({filteredSubmissions.length})
                </h3>
                <div className="space-y-2 max-h-[540px] overflow-y-auto pr-1">
                  {filteredSubmissions.slice(0, submissionLimit).map((resp, idx) => {
                    const isSelected = selectedResponse?.id === resp.id;
                    const firstAnswer =
                      normalizeAnswerString(
                        resp.answers[form.questions[0]?.id || '']
                      ) || `Submission #${filteredSubmissions.length - idx}`;

                    const sourceBadge =
                      resp.attribution?.utm.utm_source ||
                      (resp.attribution ? 'Direct' : null);

                    return (
                      <button
                        key={resp.id}
                        type="button"
                        data-testid={`submission-list-item-${resp.id}`}
                        onClick={() => setSelectedResponseId(resp.id)}
                        className={`w-full p-3 rounded-xl border-2 text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                          isSelected
                            ? 'bg-[#F6D97A] border-[#2A2623] shadow-[2px_2px_0px_#2A2623]'
                            : 'bg-[#FAF6F0] border-[#2A2623]/30 hover:border-[#2A2623]'
                        }`}
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-bold text-[#2A2623] truncate">
                              {firstAnswer}
                            </p>
                            {sourceBadge && (
                              <span className="px-1.5 py-px rounded bg-[#FFFDF9] border border-[#2A2623] font-mono text-[10px] font-bold text-[#2A2623] shrink-0">
                                {sourceBadge}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[#6E655E] tabular-nums">
                            {formatTimestamp(resp.submittedAt)} ·{' '}
                            {resp.durationSeconds}s · Rev v
                            {resp.formRevision || 1}
                          </p>
                        </div>
                        <span className="font-mono text-xs font-bold text-[#2A2623] tabular-nums shrink-0">
                          #{filteredSubmissions.length - idx}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {filteredSubmissions.length > submissionLimit && <PaperButton size="sm" variant="ghost" onClick={() => setSubmissionLimit((limit) => limit + 40)}>Show more submissions</PaperButton>}
              </div>
              <div className="lg:col-span-7 bg-[#FFFDF9] border-2 border-[#2A2623] rounded-2xl p-6 shadow-[4px_4px_0px_#2A2623] space-y-5">
                {selectedResponse && (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#2A2623]/15 pb-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[#6E655E] tabular-nums">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#E86D52]" />
                          <span>
                            Submitted{' '}
                            {formatTimestamp(selectedResponse.submittedAt)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <Clock className="w-3.5 h-3.5" />
                          <span>{selectedResponse.durationSeconds} seconds</span>
                          <span aria-hidden="true">·</span>
                          <History className="w-3.5 h-3.5 text-[#2A2623]" />
                          <span className="font-mono font-bold text-[#2A2623]">
                            Revision v{selectedResponse.formRevision || 1}
                          </span>
                          {selectedResponse.viewport && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-1 font-mono text-[#2A2623]">
                                {selectedResponse.viewport === 'mobile' ? (
                                  <Smartphone className="w-3.5 h-3.5" />
                                ) : selectedResponse.viewport === 'tablet' ? (
                                  <Tablet className="w-3.5 h-3.5" />
                                ) : (
                                  <Monitor className="w-3.5 h-3.5" />
                                )}
                                {selectedResponse.viewport}
                              </span>
                            </>
                          )}
                        </div>
                        <h3 className="font-display text-xl font-bold text-[#2A2623] mt-1">
                          Response Record
                        </h3>
                      </div>

                      <PaperButton
                        variant="ivory"
                        size="sm"
                        onClick={() => setDeletePending(selectedResponse.id)}
                        aria-label="Delete this response"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-[#D4573B]" />
                        <span>{persistenceMode === 'account' ? 'Move to trash' : 'Delete Entry'}</span>
                      </PaperButton>
                    </div>
                    {deletePending === selectedResponse.id && <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg bg-[#FDECE8] p-2 text-sm"><span>{persistenceMode === 'account' ? 'Move this response to trash?' : 'Delete this preview response?'}</span><PaperButton size="sm" variant="coral" onClick={() => { onDeleteResponse(selectedResponse.id); setDeletePending(null); }}>Confirm</PaperButton><PaperButton size="sm" variant="ghost" onClick={() => setDeletePending(null)}>Cancel</PaperButton></div>}
                    <details
                      data-testid="submission-attribution-panel"
                      className="p-3.5 rounded-xl bg-[#FFF9EB] border border-[#2A2623] space-y-2"
                    >
                      <summary className="cursor-pointer text-xs font-bold text-[#2A2623]">
                        <span className="inline-flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5 text-[#E86D52]" />
                          Campaign details
                        </span>
                        <span className="font-mono text-[11px] text-[#6E655E]">
                          {selectedResponse.sessionSource === 'url_test'
                            ? 'Campaign Link Test Session'
                            : selectedResponse.sessionSource === 'local_preview'
                              ? 'Preview session'
                              : selectedResponse.sessionSource === 'public_live' ? 'Published response' : 'Session details unavailable'}
                        </span>
                      </summary>

                      {!selectedResponse.attribution ? (
                        <p className="text-xs text-[#6E655E]">
                          Not recorded for this response (
                          session attribution unavailable).
                        </p>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-mono">
                          <div>
                            <span className="text-[10px] text-[#6E655E] block">
                              utm_source
                            </span>
                            <span className="font-bold text-[#2A2623]">
                              {selectedResponse.attribution.utm.utm_source ||
                                '—'}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-[#6E655E] block">
                              utm_medium
                            </span>
                            <span className="font-bold text-[#2A2623]">
                              {selectedResponse.attribution.utm.utm_medium ||
                                '—'}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-[#6E655E] block">
                              utm_campaign
                            </span>
                            <span className="font-bold text-[#2A2623]">
                              {selectedResponse.attribution.utm.utm_campaign ||
                                '—'}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-[#6E655E] block">
                              utm_content
                            </span>
                            <span className="font-bold text-[#2A2623]">
                              {selectedResponse.attribution.utm.utm_content ||
                                '—'}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-[#6E655E] block">
                              utm_term
                            </span>
                            <span className="font-bold text-[#2A2623]">
                              {selectedResponse.attribution.utm.utm_term || '—'}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-[#6E655E] block">
                              referrerOrigin
                            </span>
                            <span className="font-bold text-[#2A2623] truncate block">
                              {selectedResponse.attribution.referrerOrigin ||
                                'Direct / None'}
                            </span>
                          </div>
                        </div>
                      )}
                    </details>
                    <div className="space-y-3">
                      {resolvedHistoricalItems.map((item, qIdx) => {
                        const meta = QUESTION_TYPE_META[item.questionType];
                        return (
                          <div
                            key={item.questionId}
                            className="p-3.5 rounded-xl bg-[#FAF6F0] border border-[#2A2623]/30 space-y-1"
                          >
                            <div className="flex items-center justify-between gap-2 text-xs text-[#6E655E] tabular-nums">
                              <span className="font-mono font-bold text-[#2A2623]">
                                Q{String(qIdx + 1).padStart(2, '0')} ·{' '}
                                {item.questionTitle}
                              </span>
                              <span className="shrink-0">
                                {item.isDeletedInCurrentForm
                                  ? 'Archived question'
                                  : !item.wasVisited
                                    ? 'Skipped by branching'
                                    : meta?.shortLabel || item.questionType}
                              </span>
                            </div>
                            <p
                              className={`text-sm font-semibold ${
                                item.displayAnswer
                                  ? 'text-[#2A2623]'
                                  : 'text-[#6E655E] italic'
                              }`}
                            >
                              {item.displayAnswer ||
                                (item.wasVisited
                                  ? 'No answer provided'
                                  : 'Skipped via flow rule')}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
