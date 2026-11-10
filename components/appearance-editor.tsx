'use client';

import React, { useState } from 'react';
import {
  FormSchema,
  AppearanceTemplateId,
  AppearanceOverrides,
  AnswerValue,
  FontFamilyToken,
  ButtonShapeToken,
  CornerRadiusToken,
  BackgroundTreatmentToken,
  CardWidthToken,
  ContentAlignmentToken,
  ButtonShadowToken,
  SpacingDensityToken,
  RecordChangeOptions,
} from '@/lib/form-engine';
import {
  APPEARANCE_TEMPLATE_LIST,
  ESSENTIAL_TEMPLATE_LIST,
  CREATORS_COLLECTION_TEMPLATE_LIST,
  AppearanceTemplateDefinition,
  resolveFormAppearance,
  getBackgroundTreatmentStyle,
  getButtonRadiusClass,
} from '@/themes/appearance-registry';
import { PaperButton } from './paper-primitives';
import {
  ThemedFormCard,
  ThemedWelcomeScreen,
  ThemedCompletionBadge,
} from './themed-form-surface';
import { QuestionRenderer, ThemedActionButton } from './question-renderer';
import {
  Palette,
  Check,
  Eye,
  RotateCcw,
  Monitor,
  Smartphone,
  ChevronLeft,
  ChevronRight,
  Sliders,
  Play,
  Sparkles,
} from 'lucide-react';

interface AppearanceEditorProps {
  form: FormSchema;
  onUpdateForm: (
    updater: (prev: FormSchema) => FormSchema,
    options?: RecordChangeOptions
  ) => void;
  onLaunchPreview: () => void;
}

/**
 * Renders a genuine mini visual preview thumbnail using the template's real design tokens,
 * typography, input framing, and button style.
 */
function TemplateThumbnail({
  template,
}: {
  template: AppearanceTemplateDefinition;
}) {
  const tokens = resolveFormAppearance({
    templateId: template.id,
    overrides: {},
  });
  const btnRadius = getButtonRadiusClass(tokens.buttonShape);

  return (
    <div
      style={getBackgroundTreatmentStyle(tokens)}
      className="w-full h-28 rounded-xl p-2.5 flex items-center justify-center overflow-hidden border border-[#2A2623]/20"
      aria-hidden="true"
    >
      <div
        style={{
          backgroundColor: tokens.cardBackground,
          color: tokens.textColor,
          borderTop:
            tokens.cardVariant === 'editorial-sheet'
              ? `1.5px solid ${tokens.textColor}`
              : tokens.cardVariant === 'corporate-structured'
              ? `3px solid ${tokens.primaryColor}`
              : undefined,
          borderBottom:
            tokens.cardVariant === 'editorial-sheet'
              ? `1.5px solid ${tokens.textColor}`
              : undefined,
          border:
            tokens.cardVariant !== 'editorial-sheet'
              ? `${
                  tokens.templateId === 'paper' ||
                  tokens.templateId === 'pop' ||
                  tokens.templateId === 'gaming' ||
                  tokens.templateId === 'blueprint' ||
                  tokens.templateId === 'vamori'
                    ? '1.5px'
                    : '1px'
                } solid ${tokens.borderColor}`
              : undefined,
          boxShadow:
            tokens.cardVariant === 'gaming-hud'
              ? `0 0 10px ${tokens.primaryColor}33, 2px 2px 0px ${tokens.borderColor}`
              : tokens.cardVariant === 'vamori-underground'
              ? '3px 3px 0px #000000'
              : tokens.cardVariant === 'veritas-midnight'
              ? '0 8px 20px rgba(0,0,0,0.7), 0 0 14px rgba(99,102,241,0.22)'
              : tokens.cardVariant === 'tiny-lilac-card'
              ? '0 6px 16px rgba(134,115,161,0.18)'
              : tokens.buttonShadow === 'tactile'
              ? `3px 3px 0px ${tokens.borderColor}`
              : '0 2px 6px rgba(0,0,0,0.08)',
        }}
        className={`w-full max-w-[190px] p-2.5 space-y-1.5 overflow-hidden ${
          tokens.cardVariant === 'editorial-sheet'
            ? 'rounded-none'
            : tokens.cornerRadius === 'sm'
            ? 'rounded-md'
            : 'rounded-lg'
        }`}
      >
        {tokens.cardVariant === 'vamori-underground' ? (
          <div className="flex items-center justify-between -mx-2.5 -mt-2.5 mb-1.5 px-2 py-1 bg-black border-b border-[#303030]">
            <span className="inline-flex items-center gap-1 text-[7px] font-mono text-[#F7F6F2] tracking-widest">
              <span
                className="w-1.5 h-1.5 inline-block"
                style={{ backgroundColor: tokens.primaryColor }}
              />
              PASS // 01
            </span>
            <span className="text-[7px] font-mono text-[#D6FF00]">|||||</span>
          </div>
        ) : tokens.cardVariant === 'veritas-midnight' ? (
          <div
            className="h-1 -mx-2.5 -mt-2.5 mb-1.5"
            style={{
              backgroundImage:
                'linear-gradient(90deg, transparent, #6366F1, #8B5CF6, #FB7185, transparent)',
            }}
          />
        ) : tokens.cardVariant === 'akarii-prism' ? (
          <div
            className="h-1 -mx-2.5 -mt-2.5 mb-1.5"
            style={{
              backgroundImage:
                'linear-gradient(90deg, #8B5CF6, #EC4899, #22D3EE, #F59E0B, #10B981)',
            }}
          />
        ) : tokens.cardVariant === 'tiny-lilac-card' ? (
          <div
            className="h-1 -mx-2.5 -mt-2.5 mb-1.5"
            style={{
              backgroundImage: 'linear-gradient(90deg, #8673A1, #E5A4CB, #8673A1)',
            }}
          />
        ) : tokens.cardVariant === 'riff-studio' ? (
          <div className="flex items-center justify-between text-[7px] font-mono text-[#6A6C62] mb-0.5">
            <span className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#8A9B76] inline-block" />
              FOLIO
            </span>
            <span className="text-[#A74728]">§</span>
          </div>
        ) : (
          tokens.showTopRibbon && (
            <div
              className="h-1.5 -mx-2.5 -mt-2.5 mb-1.5 rounded-t-sm"
              style={{ backgroundColor: tokens.primaryColor }}
            />
          )
        )}

        <div
          style={{ fontFamily: tokens.headingFontCss }}
          className="text-[11px] font-bold truncate"
        >
          What inspires your work?
        </div>
        <div
          style={{
            backgroundColor:
              tokens.inputVariant === 'editorial-underline'
                ? 'transparent'
                : tokens.inputBackground,
            borderBottom:
              tokens.inputVariant === 'editorial-underline'
                ? `1.5px solid ${tokens.textColor}`
                : undefined,
            border:
              tokens.inputVariant !== 'editorial-underline'
                ? `1px solid ${
                    tokens.templateId === 'riff'
                      ? tokens.selectedOptionBorder
                      : tokens.borderColor
                  }`
                : undefined,
            color: tokens.mutedTextColor,
          }}
          className={`text-[9px] px-1.5 py-1 truncate ${
            tokens.inputVariant === 'editorial-underline'
              ? 'rounded-none px-0'
              : 'rounded'
          }`}
        >
          Type your answer...
        </div>
        <div className="pt-0.5 flex items-center justify-between">
          <span
            style={{
              backgroundColor: tokens.primaryColor,
              backgroundImage:
                tokens.templateId === 'veritas'
                  ? 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)'
                  : undefined,
              color: tokens.primaryTextColor,
            }}
            className={`px-2 py-0.5 text-[9px] font-bold ${btnRadius}`}
          >
            Continue
          </span>
          <span
            className="text-[8px] font-mono opacity-60"
            style={{ color: tokens.mutedTextColor }}
          >
            01 / 05
          </span>
        </div>
      </div>
    </div>
  );
}

const ACCENT_SWATCHES = [
  { label: 'Coral', hex: '#E86D52' },
  { label: 'Acid Lime (Vamori)', hex: '#D6FF00' },
  { label: 'Indigo (Veritas)', hex: '#6366F1' },
  { label: 'Lilac (tiny.et)', hex: '#8673A1' },
  { label: 'Mint (Akarii)', hex: '#10B981' },
  { label: 'Terracotta (Riff)', hex: '#A74728' },
  { label: 'Olive (Riff)', hex: '#8A9B76' },
  { label: 'Corporate Navy', hex: '#0F3D75' },
  { label: 'Cyber Neon', hex: '#00F5D4' },
  { label: 'Blueprint Cyan', hex: '#38BDF8' },
  { label: 'Botanical', hex: '#3A6B50' },
  { label: 'Pop Berry', hex: '#FF3B6B' },
];

const BACKGROUND_SWATCHES = [
  { label: 'Warm Paper', hex: '#FAF6F0' },
  { label: 'Riff Warm Stone', hex: '#F1F0E9' },
  { label: 'tiny.et Lavender', hex: '#F8F6FB' },
  { label: 'Executive Slate', hex: '#F1F5F9' },
  { label: 'Warm Plaster', hex: '#F7EFE6' },
  { label: 'Sunbeam', hex: '#FFF3C4' },
  { label: 'Vamori Underground', hex: '#0B0B0B' },
  { label: 'Veritas Midnight', hex: '#030303' },
  { label: 'Akarii Studio', hex: '#121212' },
  { label: 'After Dark', hex: '#0B0F17' },
  { label: 'Blueprint Navy', hex: '#0B2545' },
];

export function AppearanceEditor({
  form,
  onUpdateForm,
  onLaunchPreview,
}: AppearanceEditorProps) {
  const savedAppearance = form.appearance || {
    schemaVersion: 1,
    templateId: 'paper' as AppearanceTemplateId,
    overrides: {},
  };

  // Category filter for the template gallery
  const [galleryCategory, setGalleryCategory] = useState<
    'all' | 'essentials' | 'creators-collection'
  >('all');

  // Temporary preview template ID (null means viewing saved template)
  const [previewTemplateId, setPreviewTemplateId] =
    useState<AppearanceTemplateId | null>(null);

  const [previewViewport, setPreviewViewport] = useState<'desktop' | 'mobile'>(
    'desktop'
  );
  const [previewStageIndex, setPreviewStageIndex] = useState<number>(0); // 0 = welcome, 1..N = questions, N+1 = completion
  const [sampleAnswers, setSampleAnswers] = useState<Record<string, AnswerValue>>({});

  const effectiveTemplateId = previewTemplateId || savedAppearance.templateId;
  const effectiveOverrides: AppearanceOverrides = previewTemplateId
    ? {} // When temporarily previewing another template, show its pure design first
    : savedAppearance.overrides || {};

  const activeTokens = resolveFormAppearance(
    {
      templateId: effectiveTemplateId,
      overrides: effectiveOverrides,
    },
    form.accentTheme
  );

  const totalStages = form.questions.length + 2; // welcome + questions + completion
  const clampedStage = Math.min(Math.max(0, previewStageIndex), totalStages - 1);

  const overrideCount = Object.values(savedAppearance.overrides || {}).filter(
    (v) => v !== undefined && v !== ''
  ).length;

  const handleApplyTemplate = (templateId: AppearanceTemplateId) => {
    setPreviewTemplateId(null);
    onUpdateForm(
      (prev) => ({
        ...prev,
        appearance: {
          schemaVersion: 1,
          templateId,
          overrides:
            prev.appearance?.templateId === templateId
              ? prev.appearance.overrides
              : {},
        },
      }),
      { label: `Apply ${templateId} theme` }
    );
  };

  const handleUpdateOverride = <K extends keyof AppearanceOverrides>(
    key: K,
    value: AppearanceOverrides[K]
  ) => {
    // If user was previewing a template and starts customizing, apply that template first
    const targetTemplateId = previewTemplateId || savedAppearance.templateId;
    if (previewTemplateId) {
      setPreviewTemplateId(null);
    }

    onUpdateForm(
      (prev) => {
        const currentOverrides =
          prev.appearance?.templateId === targetTemplateId
            ? prev.appearance?.overrides || {}
            : {};
        const nextOverrides = {
          ...currentOverrides,
          [key]: value,
        };
        if (value === undefined || value === '') {
          delete nextOverrides[key];
        }
        return {
          ...prev,
          appearance: {
            schemaVersion: 1,
            templateId: targetTemplateId,
            overrides: nextOverrides,
          },
        };
      },
      {
        label: `Customize ${String(key)}`,
        coalesceKey: `appearance-override-${String(key)}`,
      }
    );
  };

  const handleResetToTemplateDefaults = () => {
    setPreviewTemplateId(null);
    onUpdateForm(
      (prev) => ({
        ...prev,
        appearance: {
          schemaVersion: 1,
          templateId: prev.appearance?.templateId || 'paper',
          overrides: {},
        },
      }),
      { label: 'Reset appearance overrides' }
    );
  };

  const previewQuestion =
    clampedStage >= 1 && clampedStage <= form.questions.length
      ? form.questions[clampedStage - 1]
      : undefined;

  const renderTemplateCard = (tpl: AppearanceTemplateDefinition) => {
    const isApplied = savedAppearance.templateId === tpl.id;
    const isPreviewing = previewTemplateId === tpl.id;
    const isCreatorsCollection = tpl.category === 'creators-collection';

    return (
      <div
        key={tpl.id}
        className={`rounded-2xl border-2 p-3 transition-all space-y-2.5 ${
          isApplied
            ? 'bg-[#FFF9EB] border-[#2A2623] shadow-[3px_3px_0px_#2A2623]'
            : isPreviewing
            ? 'bg-[#EDF5FA] border-[#2A2623] shadow-[2px_2px_0px_#2A2623]'
            : 'bg-[#FAF6F0] border-[#2A2623]/30 hover:border-[#2A2623]'
        }`}
      >
        <div
          onClick={() => setPreviewTemplateId(isApplied ? null : tpl.id)}
          className="cursor-pointer"
        >
          <TemplateThumbnail template={tpl} />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-sm font-bold text-[#2A2623]">
              {tpl.name}
              {tpl.subtitle && (
                <span className="ml-1.5 text-xs font-semibold text-[#6E655E]">
                  — {tpl.subtitle}
                </span>
              )}
              {tpl.id === 'paper' && (
                <span className="ml-1.5 text-[10px] font-normal text-[#6E655E]">
                  · Default
                </span>
              )}
            </h3>
            {isApplied && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#C5DFC9] border border-[#2A2623] text-[10px] font-bold text-[#2A2623] shrink-0">
                <Check className="w-3 h-3" />
                Applied
              </span>
            )}
            {!isApplied && isPreviewing && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#B8D8EB] border border-[#2A2623] text-[10px] font-bold text-[#2A2623] shrink-0">
                <Eye className="w-3 h-3" />
                Previewing
              </span>
            )}
          </div>

          {isCreatorsCollection && (
            <div className="inline-flex items-center gap-1 text-[10px] font-bold text-[#9A4A38] bg-[#FDECE8] border border-[#E86D52]/40 px-2 py-0.5 rounded-md">
              <Sparkles className="w-2.5 h-2.5" />
              <span>Creator&apos;s Collection</span>
            </div>
          )}

          <p className="text-[11px] text-[#6E655E] leading-snug">
            {tpl.description}
          </p>

          {tpl.attribution && (
            <p className="text-[10px] italic text-[#6E655E]/90 pt-0.5">
              {tpl.attribution}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 pt-1">
          {!isApplied && (
            <PaperButton
              variant="ivory"
              size="sm"
              className="flex-1"
              onClick={() =>
                setPreviewTemplateId(isPreviewing ? null : tpl.id)
              }
              aria-label={`Preview ${tpl.name} template`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>{isPreviewing ? 'Stop Preview' : 'Preview'}</span>
            </PaperButton>
          )}
          <PaperButton
            variant={isApplied ? 'ivory' : 'coral'}
            size="sm"
            className="flex-1"
            disabled={isApplied && !previewTemplateId}
            onClick={() => handleApplyTemplate(tpl.id)}
            aria-label={`Apply ${tpl.name} template`}
          >
            <Check className="w-3.5 h-3.5" />
            <span>{isApplied ? 'Active Style' : `Apply ${tpl.name}`}</span>
          </PaperButton>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-5">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <aside
          aria-label="Appearance template gallery"
          className="lg:col-span-4 xl:col-span-3 bg-[#FFFDF9] border-2 border-[#2A2623] rounded-2xl p-4 shadow-[3px_3px_0px_#2A2623] space-y-3.5"
        >
          <div className="border-b border-[#2A2623]/15 pb-3 space-y-2.5">
            <div>
              <h2 className="font-display text-base font-bold text-[#2A2623] flex items-center gap-2">
                <Palette className="w-4 h-4 text-[#E86D52]" />
                <span>Appearance Templates ({APPEARANCE_TEMPLATE_LIST.length})</span>
              </h2>
              <p className="text-[11px] text-[#6E655E]">
                Visual style is independent of your questions and flow rules.
              </p>
            </div>
            <div
              className="grid grid-cols-3 gap-1 p-1 bg-[#FAF6F0] border border-[#2A2623] rounded-xl"
              role="tablist"
              aria-label="Template categories"
            >
              <button
                type="button"
                role="tab"
                aria-selected={galleryCategory === 'all'}
                onClick={() => setGalleryCategory('all')}
                className={`px-2 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                  galleryCategory === 'all'
                    ? 'bg-[#2A2623] text-[#FFFDF9]'
                    : 'text-[#6E655E] hover:text-[#2A2623]'
                }`}
              >
                All ({APPEARANCE_TEMPLATE_LIST.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={galleryCategory === 'essentials'}
                onClick={() => setGalleryCategory('essentials')}
                className={`px-2 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                  galleryCategory === 'essentials'
                    ? 'bg-[#2A2623] text-[#FFFDF9]'
                    : 'text-[#6E655E] hover:text-[#2A2623]'
                }`}
              >
                Essentials ({ESSENTIAL_TEMPLATE_LIST.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={galleryCategory === 'creators-collection'}
                onClick={() => setGalleryCategory('creators-collection')}
                className={`px-2 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer truncate ${
                  galleryCategory === 'creators-collection'
                    ? 'bg-[#E86D52] text-[#FFFDF9]'
                    : 'text-[#6E655E] hover:text-[#2A2623]'
                }`}
                title="Creator's Collection"
              >
                Creator&apos;s ({CREATORS_COLLECTION_TEMPLATE_LIST.length})
              </button>
            </div>
          </div>

          <div className="space-y-4 max-h-[640px] overflow-y-auto pr-1">
            {(galleryCategory === 'all' ||
              galleryCategory === 'creators-collection') && (
              <div className="space-y-2.5">
                <div className="px-1 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-[#9A4A38]">
                    <Sparkles className="w-3.5 h-3.5 text-[#E86D52]" />
                    <span>Creator&apos;s Collection</span>
                  </span>
                  <span className="text-[10px] font-mono font-bold text-[#6E655E]">
                    {CREATORS_COLLECTION_TEMPLATE_LIST.length} themes
                  </span>
                </div>
                <p className="px-1 text-[11px] text-[#6E655E] leading-snug">
                  Distinct layouts, typography and color palettes.
                </p>
                <div className="space-y-3">
                  {CREATORS_COLLECTION_TEMPLATE_LIST.map(renderTemplateCard)}
                </div>
              </div>
            )}

            {galleryCategory === 'all' && (
              <div className="border-t border-[#2A2623]/15 pt-2" />
            )}

            {(galleryCategory === 'all' ||
              galleryCategory === 'essentials') && (
              <div className="space-y-2.5">
                <div className="px-1 flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-[#2A2623]">
                    Essentials
                  </span>
                  <span className="text-[10px] font-mono font-bold text-[#6E655E]">
                    {ESSENTIAL_TEMPLATE_LIST.length} themes
                  </span>
                </div>
                <div className="space-y-3">
                  {ESSENTIAL_TEMPLATE_LIST.map(renderTemplateCard)}
                </div>
              </div>
            )}
          </div>
        </aside>
        <section
          aria-label="Live appearance preview"
          className="lg:col-span-5 xl:col-span-6 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#FFFDF9] border-2 border-[#2A2623] rounded-2xl px-4 py-2.5 shadow-[3px_3px_0px_#2A2623]">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPreviewStageIndex((i) => Math.max(0, i - 1))}
                disabled={clampedStage === 0}
                aria-label="Previous preview screen"
                className="p-1.5 rounded-lg border border-[#2A2623] bg-[#FAF6F0] hover:bg-[#EFE9DE] disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-bold text-[#2A2623] tabular-nums">
                {clampedStage === 0
                  ? 'Welcome Screen'
                  : clampedStage === totalStages - 1
                  ? 'Completion Screen'
                  : `Question ${clampedStage} of ${form.questions.length}`}
              </span>
              <button
                type="button"
                onClick={() =>
                  setPreviewStageIndex((i) => Math.min(totalStages - 1, i + 1))
                }
                disabled={clampedStage === totalStages - 1}
                aria-label="Next preview screen"
                className="p-1.5 rounded-lg border border-[#2A2623] bg-[#FAF6F0] hover:bg-[#EFE9DE] disabled:opacity-40 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div
                className="flex items-center gap-1 p-1 bg-[#FAF6F0] border border-[#2A2623] rounded-xl"
                role="group"
                aria-label="Preview viewport size"
              >
                <button
                  type="button"
                  onClick={() => setPreviewViewport('desktop')}
                  aria-label="Desktop appearance preview"
                  className={`p-1.5 rounded-lg text-xs cursor-pointer ${
                    previewViewport === 'desktop'
                      ? 'bg-[#2A2623] text-white'
                      : 'text-[#6E655E] hover:text-[#2A2623]'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewViewport('mobile')}
                  aria-label="Mobile appearance preview"
                  className={`p-1.5 rounded-lg text-xs cursor-pointer ${
                    previewViewport === 'mobile'
                      ? 'bg-[#2A2623] text-white'
                      : 'text-[#6E655E] hover:text-[#2A2623]'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                </button>
              </div>

              <PaperButton
                variant="yellow"
                size="sm"
                onClick={onLaunchPreview}
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Full-Screen Test</span>
              </PaperButton>
            </div>
          </div>
          {previewTemplateId &&
            previewTemplateId !== savedAppearance.templateId && (
              <div className="bg-[#B8D8EB] border-2 border-[#2A2623] rounded-2xl px-4 py-3 shadow-[3px_3px_0px_#2A2623] flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-bold text-[#2A2623]">
                  <Eye className="w-4 h-4" />
                  <span>
                    Temporary Preview: Inspecting{' '}
                    <strong>
                      {activeTokens.templateName}
                      {activeTokens.templateSubtitle
                        ? ` — ${activeTokens.templateSubtitle}`
                        : ''}
                    </strong>{' '}
                    (Current saved template is{' '}
                    <strong>
                      {
                        APPEARANCE_TEMPLATE_LIST.find(
                          (t) => t.id === savedAppearance.templateId
                        )?.name
                      }
                    </strong>
                    )
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <PaperButton
                    variant="coral"
                    size="sm"
                    onClick={() => handleApplyTemplate(previewTemplateId)}
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Apply {activeTokens.templateName}</span>
                  </PaperButton>
                  <PaperButton
                    variant="ivory"
                    size="sm"
                    onClick={() => setPreviewTemplateId(null)}
                  >
                    <span>Keep Saved</span>
                  </PaperButton>
                </div>
              </div>
            )}
          <div
            style={getBackgroundTreatmentStyle(activeTokens)}
            className="rounded-3xl border-2 border-[#2A2623] p-5 sm:p-8 min-h-[510px] flex flex-col justify-between shadow-[4px_4px_0px_#2A2623] transition-colors duration-200"
          >
            <div className="max-w-2xl w-full mx-auto flex items-center justify-between gap-3 mb-4">
              <span
                className="text-xs font-semibold truncate"
                style={{ color: activeTokens.mutedTextColor }}
              >
                {form.title} · {activeTokens.templateName}
                {activeTokens.templateSubtitle
                  ? ` (${activeTokens.templateSubtitle})`
                  : ''}{' '}
                Theme
              </span>
              <div className="flex items-center gap-2 w-36">
                <div
                  className="flex-1 h-2 rounded-full overflow-hidden"
                  style={{
                    backgroundColor: activeTokens.isDark
                      ? 'rgba(255,255,255,0.12)'
                      : 'rgba(0,0,0,0.08)',
                  }}
                >
                  <div
                    className="h-full transition-all duration-200"
                    style={{
                      width: `${Math.round(
                        ((clampedStage + 1) / totalStages) * 100
                      )}%`,
                      backgroundColor: activeTokens.primaryColor,
                    }}
                  />
                </div>
              </div>
            </div>

            <div
              className={`w-full mx-auto my-auto ${
                previewViewport === 'mobile' ? 'max-w-[360px]' : ''
              }`}
            >
              <ThemedFormCard appearance={activeTokens}>
                {clampedStage === 0 && (
                  <ThemedWelcomeScreen
                    appearance={activeTokens}
                    title={form.welcomeScreen.title}
                    description={form.welcomeScreen.description}
                    buttonText={form.welcomeScreen.buttonText}
                    timeEstimate={form.welcomeScreen.timeEstimate}
                    questionCount={form.questions.length}
                    enabled={form.welcomeScreen.enabled}
                    onStart={() => setPreviewStageIndex(1)}
                  />
                )}

                {previewQuestion && (
                  <QuestionRenderer
                    question={previewQuestion}
                    stepNumber={clampedStage}
                    totalSteps={form.questions.length}
                    value={sampleAnswers[previewQuestion.id]}
                    onChange={(val) =>
                      setSampleAnswers((prev) => ({
                        ...prev,
                        [previewQuestion.id]: val,
                      }))
                    }
                    onSubmitStep={() =>
                      setPreviewStageIndex((i) => Math.min(totalStages - 1, i + 1))
                    }
                    appearance={activeTokens}
                    submitLabel="Continue"
                  />
                )}

                {clampedStage === totalStages - 1 && (
                  <div
                    className={`space-y-5 py-4 ${
                      activeTokens.contentAlignment === 'center'
                        ? 'text-center'
                        : 'text-left'
                    }`}
                  >
                    <div className="flex justify-center">
                      <ThemedCompletionBadge appearance={activeTokens} />
                    </div>
                    <h2
                      className="text-2xl sm:text-3xl font-extrabold text-center"
                      style={{
                        fontFamily: activeTokens.headingFontCss,
                        color: activeTokens.textColor,
                      }}
                    >
                      {form.completionScreen.title}
                    </h2>
                    <p
                      className="text-sm sm:text-base text-center max-w-md mx-auto leading-relaxed"
                      style={{ color: activeTokens.mutedTextColor }}
                    >
                      {form.completionScreen.description}
                    </p>
                    <div className="flex justify-center pt-2">
                      <ThemedActionButton
                        appearance={activeTokens}
                        variant="primary"
                        size="md"
                        onClick={() => setPreviewStageIndex(0)}
                      >
                        <span>
                          {form.completionScreen.buttonText || 'Back to Start'}
                        </span>
                      </ThemedActionButton>
                    </div>
                  </div>
                )}
              </ThemedFormCard>
            </div>

            <div
              className="mt-4 text-center text-[11px]"
              style={{ color: activeTokens.mutedTextColor }}
            >
              Interactive Live Preview · Try answering or stepping through screens
              above
            </div>
          </div>
        </section>
        <aside
          aria-label="Appearance customization settings"
          className="lg:col-span-3 bg-[#FFFDF9] border-2 border-[#2A2623] rounded-2xl p-5 shadow-[3px_3px_0px_#2A2623] space-y-5"
        >
          <div className="flex items-center justify-between border-b border-[#2A2623]/15 pb-3">
            <div>
              <h3 className="font-display text-base font-bold text-[#2A2623] flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#E86D52]" />
                <span>Customize Appearance</span>
              </h3>
              <p className="text-[11px] text-[#6E655E]">
                Base:{' '}
                <strong>
                  {activeTokens.templateName}
                  {activeTokens.templateSubtitle
                    ? ` — ${activeTokens.templateSubtitle}`
                    : ''}
                </strong>{' '}
                ·{' '}
                {overrideCount === 0
                  ? 'Template defaults'
                  : `${overrideCount} custom ${
                      overrideCount === 1 ? 'override' : 'overrides'
                    }`}
              </p>
            </div>

            <button
              type="button"
              onClick={handleResetToTemplateDefaults}
              disabled={overrideCount === 0 && !previewTemplateId}
              title="Reset to template defaults"
              aria-label="Reset to Template Defaults"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#FAF6F0] border border-[#2A2623] text-xs font-bold text-[#2A2623] hover:bg-[#F6D97A] disabled:opacity-40 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>

          {activeTokens.attribution && (
            <div className="rounded-xl bg-[#FDECE8] border border-[#E86D52]/40 px-3 py-2 text-[11px] text-[#2A2623] flex items-start gap-2">
              <Sparkles className="w-3.5 h-3.5 text-[#E86D52] shrink-0 mt-0.5" />
              <span>{activeTokens.attribution}</span>
            </div>
          )}

          {/* 1. Primary / Accent Color */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor="custom-primary-color"
                className="text-xs font-bold text-[#2A2623]"
              >
                Primary Accent Color
              </label>
              <span className="font-mono text-[11px] text-[#6E655E]">
                {activeTokens.primaryColor}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {ACCENT_SWATCHES.map((swatch) => (
                <button
                  key={swatch.hex}
                  type="button"
                  onClick={() => handleUpdateOverride('primaryColor', swatch.hex)}
                  title={swatch.label}
                  aria-label={`Set primary color to ${swatch.label}`}
                  className={`w-6 h-6 rounded-full border-2 border-[#2A2623] transition-transform cursor-pointer ${
                    activeTokens.primaryColor.toLowerCase() ===
                    swatch.hex.toLowerCase()
                      ? 'scale-125'
                      : 'opacity-80 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: swatch.hex }}
                />
              ))}
              <input
                id="custom-primary-color"
                type="color"
                value={activeTokens.primaryColor}
                onChange={(e) =>
                  handleUpdateOverride('primaryColor', e.target.value)
                }
                aria-label="Custom primary color hex picker"
                className="w-7 h-7 rounded-lg border border-[#2A2623] cursor-pointer bg-transparent"
              />
            </div>
          </div>

          {/* 2. Background Color */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor="custom-bg-color"
                className="text-xs font-bold text-[#2A2623]"
              >
                Canvas Background
              </label>
              <span className="font-mono text-[11px] text-[#6E655E]">
                {activeTokens.canvasBackground}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {BACKGROUND_SWATCHES.map((swatch) => (
                <button
                  key={swatch.hex}
                  type="button"
                  onClick={() =>
                    handleUpdateOverride('backgroundColor', swatch.hex)
                  }
                  title={swatch.label}
                  aria-label={`Set background color to ${swatch.label}`}
                  className={`w-6 h-6 rounded-full border-2 border-[#2A2623] transition-transform cursor-pointer ${
                    activeTokens.canvasBackground.toLowerCase() ===
                    swatch.hex.toLowerCase()
                      ? 'scale-125'
                      : 'opacity-80 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: swatch.hex }}
                />
              ))}
              <input
                id="custom-bg-color"
                type="color"
                value={activeTokens.canvasBackground}
                onChange={(e) =>
                  handleUpdateOverride('backgroundColor', e.target.value)
                }
                aria-label="Custom background color hex picker"
                className="w-7 h-7 rounded-lg border border-[#2A2623] cursor-pointer bg-transparent"
              />
            </div>
          </div>

          {/* 3. Typography Selection */}
          <div>
            <label
              htmlFor="custom-font-select"
              className="block text-xs font-bold text-[#2A2623] mb-1"
            >
              Heading Typography
            </label>
            <select
              id="custom-font-select"
              value={activeTokens.fontFamily}
              onChange={(e) =>
                handleUpdateOverride(
                  'fontFamily',
                  e.target.value as FontFamilyToken
                )
              }
              className="w-full px-3 py-2 text-xs font-semibold bg-[#FAF6F0] border-2 border-[#2A2623] rounded-xl focus:outline-none cursor-pointer"
            >
              <option value="display">Bricolage Display (Friendly & Chunky)</option>
              <option value="sans">Plus Jakarta Sans (Clean & Modern)</option>
              <option value="serif">Fraunces Serif (Editorial & Organic)</option>
              <option value="mono">JetBrains Mono (Technical)</option>
            </select>
          </div>

          {/* 4. Button Shape & Shadow */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="custom-btn-shape"
                className="block text-xs font-bold text-[#2A2623] mb-1"
              >
                Button Shape
              </label>
              <select
                id="custom-btn-shape"
                value={activeTokens.buttonShape}
                onChange={(e) =>
                  handleUpdateOverride(
                    'buttonShape',
                    e.target.value as ButtonShapeToken
                  )
                }
                className="w-full px-2.5 py-2 text-xs font-semibold bg-[#FAF6F0] border-2 border-[#2A2623] rounded-xl focus:outline-none cursor-pointer"
              >
                <option value="rounded">Rounded</option>
                <option value="pill">Pill</option>
                <option value="sharp">Sharp</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="custom-btn-shadow"
                className="block text-xs font-bold text-[#2A2623] mb-1"
              >
                Button Shadow
              </label>
              <select
                id="custom-btn-shadow"
                value={activeTokens.buttonShadow}
                onChange={(e) =>
                  handleUpdateOverride(
                    'buttonShadow',
                    e.target.value as ButtonShadowToken
                  )
                }
                className="w-full px-2.5 py-2 text-xs font-semibold bg-[#FAF6F0] border-2 border-[#2A2623] rounded-xl focus:outline-none cursor-pointer"
              >
                <option value="tactile">Tactile Offset</option>
                <option value="soft">Soft Ambient</option>
                <option value="none">Flat / None</option>
              </select>
            </div>
          </div>

          {/* 5. Corner Roundness & Background Treatment */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="custom-corner-radius"
                className="block text-xs font-bold text-[#2A2623] mb-1"
              >
                Corner Radius
              </label>
              <select
                id="custom-corner-radius"
                value={activeTokens.cornerRadius}
                onChange={(e) =>
                  handleUpdateOverride(
                    'cornerRadius',
                    e.target.value as CornerRadiusToken
                  )
                }
                className="w-full px-2.5 py-2 text-xs font-semibold bg-[#FAF6F0] border-2 border-[#2A2623] rounded-xl focus:outline-none cursor-pointer"
              >
                <option value="sm">Subtle</option>
                <option value="md">Medium</option>
                <option value="lg">Large</option>
                <option value="xl">Extra Rounded</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="custom-bg-treatment"
                className="block text-xs font-bold text-[#2A2623] mb-1"
              >
                Surface Texture
              </label>
              <select
                id="custom-bg-treatment"
                value={activeTokens.backgroundTreatment}
                onChange={(e) =>
                  handleUpdateOverride(
                    'backgroundTreatment',
                    e.target.value as BackgroundTreatmentToken
                  )
                }
                className="w-full px-2.5 py-2 text-xs font-semibold bg-[#FAF6F0] border-2 border-[#2A2623] rounded-xl focus:outline-none cursor-pointer"
              >
                <option value="solid">Solid Clean</option>
                <option value="paper-grain">Paper Dot Grain</option>
                <option value="subtle-grid">Subtle Grid</option>
                <option value="soft-gradient">Soft Glow</option>
              </select>
            </div>
          </div>

          {/* 6. Card Width, Alignment & Density */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="custom-card-width"
                className="block text-xs font-bold text-[#2A2623] mb-1"
              >
                Card Width
              </label>
              <select
                id="custom-card-width"
                value={activeTokens.cardWidth}
                onChange={(e) =>
                  handleUpdateOverride(
                    'cardWidth',
                    e.target.value as CardWidthToken
                  )
                }
                className="w-full px-2.5 py-2 text-xs font-semibold bg-[#FAF6F0] border-2 border-[#2A2623] rounded-xl focus:outline-none cursor-pointer"
              >
                <option value="compact">Compact</option>
                <option value="standard">Standard</option>
                <option value="wide">Wide</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="custom-alignment"
                className="block text-xs font-bold text-[#2A2623] mb-1"
              >
                Alignment
              </label>
              <select
                id="custom-alignment"
                value={activeTokens.contentAlignment}
                onChange={(e) =>
                  handleUpdateOverride(
                    'contentAlignment',
                    e.target.value as ContentAlignmentToken
                  )
                }
                className="w-full px-2.5 py-2 text-xs font-semibold bg-[#FAF6F0] border-2 border-[#2A2623] rounded-xl focus:outline-none cursor-pointer"
              >
                <option value="left">Left</option>
                <option value="center">Centered</option>
              </select>
            </div>

            <div className="col-span-2">
              <label
                htmlFor="custom-density"
                className="block text-xs font-bold text-[#2A2623] mb-1"
              >
                Spacing Density
              </label>
              <select
                id="custom-density"
                value={activeTokens.density}
                onChange={(e) =>
                  handleUpdateOverride(
                    'density',
                    e.target.value as SpacingDensityToken
                  )
                }
                className="w-full px-2.5 py-2 text-xs font-semibold bg-[#FAF6F0] border-2 border-[#2A2623] rounded-xl focus:outline-none cursor-pointer"
              >
                <option value="compact">Compact Spacing</option>
                <option value="comfortable">Comfortable (Default)</option>
                <option value="spacious">Spacious Breathing Room</option>
              </select>
            </div>
          </div>
          <div className="pt-2 border-t border-[#2A2623]/15 space-y-2">
            <PaperButton
              variant="ivory"
              size="sm"
              className="w-full"
              disabled={overrideCount === 0}
              onClick={handleResetToTemplateDefaults}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to {activeTokens.templateName} Defaults</span>
            </PaperButton>
          </div>
        </aside>
      </div>
    </div>
  );
}
