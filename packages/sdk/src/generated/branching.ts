// Generated from Plyli core/branching.ts; run pnpm sdk:sync in Plyli.
import {
  FormSchema,
  FormQuestion,
  LogicRule,
  AnswerValue,
  ChoiceOption,
} from './types.js';

export function normalizeAnswerString(
  value: AnswerValue,
  question?: FormQuestion
): string {
  if (value === null || value === undefined) return '';
  if (question?.choices && question.choices.length > 0) {
    if (Array.isArray(value)) {
      return value
        .map((v) => {
          const matched = question.choices?.find(
            (c) => c.id === String(v) || c.label === String(v)
          );
          return matched ? matched.label : String(v);
        })
        .join(', ');
    }
    const matched = question.choices.find(
      (c) => c.id === String(value) || c.label === String(value)
    );
    if (matched) return matched.label;
  }
  if (Array.isArray(value)) return value.join(', ');
  return String(value).trim();
}

/**
 * Evaluates whether a single branching rule condition is satisfied.
 * Supports matching against either stable choice IDs or human-readable choice labels.
 */
export function evaluateRuleCondition(
  rule: LogicRule,
  value: AnswerValue,
  question?: FormQuestion
): boolean {
  const hasAnswer =
    value !== null &&
    value !== undefined &&
    (Array.isArray(value) ? value.length > 0 : String(value).trim().length > 0);

  if (rule.operator === 'is_answered') {
    return hasAnswer;
  }

  if (!hasAnswer) return false;

  const targetRaw = (rule.value || '').trim();
  const targetLower = targetRaw.toLowerCase();

  // If question has choices, resolve target choice so rule can match by either choice.id or choice.label
  const matchedTargetChoice = question?.choices?.find(
    (c) =>
      c.id.toLowerCase() === targetLower || c.label.toLowerCase() === targetLower
  );

  const matchesSingleToken = (token: string): boolean => {
    const t = token.trim().toLowerCase();
    if (t === targetLower) return true;
    if (matchedTargetChoice) {
      return (
        t === matchedTargetChoice.id.toLowerCase() ||
        t === matchedTargetChoice.label.toLowerCase()
      );
    }
    return false;
  };

  switch (rule.operator) {
    case 'equals':
      if (Array.isArray(value)) {
        return value.some((item) => matchesSingleToken(String(item)));
      }
      return matchesSingleToken(String(value));

    case 'not_equals':
      if (Array.isArray(value)) {
        return !value.some((item) => matchesSingleToken(String(item)));
      }
      return !matchesSingleToken(String(value));

    case 'contains': {
      if (!targetLower) return false;
      if (Array.isArray(value)) {
        return value.some((item) => {
          const itemStr = String(item).trim().toLowerCase();
          if (itemStr.includes(targetLower)) return true;
          const choiceObj = question?.choices?.find(
            (c) =>
              c.id.toLowerCase() === itemStr ||
              c.label.toLowerCase() === itemStr
          );
          return choiceObj
            ? choiceObj.label.toLowerCase().includes(targetLower)
            : false;
        });
      }
      const displayStr = normalizeAnswerString(value, question).toLowerCase();
      return (
        String(value).trim().toLowerCase().includes(targetLower) ||
        displayStr.includes(targetLower)
      );
    }

    case 'greater_than': {
      const numVal = Number(value);
      const numTarget = Number(rule.value);
      if (!Number.isFinite(numVal) || !Number.isFinite(numTarget)) return false;
      return numVal > numTarget;
    }

    case 'less_than': {
      const numVal = Number(value);
      const numTarget = Number(rule.value);
      if (!Number.isFinite(numVal) || !Number.isFinite(numTarget)) return false;
      return numVal < numTarget;
    }

    default:
      return false;
  }
}

/**
 * Given the form, the current question ID, and current answers map,
 * determines the next destination: either another valid question ID or 'completion'.
 */
export function resolveNextNodeId(
  form: FormSchema,
  currentQuestionId: string,
  answers: Record<string, AnswerValue>
): string {
  const questionIndex = form.questions.findIndex(
    (q) => q.id === currentQuestionId
  );
  if (questionIndex === -1) return 'completion';

  const question = form.questions[questionIndex];
  const answer = answers[currentQuestionId];
  const validQuestionIds = new Set(form.questions.map((q) => q.id));

  // 1. Check branching logic rules in deterministic order
  for (const rule of question.logicRules || []) {
    if (evaluateRuleCondition(rule, answer, question)) {
      if (rule.targetId === 'completion') {
        return 'completion';
      }
      if (
        validQuestionIds.has(rule.targetId) &&
        rule.targetId !== currentQuestionId
      ) {
        return rule.targetId;
      }
    }
  }

  // 2. Check custom defaultNextId
  if (question.defaultNextId && question.defaultNextId !== 'next') {
    if (question.defaultNextId === 'completion') {
      return 'completion';
    }
    if (
      validQuestionIds.has(question.defaultNextId) &&
      question.defaultNextId !== currentQuestionId
    ) {
      return question.defaultNextId;
    }
  }

  // 3. Fallback to next question in array order, or 'completion'
  const nextQuestion = form.questions[questionIndex + 1];
  return nextQuestion ? nextQuestion.id : 'completion';
}

/**
 * Computes the expected path of question IDs through the form given the current answers,
 * protecting against accidental infinite loops (cycles).
 */
export function computeActiveQuestionSequence(
  form: FormSchema,
  answers: Record<string, AnswerValue>
): string[] {
  if (form.questions.length === 0) return [];
  const sequence: string[] = [];
  const visited = new Set<string>();
  let currentId: string = form.questions[0].id;

  while (currentId && currentId !== 'completion' && !visited.has(currentId)) {
    visited.add(currentId);
    sequence.push(currentId);
    currentId = resolveNextNodeId(form, currentId, answers);
  }

  return sequence;
}

/**
 * Pure helper that removes a question from a form and cleans up any logicRules
 * or defaultNextId references across remaining questions that pointed to the deleted question.
 */
export function removeQuestionAndCleanReferences(
  form: FormSchema,
  deletedQuestionId: string
): FormSchema {
  const remainingQuestions = form.questions
    .filter((q) => q.id !== deletedQuestionId)
    .map((q) => ({
      ...q,
      logicRules: (q.logicRules || []).filter(
        (rule) => rule.targetId !== deletedQuestionId
      ),
      defaultNextId:
        q.defaultNextId === deletedQuestionId ? 'next' : q.defaultNextId,
    }));

  return {
    ...form,
    updatedAt: new Date().toISOString(),
    questionOrder: remainingQuestions.map((q) => q.id),
    questions: remainingQuestions,
  };
}

/**
 * Pure helper that updates a question's choices and keeps any logicRules on that
 * question synchronized if a choice's label was renamed or a choice was removed.
 */
export function updateQuestionChoicesAndSyncRules(
  question: FormQuestion,
  nextChoices: ChoiceOption[]
): FormQuestion {
  const prevChoices = question.choices || [];
  const nextById = new Map(nextChoices.map((c) => [c.id, c]));

  const updatedRules: LogicRule[] = [];
  for (const rule of question.logicRules || []) {
    if (rule.operator !== 'equals' && rule.operator !== 'not_equals') {
      updatedRules.push(rule);
      continue;
    }

    // Check if rule.value matched one of the previous choices by ID or label
    const prevMatch = prevChoices.find(
      (c) =>
        c.id.toLowerCase() === rule.value.trim().toLowerCase() ||
        c.label.toLowerCase() === rule.value.trim().toLowerCase()
    );

    if (prevMatch) {
      const stillExists = nextById.get(prevMatch.id);
      if (!stillExists) {
        // The choice referenced by this rule was deleted; remove the orphaned rule
        continue;
      }
      // Keep rule.value synchronized with the updated label if it was storing the label
      const wasUsingId =
        prevMatch.id.toLowerCase() === rule.value.trim().toLowerCase() &&
        prevMatch.label.toLowerCase() !== rule.value.trim().toLowerCase();
      updatedRules.push({
        ...rule,
        value: wasUsingId ? stillExists.id : stillExists.label,
      });
    } else {
      updatedRules.push(rule);
    }
  }

  return {
    ...question,
    choices: nextChoices,
    logicRules: updatedRules,
  };
}

/**
 * Pure helper that reorders questions in a form from `fromIndex` to `toIndex`,
 * updating canonical `questions` and `questionOrder` while preserving all question IDs,
 * choice IDs, and branching logic rules intact.
 */
export function reorderQuestions(
  form: FormSchema,
  fromIndex: number,
  toIndex: number
): FormSchema {
  const count = form.questions.length;
  if (
    count <= 1 ||
    fromIndex === toIndex ||
    fromIndex < 0 ||
    fromIndex >= count ||
    toIndex < 0 ||
    toIndex >= count
  ) {
    return form;
  }

  const nextQuestions = [...form.questions];
  const [moved] = nextQuestions.splice(fromIndex, 1);
  nextQuestions.splice(toIndex, 0, moved);

  return {
    ...form,
    updatedAt: new Date().toISOString(),
    questionOrder: nextQuestions.map((q) => q.id),
    questions: nextQuestions,
  };
}

/**
 * Pure helper that reorders choices within a choice-based question while preserving
 * stable choice IDs and existing branching rules.
 */
export function reorderQuestionChoices(
  question: FormQuestion,
  fromIndex: number,
  toIndex: number
): FormQuestion {
  const choices = question.choices || [];
  const count = choices.length;
  if (
    count <= 1 ||
    fromIndex === toIndex ||
    fromIndex < 0 ||
    fromIndex >= count ||
    toIndex < 0 ||
    toIndex >= count
  ) {
    return question;
  }

  const nextChoices = [...choices];
  const [moved] = nextChoices.splice(fromIndex, 1);
  nextChoices.splice(toIndex, 0, moved);

  return updateQuestionChoicesAndSyncRules(question, nextChoices);
}

/**
 * Pure helper that reorders forms in the workspace library list.
 */
export function reorderFormsList(
  forms: FormSchema[],
  fromIndex: number,
  toIndex: number
): FormSchema[] {
  const count = forms.length;
  if (
    count <= 1 ||
    fromIndex === toIndex ||
    fromIndex < 0 ||
    fromIndex >= count ||
    toIndex < 0 ||
    toIndex >= count
  ) {
    return forms;
  }

  const nextForms = [...forms];
  const [moved] = nextForms.splice(fromIndex, 1);
  nextForms.splice(toIndex, 0, moved);
  return nextForms;
}

export interface WorkflowDiagnostics {
  unreachableQuestionIds: string[];
  invalidRuleIds: { questionId: string; ruleId: string; targetId: string }[];
  circularPathsDetected: boolean;
}

/**
 * Static graph analyzer for a form's branching rules:
 * - Detects questions that can never be reached from Q1 under any branch or default path.
 * - Detects rules pointing to nonexistent target question IDs.
 * - Detects potential cycles (backward jumps).
 */
export function inspectFormWorkflow(form: FormSchema): WorkflowDiagnostics {
  if (form.questions.length === 0) {
    return {
      unreachableQuestionIds: [],
      invalidRuleIds: [],
      circularPathsDetected: false,
    };
  }

  const validIds = new Set(form.questions.map((q) => q.id));
  const indexMap = new Map(form.questions.map((q, idx) => [q.id, idx]));
  const invalidRuleIds: {
    questionId: string;
    ruleId: string;
    targetId: string;
  }[] = [];
  let circularPathsDetected = false;

  const adjacency = new Map<string, Set<string>>();
  form.questions.forEach((q, idx) => {
    const targets = new Set<string>();
    for (const rule of q.logicRules || []) {
      if (rule.targetId !== 'completion' && !validIds.has(rule.targetId)) {
        invalidRuleIds.push({
          questionId: q.id,
          ruleId: rule.id,
          targetId: rule.targetId,
        });
      } else if (rule.targetId !== 'completion') {
        targets.add(rule.targetId);
        const targetIdx = indexMap.get(rule.targetId) ?? idx;
        if (targetIdx <= idx) {
          circularPathsDetected = true;
        }
      }
    }

    if (q.defaultNextId && q.defaultNextId !== 'next') {
      if (q.defaultNextId !== 'completion' && validIds.has(q.defaultNextId)) {
        targets.add(q.defaultNextId);
        const targetIdx = indexMap.get(q.defaultNextId) ?? idx;
        if (targetIdx <= idx) {
          circularPathsDetected = true;
        }
      }
    } else {
      const nextSequential = form.questions[idx + 1];
      if (nextSequential) {
        targets.add(nextSequential.id);
      }
    }
    adjacency.set(q.id, targets);
  });

  // BFS from Question 0 to find all reachable questions
  const reachable = new Set<string>();
  const queue: string[] = [form.questions[0].id];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (reachable.has(curr)) continue;
    reachable.add(curr);
    const neighbors = adjacency.get(curr);
    if (neighbors) {
      for (const n of neighbors) {
        if (!reachable.has(n)) queue.push(n);
      }
    }
  }

  const unreachableQuestionIds = form.questions
    .filter((q) => !reachable.has(q.id))
    .map((q) => q.id);

  return {
    unreachableQuestionIds,
    invalidRuleIds,
    circularPathsDetected,
  };
}
