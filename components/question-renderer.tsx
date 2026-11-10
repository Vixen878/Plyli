'use client';

import React from 'react';
import {
  FormQuestion,
  AnswerValue,
  QUESTION_TYPE_META,
} from '@/lib/form-engine';
import {
  ResolvedAppearanceTokens,
  resolveFormAppearance,
  getButtonRadiusClass,
} from '@/themes/appearance-registry';
import {
  Check,
  AlertCircle,
  Star,
  ChevronDown,
  CornerDownLeft,
  GitBranch,
} from 'lucide-react';

interface QuestionRendererProps {
  question: FormQuestion;
  stepNumber: number;
  totalSteps: number;
  value: AnswerValue;
  onChange: (val: AnswerValue) => void;
  onSubmitStep?: () => void;
  error?: string | null;
  editableInline?: boolean;
  onInlineUpdate?: (updates: Partial<FormQuestion>) => void;
  submitLabel?: string;
  appearance?: ResolvedAppearanceTokens;
}

export function ThemedActionButton({
  appearance,
  onClick,
  children,
  variant = 'primary',
  size = 'md',
  type = 'button',
  disabled = false,
}: {
  appearance: ResolvedAppearanceTokens;
  onClick?: () => void;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  type?: 'button' | 'submit';
  disabled?: boolean;
}) {
  const radiusClass = getButtonRadiusClass(appearance.buttonShape);
  const sizeClass =
    size === 'sm'
      ? 'px-3.5 py-1.5 text-xs gap-1.5'
      : size === 'lg'
      ? 'px-6 py-3 text-base gap-2.5'
      : 'px-5 py-2.5 text-sm gap-2';

  const isPrimary = variant === 'primary';
  const bg = isPrimary ? appearance.primaryColor : appearance.inputBackground;
  const color = isPrimary ? appearance.primaryTextColor : appearance.textColor;

  const isTactile = appearance.buttonShadow === 'tactile';
  const isSoft = appearance.buttonShadow === 'soft';

  const borderStyle =
    appearance.templateId === 'vamori'
      ? `1.5px solid ${isPrimary ? appearance.primaryColor : appearance.borderColor}`
      : appearance.templateId === 'paper' ||
        appearance.templateId === 'pop' ||
        isTactile
      ? `2px solid ${
          appearance.templateId === 'gaming' ||
          appearance.templateId === 'blueprint'
            ? appearance.primaryColor
            : appearance.borderColor
        }`
      : `1px solid ${isPrimary ? appearance.primaryColor : appearance.borderColor}`;

  const boxShadow =
    appearance.templateId === 'vamori' && isTactile
      ? '3px 3px 0px #000000'
      : appearance.templateId === 'veritas' && isPrimary
      ? `0 8px 24px -4px ${appearance.primaryColor}66`
      : appearance.templateId === 'tiny-et' && isPrimary
      ? '0 6px 16px -2px rgba(134, 115, 161, 0.32)'
      : appearance.templateId === 'akarii' && isPrimary
      ? `0 6px 18px -3px ${appearance.primaryColor}44`
      : isTactile
      ? `3px 3px 0px ${appearance.borderColor}`
      : isSoft
      ? '0 4px 12px rgba(0, 0, 0, 0.12)'
      : 'none';

  const backgroundImage =
    appearance.templateId === 'veritas' &&
    isPrimary &&
    appearance.primaryColor.toLowerCase() === '#6366f1'
      ? 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)'
      : 'none';

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={{
        backgroundColor: bg,
        backgroundImage,
        color,
        border: borderStyle,
        boxShadow,
        fontFamily: appearance.bodyFontCss,
      }}
      className={`inline-flex items-center justify-center font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 disabled:pointer-events-none ${
        isTactile
          ? 'active:translate-x-[1px] active:translate-y-[1px]'
          : 'hover:opacity-95'
      } ${radiusClass} ${sizeClass}`}
    >
      {children}
    </button>
  );
}

export function QuestionRenderer({
  question,
  stepNumber,
  totalSteps,
  value,
  onChange,
  onSubmitStep,
  error,
  editableInline = false,
  onInlineUpdate,
  submitLabel = 'OK',
  appearance: propAppearance,
}: QuestionRendererProps) {
  const tokens = propAppearance || resolveFormAppearance(undefined);
  const meta = QUESTION_TYPE_META[question.type];
  const isCentered = tokens.contentAlignment === 'center';

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (
      e.key === 'Enter' &&
      !e.shiftKey &&
      question.type !== 'long_text' &&
      onSubmitStep
    ) {
      e.preventDefault();
      onSubmitStep();
    }
  };

  const isChoiceSelected = (choiceId: string, choiceLabel: string): boolean => {
    if (value === null || value === undefined) return false;
    if (Array.isArray(value)) {
      return value.some(
        (v) =>
          String(v).toLowerCase() === choiceId.toLowerCase() ||
          String(v).toLowerCase() === choiceLabel.toLowerCase()
      );
    }
    return (
      String(value).toLowerCase() === choiceId.toLowerCase() ||
      String(value).toLowerCase() === choiceLabel.toLowerCase()
    );
  };

  const toggleMultiChoice = (choiceLabel: string) => {
    const current = Array.isArray(value) ? value : [];
    if (current.includes(choiceLabel)) {
      onChange(current.filter((item) => item !== choiceLabel));
    } else {
      onChange([...current, choiceLabel]);
    }
  };

  // Compute input styling based on tokens.inputVariant
  const getInputStyle = (): React.CSSProperties => {
    if (tokens.inputVariant === 'editorial-underline') {
      return {
        backgroundColor: 'transparent',
        color: tokens.textColor,
        borderBottom: `2px solid ${tokens.textColor}`,
        borderTop: 'none',
        borderLeft: 'none',
        borderRight: 'none',
        borderRadius: 0,
        fontFamily: tokens.bodyFontCss,
      };
    }
    if (tokens.inputVariant === 'vamori-industrial') {
      return {
        backgroundColor: tokens.inputBackground,
        color: tokens.textColor,
        border: `1.5px solid ${tokens.borderColor}`,
        boxShadow: '3px 3px 0px #000000',
        fontFamily: tokens.bodyFontCss,
      };
    }
    if (tokens.inputVariant === 'veritas-glass') {
      return {
        backgroundColor: tokens.inputBackground,
        color: tokens.textColor,
        border: '1px solid rgba(255, 255, 255, 0.14)',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
        fontFamily: tokens.bodyFontCss,
      };
    }
    if (tokens.inputVariant === 'tiny-lilac') {
      return {
        backgroundColor: tokens.inputBackground,
        color: tokens.textColor,
        border: `1.5px solid ${tokens.borderColor}`,
        boxShadow: '0 2px 8px rgba(134, 115, 161, 0.08)',
        fontFamily: tokens.bodyFontCss,
      };
    }
    if (tokens.inputVariant === 'akarii-studio') {
      return {
        backgroundColor: tokens.inputBackground,
        color: tokens.textColor,
        border: `1.5px solid ${tokens.borderColor}`,
        boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.45)',
        fontFamily: tokens.bodyFontCss,
      };
    }
    if (tokens.inputVariant === 'riff-editorial') {
      return {
        backgroundColor: tokens.inputBackground,
        color: tokens.textColor,
        border: `1px solid ${tokens.borderColor}`,
        fontFamily: tokens.bodyFontCss,
      };
    }
    if (
      tokens.inputVariant === 'hud-console' ||
      tokens.inputVariant === 'cad-spec'
    ) {
      return {
        backgroundColor: tokens.inputBackground,
        color: tokens.textColor,
        border: `1.5px solid ${tokens.borderColor}`,
        boxShadow: `inset 0 1px 3px rgba(0,0,0,0.35)`,
        fontFamily: tokens.bodyFontCss,
      };
    }
    if (
      tokens.inputVariant === 'tactile-box' ||
      tokens.inputVariant === 'pop-chunky'
    ) {
      const borderWidth = tokens.inputVariant === 'pop-chunky' ? '3px' : '2px';
      return {
        backgroundColor: tokens.inputBackground,
        color: tokens.textColor,
        border: `${borderWidth} solid ${tokens.borderColor}`,
        boxShadow: `3px 3px 0px ${tokens.borderColor}`,
        fontFamily: tokens.bodyFontCss,
      };
    }
    return {
      backgroundColor: tokens.inputBackground,
      color: tokens.textColor,
      border: `1.5px solid ${tokens.borderColor}`,
      fontFamily: tokens.bodyFontCss,
    };
  };

  const inputRadiusClass =
    tokens.inputVariant === 'editorial-underline'
      ? 'rounded-none px-1 py-3'
      : tokens.cornerRadius === 'sm'
      ? 'rounded-md px-4 py-3'
      : tokens.cornerRadius === 'md'
      ? 'rounded-xl px-4 py-3'
      : 'rounded-2xl px-4 py-3.5';

  // Choice option card style helper
  const getOptionStyle = (
    selected: boolean,
    yesNoVariant?: 'Yes' | 'No'
  ): React.CSSProperties => {
    const isPaperOrPop =
      tokens.templateId === 'paper' || tokens.templateId === 'pop';

    let selectedBg = tokens.selectedOptionBg;
    if (tokens.templateId === 'paper' && yesNoVariant) {
      selectedBg = yesNoVariant === 'Yes' ? '#C5DFC9' : '#F5C4CB';
    } else if (
      tokens.templateId === 'paper' &&
      question.type === 'multiple_choice'
    ) {
      selectedBg = '#F5C4CB';
    }

    if (tokens.inputVariant === 'editorial-underline') {
      return {
        backgroundColor: selected ? selectedBg : 'transparent',
        color: selected ? tokens.selectedOptionText : tokens.textColor,
        borderBottom: `1px solid ${
          selected ? tokens.selectedOptionBorder : tokens.borderColor
        }`,
        borderTop: 'none',
        borderLeft: selected ? `3px solid ${tokens.primaryColor}` : 'none',
        borderRight: 'none',
        borderRadius: 0,
      };
    }

    if (tokens.inputVariant === 'vamori-industrial') {
      return {
        backgroundColor: selected ? selectedBg : tokens.inputBackground,
        color: selected ? tokens.selectedOptionText : tokens.textColor,
        border: `1.5px solid ${
          selected ? tokens.selectedOptionBorder : tokens.borderColor
        }`,
        boxShadow: selected
          ? `3px 3px 0px ${tokens.primaryColor}`
          : '2px 2px 0px #000000',
      };
    }

    if (tokens.inputVariant === 'veritas-glass') {
      return {
        backgroundColor: selected ? selectedBg : tokens.inputBackground,
        color: selected ? tokens.selectedOptionText : tokens.textColor,
        border: `1.5px solid ${
          selected ? tokens.selectedOptionBorder : 'rgba(255, 255, 255, 0.12)'
        }`,
        boxShadow: selected
          ? '0 0 22px -4px rgba(99, 102, 241, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.12)'
          : 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
      };
    }

    if (tokens.inputVariant === 'tiny-lilac') {
      return {
        backgroundColor: selected ? selectedBg : tokens.inputBackground,
        color: selected ? tokens.selectedOptionText : tokens.textColor,
        border: `1.5px solid ${
          selected ? tokens.selectedOptionBorder : tokens.borderColor
        }`,
        boxShadow: selected
          ? '0 6px 16px -4px rgba(134, 115, 161, 0.22)'
          : '0 2px 6px rgba(134, 115, 161, 0.06)',
      };
    }

    if (tokens.inputVariant === 'akarii-studio') {
      return {
        backgroundColor: selected ? selectedBg : tokens.inputBackground,
        color: selected ? tokens.selectedOptionText : tokens.textColor,
        border: `1.5px solid ${
          selected ? tokens.selectedOptionBorder : tokens.borderColor
        }`,
        boxShadow: selected
          ? '0 0 16px -2px rgba(52, 211, 153, 0.25)'
          : 'none',
      };
    }

    if (tokens.inputVariant === 'riff-editorial') {
      return {
        backgroundColor: selected ? selectedBg : tokens.inputBackground,
        color: selected ? tokens.selectedOptionText : tokens.textColor,
        borderTop: `1px solid ${
          selected ? tokens.selectedOptionBorder : tokens.borderColor
        }`,
        borderRight: `1px solid ${
          selected ? tokens.selectedOptionBorder : tokens.borderColor
        }`,
        borderBottom: `1px solid ${
          selected ? tokens.selectedOptionBorder : tokens.borderColor
        }`,
        borderLeft: selected
          ? `3.5px solid ${tokens.selectedOptionBorder}`
          : `1px solid ${tokens.borderColor}`,
      };
    }

    if (isPaperOrPop) {
      const bw = tokens.templateId === 'pop' ? '2.5px' : '2px';
      return {
        backgroundColor: selected ? selectedBg : tokens.inputBackground,
        color: selected ? tokens.selectedOptionText : tokens.textColor,
        border: `${bw} solid ${tokens.borderColor}`,
        boxShadow: selected
          ? `2px 2px 0px ${tokens.borderColor}`
          : `3px 3px 0px ${tokens.borderColor}`,
      };
    }

    return {
      backgroundColor: selected ? selectedBg : tokens.inputBackground,
      color: selected ? tokens.selectedOptionText : tokens.textColor,
      border: `1.5px solid ${
        selected ? tokens.selectedOptionBorder : tokens.borderColor
      }`,
      boxShadow: selected ? `0 0 0 1px ${tokens.selectedOptionBorder}` : 'none',
    };
  };

  return (
    <div
      className={`w-full ${isCentered ? 'text-center' : 'text-left'}`}
      style={{ color: tokens.textColor, fontFamily: tokens.bodyFontCss }}
      onKeyDown={handleKeyDown}
    >
      <div
        className={`flex items-center gap-4 mb-3 ${
          isCentered ? 'justify-center' : 'justify-between'
        }`}
      >
        <div
          className="flex items-center gap-2 text-xs font-semibold tabular-nums"
          style={{ color: tokens.mutedTextColor }}
        >
          <span className="font-mono font-bold" style={{ color: tokens.textColor }}>
            {String(stepNumber).padStart(2, '0')} / {String(totalSteps).padStart(2, '0')}
          </span>
          {editableInline && <><span aria-hidden="true">·</span><span>{meta.label}</span></>}
          {question.required && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-bold" style={{ color: tokens.primaryColor }}>
                Required *
              </span>
            </>
          )}
        </div>

        {editableInline && question.logicRules && question.logicRules.length > 0 && (
          <div
            className="inline-flex items-center gap-1.5 text-xs font-medium rounded-lg px-2 py-0.5"
            style={{
              backgroundColor: tokens.selectedOptionBg,
              color: tokens.selectedOptionText,
              border: `1px solid ${tokens.borderColor}`,
            }}
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span className="tabular-nums">
              {question.logicRules.length}{' '}
              {question.logicRules.length === 1 ? 'branch rule' : 'branch rules'}
            </span>
          </div>
        )}
      </div>
      {editableInline && onInlineUpdate ? (
        <div className="mb-2">
          <label htmlFor={`inline-title-${question.id}`} className="sr-only">
            Question Title
          </label>
          <textarea
            id={`inline-title-${question.id}`}
            rows={2}
            value={question.title}
            onChange={(e) => onInlineUpdate({ title: e.target.value })}
            placeholder="Write your question title..."
            style={{
              fontFamily: tokens.headingFontCss,
              color: tokens.textColor,
            }}
            className={`w-full text-xl sm:text-2xl font-bold leading-snug bg-transparent border-b-2 border-dashed border-transparent hover:border-current/30 focus:border-current focus:outline-none py-1 transition-colors resize-none ${
              isCentered ? 'text-center' : 'text-left'
            }`}
          />
        </div>
      ) : (
        <h2
          className={`text-2xl sm:text-3xl font-bold leading-snug mb-2 ${
            tokens.templateId === 'editorial' ? 'sm:text-4xl font-semibold' : ''
          }`}
          style={{
            fontFamily: tokens.headingFontCss,
            color: tokens.textColor,
            textWrap: 'balance',
          }}
        >
          {question.title}
          {question.required && (
            <span
              className="ml-1"
              style={{ color: tokens.primaryColor }}
              aria-hidden="true"
            >
              *
            </span>
          )}
        </h2>
      )}
      {editableInline && onInlineUpdate ? (
        <div className="mb-6">
          <label htmlFor={`inline-desc-${question.id}`} className="sr-only">
            Question Description
          </label>
          <input
            id={`inline-desc-${question.id}`}
            type="text"
            value={question.description}
            onChange={(e) => onInlineUpdate({ description: e.target.value })}
            placeholder="Add an optional helper description or note..."
            style={{ color: tokens.mutedTextColor }}
            className={`w-full text-sm sm:text-base bg-transparent border-b border-dashed border-transparent hover:border-current/25 focus:border-current focus:outline-none py-1 transition-colors ${
              isCentered ? 'text-center' : 'text-left'
            }`}
          />
        </div>
      ) : (
        question.description && (
          <p
            className="text-sm sm:text-base leading-relaxed mb-6"
            style={{ color: tokens.mutedTextColor }}
          >
            {question.description}
          </p>
        )
      )}

      {!question.description && !editableInline && <div className="mb-6" />}
      <div className="space-y-3">
        {question.type === 'short_text' && (
          <div>
            <label htmlFor={`q-input-${question.id}`} className="sr-only">
              {question.title}
            </label>
            <input
              id={`q-input-${question.id}`}
              type="text"
              value={typeof value === 'string' ? value : ''}
              onChange={(e) => onChange(e.target.value)}
              placeholder={question.placeholder || 'Type your answer here...'}
              style={getInputStyle()}
              className={`w-full text-base sm:text-lg font-medium focus:outline-none transition-colors ${inputRadiusClass}`}
            />
            {(typeof question.minLength === 'number' ||
              typeof question.maxLength === 'number') && (
              <p
                className="mt-1.5 text-xs font-mono tabular-nums"
                style={{ color: tokens.mutedTextColor }}
              >
                {typeof question.minLength === 'number' &&
                typeof question.maxLength === 'number'
                  ? `Length: ${question.minLength}–${question.maxLength} characters`
                  : typeof question.minLength === 'number'
                  ? `Minimum ${question.minLength} characters`
                  : `Maximum ${question.maxLength} characters`}
              </p>
            )}
          </div>
        )}

        {question.type === 'long_text' && (
          <div>
            <label htmlFor={`q-input-${question.id}`} className="sr-only">
              {question.title}
            </label>
            <textarea
              id={`q-input-${question.id}`}
              rows={4}
              value={typeof value === 'string' ? value : ''}
              onChange={(e) => onChange(e.target.value)}
              placeholder={question.placeholder || 'Write your thoughts here...'}
              style={getInputStyle()}
              className={`w-full text-base font-medium focus:outline-none transition-colors resize-y ${inputRadiusClass}`}
            />
            {(typeof question.minLength === 'number' ||
              typeof question.maxLength === 'number') && (
              <p
                className="mt-1.5 text-xs font-mono tabular-nums"
                style={{ color: tokens.mutedTextColor }}
              >
                {typeof question.minLength === 'number' &&
                typeof question.maxLength === 'number'
                  ? `Length: ${question.minLength}–${question.maxLength} characters`
                  : typeof question.minLength === 'number'
                  ? `Minimum ${question.minLength} characters`
                  : `Maximum ${question.maxLength} characters`}
              </p>
            )}
          </div>
        )}

        {question.type === 'email' && (
          <div>
            <label htmlFor={`q-input-${question.id}`} className="sr-only">
              {question.title}
            </label>
            <input
              id={`q-input-${question.id}`}
              type="email"
              value={typeof value === 'string' ? value : ''}
              onChange={(e) => onChange(e.target.value)}
              placeholder={question.placeholder || 'name@studio.com'}
              style={getInputStyle()}
              className={`w-full text-base sm:text-lg font-medium focus:outline-none transition-colors ${inputRadiusClass}`}
            />
          </div>
        )}

        {question.type === 'number' && (
          <div className={isCentered ? 'flex flex-col items-center' : ''}>
            <label htmlFor={`q-input-${question.id}`} className="sr-only">
              {question.title}
            </label>
            <input
              id={`q-input-${question.id}`}
              type="number"
              min={question.minNumber}
              max={question.maxNumber}
              value={value !== undefined && value !== null ? String(value) : ''}
              onChange={(e) =>
                onChange(e.target.value === '' ? '' : Number(e.target.value))
              }
              placeholder={question.placeholder || '0'}
              style={getInputStyle()}
              className={`w-full sm:max-w-xs text-lg font-mono font-semibold focus:outline-none tabular-nums transition-colors ${inputRadiusClass}`}
            />
            {(typeof question.minNumber === 'number' ||
              typeof question.maxNumber === 'number') && (
              <p
                className="mt-2 text-xs font-mono tabular-nums"
                style={{ color: tokens.mutedTextColor }}
              >
                {typeof question.minNumber === 'number' &&
                typeof question.maxNumber === 'number'
                  ? `Allowed range: ${question.minNumber} to ${question.maxNumber}`
                  : typeof question.minNumber === 'number'
                  ? `Minimum: ${question.minNumber}`
                  : `Maximum: ${question.maxNumber}`}
              </p>
            )}
          </div>
        )}

        {question.type === 'date' && (
          <div className={`relative sm:max-w-xs ${isCentered ? 'mx-auto' : ''}`}>
            <label htmlFor={`q-input-${question.id}`} className="sr-only">
              {question.title}
            </label>
            <input
              id={`q-input-${question.id}`}
              type="date"
              value={typeof value === 'string' ? value : ''}
              onChange={(e) => onChange(e.target.value)}
              style={getInputStyle()}
              className={`w-full text-base font-mono font-semibold focus:outline-none transition-colors ${inputRadiusClass}`}
            />
          </div>
        )}

        {question.type === 'dropdown' && (
          <div className="relative">
            <label htmlFor={`q-input-${question.id}`} className="sr-only">
              {question.title}
            </label>
            <div className="relative">
              <select
                id={`q-input-${question.id}`}
                value={typeof value === 'string' ? value : ''}
                onChange={(e) => onChange(e.target.value)}
                style={{
                  ...getInputStyle(),
                  backgroundColor:
                    tokens.inputBackground === 'transparent'
                      ? tokens.cardBackground
                      : tokens.inputBackground,
                }}
                className={`w-full appearance-none pr-10 text-base font-semibold focus:outline-none cursor-pointer transition-colors ${inputRadiusClass}`}
              >
                <option
                  value=""
                  style={{
                    backgroundColor: tokens.cardBackground,
                    color: tokens.mutedTextColor,
                  }}
                >
                  Select an option...
                </option>
                {(question.choices || []).map((choice) => (
                  <option
                    key={choice.id}
                    value={choice.label}
                    style={{
                      backgroundColor: tokens.cardBackground,
                      color: tokens.textColor,
                    }}
                  >
                    {choice.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="w-5 h-5 pointer-events-none absolute right-4 top-1/2 -translate-y-1/2"
                style={{ color: tokens.textColor }}
              />
            </div>
          </div>
        )}

        {question.type === 'single_choice' && (
          <div
            className="grid grid-cols-1 gap-2.5"
            role="radiogroup"
            aria-label={question.title}
          >
            {(question.choices || []).map((choice, idx) => {
              const letter = String.fromCharCode(65 + idx);
              const isSelected = isChoiceSelected(choice.id, choice.label);
              return (
                <button
                  key={choice.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => onChange(choice.label)}
                  style={getOptionStyle(isSelected)}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-all cursor-pointer ${
                    tokens.inputVariant === 'editorial-underline'
                      ? 'rounded-none'
                      : 'rounded-2xl'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      style={{
                        backgroundColor: isSelected
                          ? tokens.primaryColor
                          : tokens.canvasBackground,
                        color: isSelected
                          ? tokens.primaryTextColor
                          : tokens.textColor,
                        borderColor: tokens.borderColor,
                      }}
                      className="w-7 h-7 rounded-lg border font-mono text-xs font-bold flex items-center justify-center shrink-0"
                    >
                      {letter}
                    </span>
                    <span className="font-semibold text-sm sm:text-base truncate">
                      {choice.label}
                    </span>
                  </div>
                  <div
                    style={{
                      borderColor: isSelected
                        ? tokens.primaryColor
                        : tokens.borderColor,
                      backgroundColor: isSelected
                        ? tokens.primaryColor
                        : 'transparent',
                    }}
                    className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0"
                  >
                    {isSelected && (
                      <Check
                        className="w-3 h-3 stroke-[3]"
                        style={{ color: tokens.primaryTextColor }}
                      />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {question.type === 'multiple_choice' && (
          <div className="space-y-2">
            <div
              className="grid grid-cols-1 gap-2.5"
              role="group"
              aria-label={question.title}
            >
              {(question.choices || []).map((choice, idx) => {
                const letter = String.fromCharCode(65 + idx);
                const isSelected = isChoiceSelected(choice.id, choice.label);
                return (
                  <button
                    key={choice.id}
                    type="button"
                    role="checkbox"
                    aria-checked={isSelected}
                    onClick={() => toggleMultiChoice(choice.label)}
                    style={getOptionStyle(isSelected)}
                    className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-all cursor-pointer ${
                      tokens.inputVariant === 'editorial-underline'
                        ? 'rounded-none'
                        : 'rounded-2xl'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        style={{
                          backgroundColor: isSelected
                            ? tokens.primaryColor
                            : tokens.canvasBackground,
                          color: isSelected
                            ? tokens.primaryTextColor
                            : tokens.textColor,
                          borderColor: tokens.borderColor,
                        }}
                        className="w-7 h-7 rounded-lg border font-mono text-xs font-bold flex items-center justify-center shrink-0"
                      >
                        {letter}
                      </span>
                      <span className="font-semibold text-sm sm:text-base truncate">
                        {choice.label}
                      </span>
                    </div>
                    <div
                      style={{
                        borderColor: isSelected
                          ? tokens.primaryColor
                          : tokens.borderColor,
                        backgroundColor: isSelected
                          ? tokens.primaryColor
                          : 'transparent',
                      }}
                      className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0"
                    >
                      {isSelected && (
                        <Check
                          className="w-3.5 h-3.5 stroke-[3]"
                          style={{ color: tokens.primaryTextColor }}
                        />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            {(typeof question.minChoices === 'number' ||
              typeof question.maxChoices === 'number') && (
              <p
                className="text-xs font-mono tabular-nums"
                style={{ color: tokens.mutedTextColor }}
              >
                {typeof question.minChoices === 'number' &&
                typeof question.maxChoices === 'number'
                  ? `Select between ${question.minChoices} and ${question.maxChoices} options`
                  : typeof question.minChoices === 'number'
                  ? `Select at least ${question.minChoices} ${
                      question.minChoices === 1 ? 'option' : 'options'
                    }`
                  : `Select up to ${question.maxChoices} ${
                      question.maxChoices === 1 ? 'option' : 'options'
                    }`}
              </p>
            )}
          </div>
        )}

        {question.type === 'yes_no' && (
          <div
            className={`grid grid-cols-2 gap-3 sm:max-w-md ${
              isCentered ? 'mx-auto' : ''
            }`}
            role="radiogroup"
            aria-label={question.title}
          >
            {(['Yes', 'No'] as const).map((option) => {
              const isSelected =
                String(value ?? '').toLowerCase() === option.toLowerCase();
              const keyHint = option === 'Yes' ? 'Y' : 'N';
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => onChange(option)}
                  style={getOptionStyle(isSelected, option)}
                  className={`flex items-center justify-between px-4 py-3.5 transition-all cursor-pointer ${
                    tokens.inputVariant === 'editorial-underline'
                      ? 'rounded-none'
                      : 'rounded-2xl'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      style={{
                        backgroundColor: isSelected
                          ? tokens.primaryColor
                          : tokens.canvasBackground,
                        color: isSelected
                          ? tokens.primaryTextColor
                          : tokens.textColor,
                        borderColor: tokens.borderColor,
                      }}
                      className="w-7 h-7 rounded-lg border font-mono text-xs font-bold flex items-center justify-center"
                    >
                      {keyHint}
                    </span>
                    <span className="font-bold text-base">{option}</span>
                  </div>
                  {isSelected && <Check className="w-4 h-4 stroke-[3]" />}
                </button>
              );
            })}
          </div>
        )}

        {question.type === 'rating' && (
          <div>
            <div
              className={`flex flex-wrap items-center gap-2.5 ${
                isCentered ? 'justify-center' : ''
              }`}
              role="radiogroup"
              aria-label={question.title}
            >
              {Array.from({ length: question.maxRating || 5 }, (_, idx) => {
                const score = idx + 1;
                const numericVal = Number(value);
                const isSelected = numericVal === score;
                const isHighlighted = !Number.isNaN(numericVal) && score <= numericVal;
                return (
                  <button
                    key={score}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    aria-label={`Rate ${score} out of ${question.maxRating || 5}`}
                    onClick={() => onChange(score)}
                    style={{
                      backgroundColor: isSelected
                        ? tokens.primaryColor
                        : isHighlighted
                        ? tokens.selectedOptionBg
                        : tokens.inputBackground === 'transparent'
                        ? tokens.cardBackground
                        : tokens.inputBackground,
                      color: isSelected
                        ? tokens.primaryTextColor
                        : isHighlighted
                        ? tokens.selectedOptionText
                        : tokens.textColor,
                      border: `2px solid ${
                        isSelected ? tokens.primaryColor : tokens.borderColor
                      }`,
                      boxShadow:
                        tokens.buttonShadow === 'tactile'
                          ? `2px 2px 0px ${tokens.borderColor}`
                          : 'none',
                    }}
                    className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex flex-col items-center justify-center gap-0.5 font-mono font-bold transition-all cursor-pointer tabular-nums"
                  >
                    <Star
                      className={`w-4 h-4 ${
                        isSelected || isHighlighted ? 'fill-current' : 'opacity-60'
                      }`}
                    />
                    <span className="text-xs">{score}</span>
                  </button>
                );
              })}
            </div>
            <div
              className={`flex items-center justify-between sm:max-w-xs mt-2 text-xs font-medium ${
                isCentered ? 'mx-auto' : ''
              }`}
              style={{ color: tokens.mutedTextColor }}
            >
              <span>1 · Needs work</span>
              <span>{question.maxRating || 5} · Outstanding</span>
            </div>
          </div>
        )}
      </div>
      {error && (
        <div
          role="alert"
          style={{
            backgroundColor: tokens.errorBg,
            borderColor: tokens.errorBorder,
            color: tokens.errorText,
          }}
          className="mt-4 flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border-2 text-xs sm:text-sm font-semibold"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {onSubmitStep && (
        <div
          className={`mt-7 flex items-center gap-3 ${
            isCentered ? 'justify-center' : ''
          }`}
        >
          <ThemedActionButton
            appearance={tokens}
            variant="primary"
            size="md"
            onClick={onSubmitStep}
          >
            <span>{submitLabel}</span>
            <Check className="w-4 h-4" />
          </ThemedActionButton>
          {question.type !== 'long_text' && (
            <span
              className="hidden sm:inline-flex items-center gap-1 text-xs font-medium"
              style={{ color: tokens.mutedTextColor }}
            >
              press{' '}
              <strong className="font-mono" style={{ color: tokens.textColor }}>
                Enter
              </strong>
              <CornerDownLeft className="w-3.5 h-3.5" />
            </span>
          )}
        </div>
      )}
    </div>
  );
}
