// Generated from Plyli core/validation.ts; run pnpm sdk:sync in Plyli.
import { FormSchema, FormQuestion, AnswerValue } from './types.js';
import { computeActiveQuestionSequence } from './branching.js';

export interface QuestionValidationResult {
  valid: boolean;
  error?: string;
}

export function isValidCalendarDateString(str: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

export function validateQuestionAnswer(
  question: FormQuestion,
  value: AnswerValue
): QuestionValidationResult {
  const isEmpty =
    value === null ||
    value === undefined ||
    (typeof value === 'string' && value.trim() === '') ||
    (Array.isArray(value) && value.length === 0) ||
    (typeof value === 'number' && !Number.isFinite(value));

  if (isEmpty) {
    if (question.required) {
      return {
        valid: false,
        error: 'Please provide an answer before continuing.',
      };
    }
    return { valid: true };
  }

  // Scalar questions cannot accept array coercions (e.g. ['yes'] as a branch
  // answer). Enforce this here so previews and the hosted API agree.
  if (Array.isArray(value) && question.type !== 'multiple_choice') {
    return { valid: false, error: 'Please provide a single answer.' };
  }
  if (question.type === 'multiple_choice' && Array.isArray(value)) {
    const canonical = value.map((item) => {
      const match = question.choices?.find((c) => [c.id.toLowerCase(), c.label.toLowerCase()].includes(item.trim().toLowerCase()));
      return match?.id ?? item.trim().toLowerCase();
    });
    if (new Set(canonical).size !== canonical.length) {
      return { valid: false, error: 'Please select each option only once.' };
    }
  }

  // Text length constraints
  if (question.type === 'short_text' || question.type === 'long_text') {
    const str = String(value).trim();
    if (
      typeof question.minLength === 'number' &&
      str.length < question.minLength
    ) {
      return {
        valid: false,
        error: `Please enter at least ${question.minLength} characters.`,
      };
    }
    if (
      typeof question.maxLength === 'number' &&
      str.length > question.maxLength
    ) {
      return {
        valid: false,
        error: `Please keep your answer under ${question.maxLength} characters.`,
      };
    }
  }

  if (question.type === 'email') {
    const str = String(value).trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(str)) {
      return {
        valid: false,
        error:
          'Please enter a valid email address (for example, alex@paper.co).',
      };
    }
  }

  if (question.type === 'number') {
    if (typeof value === 'boolean' || Array.isArray(value)) {
      return {
        valid: false,
        error: 'Please enter a valid number.',
      };
    }
    const num =
      typeof value === 'number' ? value : Number(String(value).trim());
    if (!Number.isFinite(num)) {
      return {
        valid: false,
        error: 'Please enter a valid number.',
      };
    }
    if (typeof question.minNumber === 'number' && num < question.minNumber) {
      return {
        valid: false,
        error: `Please enter a number of at least ${question.minNumber}.`,
      };
    }
    if (typeof question.maxNumber === 'number' && num > question.maxNumber) {
      return {
        valid: false,
        error: `Please enter a number no greater than ${question.maxNumber}.`,
      };
    }
  }

  if (question.type === 'rating') {
    if (typeof value === 'boolean' || Array.isArray(value)) {
      return {
        valid: false,
        error: `Please pick a rating between 1 and ${question.maxRating || 5}.`,
      };
    }
    const num =
      typeof value === 'number' ? value : Number(String(value).trim());
    const max = question.maxRating || 5;
    if (!Number.isFinite(num) || !Number.isInteger(num) || num < 1 || num > max) {
      return {
        valid: false,
        error: `Please pick a rating between 1 and ${max}.`,
      };
    }
  }

  if (question.type === 'date') {
    const str = String(value).trim();
    if (!isValidCalendarDateString(str)) {
      return {
        valid: false,
        error: 'Please select a valid calendar date.',
      };
    }
  }

  if (question.type === 'yes_no') {
    const options =
      question.choices && question.choices.length > 0
        ? question.choices
        : [
            { id: 'yes', label: 'Yes' },
            { id: 'no', label: 'No' },
          ];
    const str = String(value).trim();
    const validOption = options.some(
      (c) =>
        c.id.toLowerCase() === str.toLowerCase() ||
        c.label.toLowerCase() === str.toLowerCase()
    );
    if (!validOption) {
      return {
        valid: false,
        error: 'Please select Yes or No.',
      };
    }
  }

  if (
    (question.type === 'single_choice' || question.type === 'dropdown') &&
    question.choices &&
    question.choices.length > 0
  ) {
    const str = String(value).trim();
    const validOption = question.choices.some(
      (c) =>
        c.id.toLowerCase() === str.toLowerCase() ||
        c.label.toLowerCase() === str.toLowerCase()
    );
    if (!validOption) {
      return {
        valid: false,
        error: 'Please select one of the available options.',
      };
    }
  }

  if (question.type === 'multiple_choice') {
    const arr = Array.isArray(value) ? value : [String(value)];
    if (
      typeof question.minChoices === 'number' &&
      arr.length < question.minChoices
    ) {
      return {
        valid: false,
        error: `Please select at least ${question.minChoices} options.`,
      };
    }
    if (
      typeof question.maxChoices === 'number' &&
      arr.length > question.maxChoices
    ) {
      return {
        valid: false,
        error: `Please select no more than ${question.maxChoices} options.`,
      };
    }
    if (question.choices && question.choices.length > 0) {
      const allValid = arr.every((item) =>
        question.choices!.some(
          (c) =>
            c.id.toLowerCase() === String(item).trim().toLowerCase() ||
            c.label.toLowerCase() === String(item).trim().toLowerCase()
        )
      );
      if (!allValid) {
        return {
          valid: false,
          error: 'One or more selected options are not valid for this question.',
        };
      }
    }
  }

  return { valid: true };
}

export interface SubmissionValidationResult {
  valid: boolean;
  errors: Record<string, string>;
  activeQuestionIds: string[];
  skippedQuestionIds: string[];
}

/**
 * Validates an entire form submission while respecting conditional branching.
 * Only questions along the respondent's active reachable path are validated;
 * skipped required questions do not block submission.
 */
export function validateSubmission(
  form: FormSchema,
  answers: Record<string, AnswerValue>
): SubmissionValidationResult {
  const activeQuestionIds = computeActiveQuestionSequence(form, answers);
  const activeSet = new Set(activeQuestionIds);
  const skippedQuestionIds = form.questions
    .filter((q) => !activeSet.has(q.id))
    .map((q) => q.id);

  const errors: Record<string, string> = {};

  for (const qId of activeQuestionIds) {
    const question = form.questions.find((q) => q.id === qId);
    if (!question) continue;
    const result = validateQuestionAnswer(question, answers[qId]);
    if (!result.valid && result.error) {
      errors[qId] = result.error;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    activeQuestionIds,
    skippedQuestionIds,
  };
}
