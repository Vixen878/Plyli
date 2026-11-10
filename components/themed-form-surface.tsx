'use client';

import React from 'react';
import {
  ResolvedAppearanceTokens,
  getCornerRadiusClass,
} from '@/themes/appearance-registry';
import { SketchStampBadge } from './paper-primitives';
import { ThemedActionButton } from './question-renderer';
import { Clock, ArrowRight, CheckCircle2, Sparkles, ShieldCheck } from 'lucide-react';

export function ThemedFormCard({
  appearance,
  children,
  footer,
}: {
  appearance: ResolvedAppearanceTokens;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const radiusClass =
    appearance.cardVariant === 'editorial-sheet' ||
    appearance.cardVariant === 'blueprint-cad'
      ? 'rounded-none'
      : getCornerRadiusClass(appearance.cornerRadius);

  const widthClass =
    appearance.cardWidth === 'compact'
      ? 'max-w-xl'
      : appearance.cardWidth === 'wide'
      ? 'max-w-3xl'
      : 'max-w-2xl';

  const densityClass =
    appearance.density === 'compact'
      ? 'p-5 sm:p-7'
      : appearance.density === 'spacious'
      ? 'p-7 sm:p-12'
      : 'p-6 sm:p-10';

  const getCardFrameStyle = (): React.CSSProperties => {
    if (appearance.cardVariant === 'editorial-sheet') {
      return {
        backgroundColor: appearance.cardBackground,
        color: appearance.textColor,
        borderTop: `2px solid ${appearance.textColor}`,
        borderBottom: `2px solid ${appearance.textColor}`,
        borderLeft: 'none',
        borderRight: 'none',
        boxShadow: 'none',
      };
    }

    if (appearance.cardVariant === 'vamori-underground') {
      return {
        backgroundColor: appearance.cardBackground,
        color: appearance.textColor,
        border: `1.5px solid ${appearance.borderColor}`,
        boxShadow: `6px 6px 0px #000000, 0 0 0 1px rgba(214, 255, 0, 0.14)`,
      };
    }

    if (appearance.cardVariant === 'veritas-midnight') {
      return {
        backgroundColor: appearance.cardBackground,
        color: appearance.textColor,
        border: `1px solid rgba(255, 255, 255, 0.12)`,
        boxShadow:
          '0 24px 60px -12px rgba(0, 0, 0, 0.85), 0 0 40px -10px rgba(99, 102, 241, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.12)',
      };
    }

    if (appearance.cardVariant === 'tiny-lilac-card') {
      return {
        backgroundColor: appearance.cardBackground,
        color: appearance.textColor,
        border: `1.5px solid ${appearance.borderColor}`,
        boxShadow:
          '0 14px 34px -8px rgba(134, 115, 161, 0.16), 0 2px 6px rgba(134, 115, 161, 0.08)',
      };
    }

    if (appearance.cardVariant === 'akarii-prism') {
      return {
        backgroundColor: appearance.cardBackground,
        color: appearance.textColor,
        border: `1px solid ${appearance.borderColor}`,
        boxShadow:
          '0 22px 48px -12px rgba(0, 0, 0, 0.7), 0 0 28px -8px rgba(16, 185, 129, 0.14)',
      };
    }

    if (appearance.cardVariant === 'riff-studio') {
      return {
        backgroundColor: appearance.cardBackground,
        color: appearance.textColor,
        border: `1px solid ${appearance.borderColor}`,
        boxShadow: '0 6px 20px -6px rgba(40, 40, 36, 0.05)',
      };
    }

    if (appearance.cardVariant === 'gaming-hud') {
      return {
        backgroundColor: appearance.cardBackground,
        color: appearance.textColor,
        border: `2px solid ${appearance.primaryColor}`,
        boxShadow: `5px 5px 0px ${appearance.borderColor}, 0 0 28px ${appearance.primaryColor}22`,
      };
    }

    if (appearance.cardVariant === 'blueprint-cad') {
      return {
        backgroundColor: appearance.cardBackground,
        color: appearance.textColor,
        border: `2px solid ${appearance.borderColor}`,
        boxShadow: `5px 5px 0px rgba(8, 22, 38, 0.75)`,
      };
    }

    if (appearance.cardVariant === 'corporate-structured') {
      return {
        backgroundColor: appearance.cardBackground,
        color: appearance.textColor,
        border: `1.5px solid ${appearance.borderColor}`,
        boxShadow: '0 8px 24px -4px rgba(15, 23, 42, 0.08)',
      };
    }

    if (
      appearance.cardVariant === 'paper-outlined' ||
      appearance.cardVariant === 'pop-bold'
    ) {
      const bw = appearance.cardVariant === 'pop-bold' ? '3px' : '2px';
      return {
        backgroundColor: appearance.cardBackground,
        color: appearance.textColor,
        border: `${bw} solid ${appearance.borderColor}`,
        boxShadow: `6px 6px 0px ${appearance.borderColor}`,
      };
    }

    if (appearance.cardVariant === 'after-dark-panel') {
      return {
        backgroundColor: appearance.cardBackground,
        color: appearance.textColor,
        border: `1px solid ${appearance.borderColor}`,
        boxShadow: '0 20px 45px -10px rgba(0, 0, 0, 0.55)',
      };
    }

    return {
      backgroundColor: appearance.cardBackground,
      color: appearance.textColor,
      border: `1.5px solid ${appearance.borderColor}`,
      boxShadow: '0 10px 30px -6px rgba(15, 23, 42, 0.08)',
    };
  };

  return (
    <div
      style={getCardFrameStyle()}
      className={`w-full mx-auto overflow-hidden transition-all duration-200 ${widthClass} ${radiusClass}`}
    >
      {appearance.cardVariant === 'vamori-underground' ? (
        <div
          className="px-5 py-2 flex items-center justify-between border-b text-[10px] font-mono uppercase tracking-[0.18em]"
          style={{
            backgroundColor: '#000000',
            borderColor: appearance.borderColor,
            color: appearance.mutedTextColor,
          }}
          aria-hidden="true"
        >
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-2 h-2"
              style={{ backgroundColor: appearance.primaryColor }}
            />
            <span style={{ color: appearance.textColor }}>PASS // ENTRY</span>
            <span>+</span>
          </div>
          <svg
            width="68"
            height="12"
            viewBox="0 0 68 12"
            fill="none"
            className="opacity-80"
          >
            <rect x="0" y="1" width="2" height="10" fill={appearance.primaryColor} />
            <rect x="4" y="1" width="1" height="10" fill="currentColor" />
            <rect x="7" y="1" width="3" height="10" fill="currentColor" />
            <rect x="12" y="1" width="1" height="10" fill="currentColor" />
            <rect x="15" y="1" width="2" height="10" fill={appearance.primaryColor} />
            <rect x="19" y="1" width="4" height="10" fill="currentColor" />
            <rect x="25" y="1" width="1" height="10" fill="currentColor" />
            <rect x="28" y="1" width="2" height="10" fill="currentColor" />
            <rect x="32" y="1" width="3" height="10" fill={appearance.primaryColor} />
            <rect x="37" y="1" width="1" height="10" fill="currentColor" />
            <rect x="40" y="1" width="2" height="10" fill="currentColor" />
            <rect x="44" y="1" width="4" height="10" fill="currentColor" />
            <rect x="50" y="1" width="1" height="10" fill={appearance.primaryColor} />
            <rect x="53" y="1" width="2" height="10" fill="currentColor" />
            <rect x="57" y="1" width="3" height="10" fill="currentColor" />
            <rect x="62" y="1" width="1" height="10" fill="currentColor" />
            <rect x="65" y="1" width="3" height="10" fill={appearance.primaryColor} />
          </svg>
        </div>
      ) : appearance.cardVariant === 'veritas-midnight' ? (
        <div
          className="h-1 w-full"
          style={{
            backgroundImage: `linear-gradient(90deg, transparent 0%, ${appearance.primaryColor} 28%, #8B5CF6 55%, #FB7185 82%, transparent 100%)`,
          }}
          aria-hidden="true"
        />
      ) : appearance.cardVariant === 'akarii-prism' ? (
        <div
          className="h-1.5 w-full"
          style={{
            backgroundImage:
              'linear-gradient(90deg, #8B5CF6 0%, #EC4899 25%, #22D3EE 52%, #F59E0B 78%, #10B981 100%)',
          }}
          aria-hidden="true"
        />
      ) : appearance.cardVariant === 'tiny-lilac-card' ? (
        <div
          className="h-1.5 w-full"
          style={{
            backgroundImage: `linear-gradient(90deg, ${appearance.primaryColor} 0%, #E5A4CB 55%, ${appearance.primaryColor} 100%)`,
          }}
          aria-hidden="true"
        />
      ) : appearance.cardVariant === 'riff-studio' ? (
        <div
          className="px-6 sm:px-10 pt-5 flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.16em]"
          style={{ color: appearance.mutedTextColor }}
          aria-hidden="true"
        >
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: appearance.selectedOptionBorder }}
            />
            <span>EDITION // FOLIO</span>
          </div>
          <span
            className="h-[1px] flex-1 mx-4"
            style={{ backgroundColor: appearance.borderColor }}
          />
          <span style={{ color: appearance.primaryColor }}>§</span>
        </div>
      ) : (
        appearance.showTopRibbon && (
          <div
            className="h-3"
            style={{
              backgroundColor: appearance.primaryColor,
              borderBottom:
                appearance.templateId === 'paper' ||
                appearance.templateId === 'pop'
                  ? `2px solid ${appearance.borderColor}`
                  : `1px solid ${appearance.borderColor}`,
            }}
          />
        )
      )}

      <div className={densityClass}>{children}</div>

      {footer && (
        <div
          className="px-6 py-3 text-xs flex flex-wrap items-center justify-between gap-2"
          style={{
            backgroundColor: appearance.isDark
              ? 'rgba(255,255,255,0.03)'
              : 'rgba(0,0,0,0.025)',
            borderTop: `1.5px solid ${appearance.borderColor}`,
            color: appearance.mutedTextColor,
          }}
        >
          {footer}
        </div>
      )}
    </div>
  );
}

export function ThemedWelcomeScreen({
  appearance,
  title,
  description,
  buttonText,
  timeEstimate,
  questionCount,
  enabled = true,
  editableInline = false,
  onTitleChange,
  onDescriptionChange,
  onStart,
}: {
  appearance: ResolvedAppearanceTokens;
  title: string;
  description: string;
  buttonText: string;
  timeEstimate: string;
  questionCount: number;
  enabled?: boolean;
  editableInline?: boolean;
  onTitleChange?: (val: string) => void;
  onDescriptionChange?: (val: string) => void;
  onStart: () => void;
}) {
  const isCentered = appearance.contentAlignment === 'center';

  return (
    <div
      className={`space-y-5 py-2 ${isCentered ? 'text-center' : 'text-left'}`}
      style={{ color: appearance.textColor, fontFamily: appearance.bodyFontCss }}
    >
      {appearance.templateId === 'vamori' && (
        <div
          className={`flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.16em] pb-2 border-b border-dashed ${
            isCentered ? 'justify-center' : 'justify-between'
          }`}
          style={{
            borderColor: appearance.borderColor,
            color: appearance.primaryColor,
          }}
          aria-hidden="true"
        >
          <span>[ ADMIT ONE // INTERACTIVE SESSION ]</span>
          <span style={{ color: appearance.mutedTextColor }}>+ + +</span>
        </div>
      )}

      {appearance.templateId === 'veritas' && (
        <div
          className={`flex ${isCentered ? 'justify-center' : 'justify-start'}`}
          aria-hidden="true"
        >
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono tracking-wider uppercase"
            style={{
              backgroundColor: 'rgba(99, 102, 241, 0.14)',
              border: '1px solid rgba(139, 92, 246, 0.38)',
              color: '#C7D2FE',
            }}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-[#818CF8]" />
            <span>READY TO BEGIN</span>
          </span>
        </div>
      )}

      {appearance.templateId === 'tiny-et' && (
        <div
          className={`flex ${isCentered ? 'justify-center' : 'justify-start'}`}
          aria-hidden="true"
        >
          <span
            className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-semibold"
            style={{
              backgroundColor: '#EFEAF7',
              border: `1px solid ${appearance.borderColor}`,
              color: appearance.primaryColor,
            }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: '#E5A4CB' }}
            />
            <span>Quick & friendly check-in</span>
          </span>
        </div>
      )}

      {appearance.templateId === 'akarii' && (
        <div
          className={`flex items-center gap-2.5 ${
            isCentered ? 'justify-center' : 'justify-start'
          }`}
          aria-hidden="true"
        >
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono uppercase tracking-wider"
            style={{
              backgroundColor: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(52, 211, 153, 0.35)',
              color: '#34D399',
            }}
          >
            <Sparkles className="w-3 h-3" />
            <span>STUDIO PROMPT</span>
          </span>
          <span
            className="h-1 w-14 rounded-full"
            style={{
              backgroundImage:
                'linear-gradient(90deg, #8B5CF6, #EC4899, #22D3EE, #F59E0B, #10B981)',
            }}
          />
        </div>
      )}

      <div
        className={`inline-flex items-center gap-2 text-xs font-semibold ${
          isCentered ? 'justify-center' : ''
        }`}
        style={{ color: appearance.mutedTextColor }}
      >
        <Clock
          className="w-3.5 h-3.5"
          style={{ color: appearance.primaryColor }}
        />
        <span>{timeEstimate || 'Takes ~1 minute'}</span>
        <span aria-hidden="true">·</span>
        <span className="tabular-nums">{questionCount} questions</span>
        {!enabled && (
          <>
            <span aria-hidden="true">·</span>
            <span
              style={{ color: appearance.primaryColor }}
              className="font-bold"
            >
              Skipped in live presentation
            </span>
          </>
        )}
      </div>

      {editableInline && onTitleChange ? (
        <div>
          <label htmlFor="stage-welcome-title" className="sr-only">
            Welcome Screen Title
          </label>
          <textarea
            id="stage-welcome-title"
            rows={2}
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            style={{
              fontFamily: appearance.headingFontCss,
              color: appearance.textColor,
            }}
            className={`w-full text-2xl sm:text-4xl font-extrabold bg-transparent border-b-2 border-dashed border-transparent hover:border-current/30 focus:border-current focus:outline-none py-1 resize-none ${
              isCentered ? 'text-center' : 'text-left'
            }`}
          />
        </div>
      ) : (
        <h1
          className={`text-3xl sm:text-4xl font-extrabold leading-tight ${
            appearance.templateId === 'editorial' ||
            appearance.templateId === 'riff'
              ? 'sm:text-5xl font-bold tracking-tight'
              : appearance.templateId === 'vamori'
              ? 'sm:text-5xl font-black tracking-tight'
              : ''
          }`}
          style={{
            fontFamily: appearance.headingFontCss,
            color: appearance.textColor,
            textWrap: 'balance',
          }}
        >
          {title}
        </h1>
      )}

      {editableInline && onDescriptionChange ? (
        <div>
          <label htmlFor="stage-welcome-desc" className="sr-only">
            Welcome Screen Description
          </label>
          <textarea
            id="stage-welcome-desc"
            rows={2}
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            style={{ color: appearance.mutedTextColor }}
            className={`w-full text-base bg-transparent border-b border-dashed border-transparent hover:border-current/25 focus:border-current focus:outline-none py-1 resize-none ${
              isCentered ? 'text-center' : 'text-left'
            }`}
          />
        </div>
      ) : (
        description && (
          <p
            className="text-base sm:text-lg leading-relaxed"
            style={{ color: appearance.mutedTextColor }}
          >
            {description}
          </p>
        )
      )}

      <div
        className={`pt-2 flex items-center gap-3 ${
          isCentered ? 'justify-center' : ''
        }`}
      >
        <ThemedActionButton
          appearance={appearance}
          variant="primary"
          size="lg"
          onClick={onStart}
        >
          <span>{buttonText || 'Begin'}</span>
          <ArrowRight className="w-4 h-4" />
        </ThemedActionButton>
      </div>
    </div>
  );
}

export function ThemedCompletionBadge({
  appearance,
}: {
  appearance: ResolvedAppearanceTokens;
}) {
  if (appearance.showIllustratedStamp) {
    return <SketchStampBadge className="w-20 h-20" />;
  }

  if (appearance.templateId === 'vamori') {
    return (
      <div
        className="px-4 py-2.5 rounded-sm border-2 flex items-center gap-2.5 font-mono text-xs font-bold uppercase tracking-widest"
        style={{
          backgroundColor: '#000000',
          borderColor: appearance.primaryColor,
          color: appearance.primaryColor,
          boxShadow: `4px 4px 0px ${appearance.primaryColor}`,
        }}
      >
        <CheckCircle2 className="w-5 h-5" />
        <span>CONFIRMED // PASS ISSUED</span>
      </div>
    );
  }

  if (appearance.templateId === 'veritas') {
    return (
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{
          backgroundImage:
            'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.2), rgba(251,113,133,0.18))',
          border: '1.5px solid rgba(139, 92, 246, 0.55)',
          boxShadow: '0 0 28px rgba(99, 102, 241, 0.35)',
          color: '#A5B4FC',
        }}
      >
        <ShieldCheck className="w-8 h-8" />
      </div>
    );
  }

  if (appearance.templateId === 'tiny-et') {
    return (
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center"
        style={{
          backgroundColor: '#EFEAF7',
          border: '2px solid #E5A4CB',
          boxShadow: '0 8px 20px rgba(134, 115, 161, 0.2)',
          color: appearance.primaryColor,
        }}
      >
        <CheckCircle2 className="w-8 h-8" />
      </div>
    );
  }

  if (appearance.templateId === 'akarii') {
    return (
      <div
        className="p-[2px] rounded-2xl"
        style={{
          backgroundImage:
            'linear-gradient(135deg, #8B5CF6, #EC4899, #22D3EE, #F59E0B, #10B981)',
        }}
      >
        <div
          className="w-16 h-16 rounded-[14px] flex items-center justify-center"
          style={{
            backgroundColor: appearance.cardBackground,
            color: appearance.primaryColor,
          }}
        >
          <CheckCircle2 className="w-8 h-8" />
        </div>
      </div>
    );
  }

  if (appearance.templateId === 'riff') {
    return (
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center"
        style={{
          backgroundColor: '#F6F1E6',
          border: `1.5px solid ${appearance.selectedOptionBorder}`,
          color: appearance.primaryColor,
        }}
      >
        <CheckCircle2 className="w-8 h-8" />
      </div>
    );
  }

  const isSharp =
    appearance.templateId === 'gaming' ||
    appearance.templateId === 'blueprint' ||
    appearance.buttonShape === 'sharp';

  return (
    <div
      className={`w-16 h-16 flex items-center justify-center ${
        isSharp ? 'rounded-md' : 'rounded-full'
      }`}
      style={{
        backgroundColor: `${appearance.primaryColor}22`,
        border: `2px solid ${appearance.primaryColor}`,
        color: appearance.primaryColor,
      }}
    >
      <CheckCircle2 className="w-8 h-8" />
    </div>
  );
}
