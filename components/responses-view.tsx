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
import { PaperButton, SketchEmptyFolderGraphic } from './paper-primitives';
import {
  Play,
  Trash2,
  Download,
  HardDrive,
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
}: ResponsesViewProps) {
  const [activeTab, setActiveTab] = useState<AnalyticsSectionTab>('overview');
  const [dateRangePreset, setDateRangePreset] =
    useState<AnalyticsDateRangePreset>('all');

  // Acquisition filters
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

  const [utmSourceInput, setUtmSourceInput] = useState<string>('newsletter');
  const [utmMediumInput, setUtmMediumInput] = useState<string>('email');
  const [utmCampaignInput, setUtmCampaignInput] =
    useState<string>('spring_launch');
  const [utmContentInput, setUtmContentInput] = useState<string>('');
  const [utmTermInput, setUtmTermInput] = useState<string>('');
  const [copiedCampaignUrl, setCopiedCampaignUrl] = useState<boolean>(false);

  // Submissions tab filters & selection
  const [submissionSearch, setSubmissionSearch] = useState<string>('');
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
    return computeFormAnalyticsReport(form, responses, analyticsEvents, {
      dateRange: dateRangePreset,
      utmSource: sourceFilter === 'all' ? undefined : sourceFilter,
      utmMedium: mediumFilter === 'all' ? undefined : mediumFilter,
      utmCampaign: campaignFilter === 'all' ? undefined : campaignFilter,
    });
  }, [
    form,
    responses,
    analyticsEvents,
    dateRangePreset,
    sourceFilter,
    mediumFilter,
    campaignFilter,
  ]);

  const flowGraph = useMemo(() => deriveFlowGraph(form), [form]);
  const hasSessionData = analyticsEvents.some((event) => event.formId === form.id);

  // Campaign URL builder result
  const campaignBuildResult = useMemo(() => {
    return buildCampaignUrl({
      baseUrl: effectiveBaseUrl,
      formId: form.id,
      utm_source: utmSourceInput,
      utm_medium: utmMediumInput,
      utm_campaign: utmCampaignInput,
      utm_content: utmContentInput,
      utm_term: utmTermInput,
    });
  }, [
    effectiveBaseUrl,
    form.id,
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
    return allFormResponses.filter((resp) => {
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
  const campaignErrors = Object.values(campaignBuildResult.errors).filter(
    Boolean
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="bg-[#FFF9EB] border-2 border-[#2A2623] rounded-2xl p-4 sm:p-5 shadow-[3px_3px_0px_#2A2623] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#F6D97A] border-2 border-[#2A2623] flex items-center justify-center shrink-0">
            <HardDrive className="w-5 h-5 text-[#2A2623]" />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-base sm:text-lg font-bold text-[#2A2623]">
                {'Response insights'} ({allFormResponses.length}{' '}
                {allFormResponses.length === 1 ? 'submission' : 'submissions'})
              </h2>
              <span className="px-2 py-0.5 rounded-md bg-[#FFFDF9] border border-[#2A2623] font-mono text-[11px] font-bold text-[#2A2623] tabular-nums">
                {persistenceMode === 'account' ? 'Published responses' : 'Preview responses'}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-[#6E655E] leading-relaxed max-w-3xl">
              {persistenceMode === 'account' ? 'Review your responses, explore answer trends, and export your results.' : 'Review preview responses saved on this device. They are separate from your published results.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <PaperButton
            variant="coral"
            size="sm"
            onClick={() => onLaunchPreview()}
            data-testid="analytics-launch-preview-btn"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Preview form</span>
          </PaperButton>

          {allFormResponses.length > 0 && (
            <>
              <PaperButton
                variant="ivory"
                size="sm"
                onClick={handleDownloadCsv}
                data-testid="export-submissions-csv"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </PaperButton>

              <PaperButton
                variant="ivory"
                size="sm"
                onClick={() => onExportFormResponses(form.id)}
                data-testid="export-submissions-json-top"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export JSON</span>
              </PaperButton>
            </>
          )}

          {(allFormResponses.length > 0 || analyticsEvents.length > 0) &&
            (confirmClearAll ? (
              <div className="inline-flex items-center gap-1.5">
                <PaperButton
                  variant="coral"
                  size="sm"
                  onClick={() => {
                    onClearFormResponses(form.id);
                    onClearFormAnalytics?.(form.id);
                    setConfirmClearAll(false);
                  }}
                >
                  <span>Confirm Clear</span>
                </PaperButton>
                <PaperButton
                  variant="ivory"
                  size="sm"
                  onClick={() => setConfirmClearAll(false)}
                >
                  <span>Cancel</span>
                </PaperButton>
              </div>
            ) : (
              <PaperButton
                variant="ivory"
                size="sm"
                onClick={() => setConfirmClearAll(true)}
              >
                <Trash2 className="w-3.5 h-3.5 text-[#D4573B]" />
                <span>Clear Data</span>
              </PaperButton>
            ))}
        </div>
      </div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[#FFFDF9] border-2 border-[#2A2623] rounded-2xl p-3.5 shadow-[3px_3px_0px_#2A2623]">
        <div
          className="flex flex-wrap items-center gap-1 p-1 bg-[#EFE9DE] border-2 border-[#2A2623] rounded-xl"
          role="tablist"
          aria-label="Analytics workspace sections"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'overview'}
            data-testid="analytics-tab-overview"
            onClick={() => setActiveTab('overview')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer whitespace-nowrap transition-colors ${
              activeTab === 'overview'
                ? 'bg-[#FFFDF9] text-[#2A2623] border border-[#2A2623] shadow-[1px_1px_0px_#2A2623]'
                : 'text-[#6E655E] hover:text-[#2A2623]'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Overview</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'questions'}
            data-testid="analytics-tab-questions"
            onClick={() => setActiveTab('questions')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer whitespace-nowrap transition-colors ${
              activeTab === 'questions'
                ? 'bg-[#FFFDF9] text-[#2A2623] border border-[#2A2623] shadow-[1px_1px_0px_#2A2623]'
                : 'text-[#6E655E] hover:text-[#2A2623]'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Questions & Flow</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'acquisition'}
            data-testid="analytics-tab-acquisition"
            onClick={() => setActiveTab('acquisition')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer whitespace-nowrap transition-colors ${
              activeTab === 'acquisition'
                ? 'bg-[#FFFDF9] text-[#2A2623] border border-[#2A2623] shadow-[1px_1px_0px_#2A2623]'
                : 'text-[#6E655E] hover:text-[#2A2623]'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Acquisition & UTM</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'submissions'}
            data-testid="analytics-tab-submissions"
            onClick={() => setActiveTab('submissions')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer whitespace-nowrap transition-colors ${
              activeTab === 'submissions'
                ? 'bg-[#FFFDF9] text-[#2A2623] border border-[#2A2623] shadow-[1px_1px_0px_#2A2623]'
                : 'text-[#6E655E] hover:text-[#2A2623]'
            }`}
          >
            <ListChecks className="w-3.5 h-3.5" />
            <span className="tabular-nums">
              Submissions ({allFormResponses.length})
            </span>
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
        </div>
      </div>

      {/* =====================================================================
          TAB 1: OVERVIEW
         ===================================================================== */}
      {activeTab === 'overview' && (
        <div className="space-y-6" data-testid="analytics-section-overview">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
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
                {overview.completedTrackedSessions} tracked ·{' '}
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

              {overview.dailyTrends.length === 0 ? (
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
        <div className="space-y-6" data-testid="analytics-section-questions">
          <div className="bg-[#FFFDF9] border-2 border-[#2A2623] rounded-2xl p-5 shadow-[3px_3px_0px_#2A2623] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#2A2623]/15 pb-3">
              <div>
                <h3 className="font-display text-base font-bold text-[#2A2623]">
                  Question Progression Funnel
                </h3>
                <p className="text-xs text-[#6E655E]">
                  Respondent reach, step-to-step conversion, and observed
                  drop-offs across the form journey
                </p>
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
                      <span className="font-bold text-[#2A2623] truncate">
                        {step.label}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] text-[#6E655E] tabular-nums">
                      <span>
                        Sessions:{' '}
                        <strong className="text-[#2A2623]">
                          {step.sessionCount}
                        </strong>
                      </span>
                      <span>
                        Step Conv:{' '}
                        <strong className="text-[#2A2623]">
                          {formatRate(step.conversionFromPrevious)}
                        </strong>
                      </span>
                      <span>
                        From Entry:{' '}
                        <strong className="text-[#2A2623]">
                          {formatRate(step.conversionFromInitial)}
                        </strong>
                      </span>
                      {step.dropOffCount > 0 && (
                        <span>
                          Drop-offs:{' '}
                          <strong className="text-[#D4573B]">
                            {step.dropOffCount}
                          </strong>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="h-2.5 bg-[#FFFDF9] border border-[#2A2623] rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-[#C5DFC9] transition-all"
                      style={{
                        width: `${step.conversionFromInitial ?? (step.sessionCount > 0 ? 100 : 0)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-[#FFFDF9] border-2 border-[#2A2623] rounded-2xl p-5 shadow-[3px_3px_0px_#2A2623] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#2A2623]/15 pb-3">
              <div>
                <h3 className="font-display text-base font-bold text-[#2A2623]">
                  Conditional Branch & Path Usage
                </h3>
                <p className="text-xs text-[#6E655E]">
                  Aggregated edge traversals across rule-based jumps and default
                  paths
                </p>
              </div>
              <span className="text-xs font-mono text-[#6E655E] tabular-nums">
                {flowGraph.edges.length} flow connections
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
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
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center bg-[#FAF6F0] border border-[#2A2623]/25 rounded-xl p-2.5 tabular-nums">
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
                        <span className="block text-[10px] text-[#6E655E]">
                          Skipped
                        </span>
                        <span className="font-mono text-xs font-bold text-[#2A2623]">
                          {stat.skippedCount}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-[#6E655E]">
                          Exits
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
                          Val. Errors
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
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 3: ACQUISITION & CAMPAIGN LINK BUILDER
         ===================================================================== */}
      {activeTab === 'acquisition' && (
        <div className="space-y-6" data-testid="analytics-section-acquisition">
          {(persistenceMode === 'local' || publicFormUrl) && <div className="bg-[#FFFDF9] border-2 border-[#2A2623] rounded-2xl p-5 sm:p-6 shadow-[4px_4px_0px_#2A2623] space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#2A2623]/15 pb-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link2 className="w-4 h-4 text-[#E86D52]" />
                  <h3 className="font-display text-lg font-bold text-[#2A2623]">
                    Campaign Link Builder (UTM Generator)
                  </h3>
                  {campaignBuildResult.isLocalTestUrl && (
                    <span className="px-2 py-0.5 rounded-md bg-[#F6D97A] border border-[#2A2623] font-mono text-[10px] font-bold text-[#2A2623]">
                      Preview link
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#6E655E]">
                  Add campaign parameters to your published link to identify
                  the sources of submitted responses.
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

              <div className="space-y-1">
                <label
                  htmlFor="utm-source-input"
                  className="block text-xs font-bold text-[#2A2623]"
                >
                  Source (<code className="font-mono">utm_source</code>)
                </label>
                <input
                  id="utm-source-input"
                  data-testid="campaign-input-source"
                  type="text"
                  placeholder="e.g. newsletter, linkedin, google"
                  value={utmSourceInput}
                  onChange={(e) => setUtmSourceInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border-2 border-[#2A2623] text-xs text-[#2A2623]"
                />
                <span className="block text-[11px] text-[#6E655E]">
                  Identifies which platform or referrer sent the traffic
                </span>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="utm-medium-input"
                  className="block text-xs font-bold text-[#2A2623]"
                >
                  Medium (<code className="font-mono">utm_medium</code>)
                </label>
                <input
                  id="utm-medium-input"
                  data-testid="campaign-input-medium"
                  type="text"
                  placeholder="e.g. email, social, cpc, qr"
                  value={utmMediumInput}
                  onChange={(e) => setUtmMediumInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border-2 border-[#2A2623] text-xs text-[#2A2623]"
                />
                <span className="block text-[11px] text-[#6E655E]">
                  Marketing channel or delivery mechanism
                </span>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="utm-campaign-input"
                  className="block text-xs font-bold text-[#2A2623]"
                >
                  Campaign (<code className="font-mono">utm_campaign</code>)
                </label>
                <input
                  id="utm-campaign-input"
                  data-testid="campaign-input-campaign"
                  type="text"
                  placeholder="e.g. spring_launch, beta_invite"
                  value={utmCampaignInput}
                  onChange={(e) => setUtmCampaignInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border-2 border-[#2A2623] text-xs text-[#2A2623]"
                />
                <span className="block text-[11px] text-[#6E655E]">
                  Specific promotion, launch, or initiative name
                </span>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="utm-content-input"
                  className="block text-xs font-bold text-[#2A2623]"
                >
                  Content (<code className="font-mono">utm_content</code>)
                </label>
                <input
                  id="utm-content-input"
                  data-testid="campaign-input-content"
                  type="text"
                  placeholder="e.g. hero_button, footer_link"
                  value={utmContentInput}
                  onChange={(e) => setUtmContentInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border-2 border-[#2A2623] text-xs text-[#2A2623]"
                />
                <span className="block text-[11px] text-[#6E655E]">
                  Optional: differentiates placements or creative variants
                </span>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="utm-term-input"
                  className="block text-xs font-bold text-[#2A2623]"
                >
                  Term (<code className="font-mono">utm_term</code>)
                </label>
                <input
                  id="utm-term-input"
                  data-testid="campaign-input-term"
                  type="text"
                  placeholder="e.g. design_ops, form_builder"
                  value={utmTermInput}
                  onChange={(e) => setUtmTermInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border-2 border-[#2A2623] text-xs text-[#2A2623]"
                />
                <span className="block text-[11px] text-[#6E655E]">
                  Optional: search keyword or target audience segment
                </span>
              </div>
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
          </div>

          }
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
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
                    { id: 'bySource', label: 'UTM Source' },
                    { id: 'byMedium', label: 'UTM Medium' },
                    { id: 'byCampaign', label: 'UTM Campaign' },
                    { id: 'byContent', label: 'UTM Content' },
                    { id: 'byTerm', label: 'UTM Term' },
                    { id: 'byReferrer', label: 'Referring Website' },
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
          {acquisition.sourceQuestionComparison.length > 0 && (
            <div className="bg-[#FFFDF9] border-2 border-[#2A2623] rounded-2xl p-5 shadow-[3px_3px_0px_#2A2623] space-y-4">
              <div className="border-b border-[#2A2623]/15 pb-3">
                <h3 className="font-display text-base font-bold text-[#2A2623]">
                  Question Completion Behavior by Acquisition Source
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
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 4: SUBMISSIONS
         ===================================================================== */}
      {activeTab === 'submissions' && (
        <div className="space-y-6" data-testid="analytics-section-submissions">
          <div className="bg-[#FFFDF9] border-2 border-[#2A2623] rounded-2xl p-4 shadow-[3px_3px_0px_#2A2623] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5 flex-1">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-[#6E655E] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
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
                  {filteredSubmissions.map((resp, idx) => {
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
                        onClick={() => onDeleteResponse(selectedResponse.id)}
                        aria-label="Delete this response"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-[#D4573B]" />
                        <span>{persistenceMode === 'account' ? 'Move to trash' : 'Delete Entry'}</span>
                      </PaperButton>
                    </div>
                    <div
                      data-testid="submission-attribution-panel"
                      className="p-3.5 rounded-xl bg-[#FFF9EB] border border-[#2A2623] space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs font-bold text-[#2A2623]">
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
                      </div>

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
                    </div>
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
