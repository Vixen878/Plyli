import {
  FormSchema,
  FormQuestion,
  LogicRule,
  LogicOperator,
  QuestionType,
  AnswerValue,
  FlowNodePosition,
  generateId,
  createDefaultQuestion,
} from './types';
import {
  computeActiveQuestionSequence,
  inspectFormWorkflow,
  WorkflowDiagnostics,
} from './branching';

export interface FlowOutputHandle {
  id: string; // 'welcome-out' | 'default' | 'rule:<ruleId>' | 'new-rule'
  kind: 'welcome' | 'default' | 'rule' | 'new-rule';
  label: string;
  ruleId?: string;
  targetId?: string;
}

export interface FlowGraphNode {
  id: string; // 'welcome' | question.id | 'completion'
  kind: 'welcome' | 'question' | 'completion';
  questionIndex?: number;
  questionType?: QuestionType;
  title: string;
  subtitle: string;
  branchRuleCount: number;
  isUnreachable: boolean;
  isOnActiveSimulatedPath: boolean;
  position: FlowNodePosition;
  outputHandles: FlowOutputHandle[];
}

export interface FlowGraphEdge {
  id: string;
  sourceNodeId: string;
  sourceHandleId: string;
  targetNodeId: string;
  kind: 'welcome' | 'rule' | 'default';
  ruleId?: string;
  conditionLabel: string;
  isCustomDefault?: boolean;
  isBackwardJump: boolean;
  isOnActiveSimulatedPath: boolean;
}

export interface DerivedFlowGraph {
  nodes: FlowGraphNode[];
  edges: FlowGraphEdge[];
  diagnostics: WorkflowDiagnostics;
  activePathQuestionIds: string[];
}

const OPERATOR_SHORT_SYMBOL: Record<LogicOperator, string> = {
  equals: '=',
  not_equals: '≠',
  contains: 'contains',
  greater_than: '>',
  less_than: '<',
  is_answered: 'is answered',
};

/**
 * Formats a concise, human-readable label for a conditional rule edge on the visual canvas.
 */
export function formatRuleConditionShort(
  question: FormQuestion,
  rule: LogicRule
): string {
  if (rule.operator === 'is_answered') {
    return 'If answered';
  }
  const rawVal = (rule.value || '').trim();
  if (!rawVal) {
    return `If ${OPERATOR_SHORT_SYMBOL[rule.operator]} ?`;
  }

  // Resolve choice label if rule.value references a choice ID
  const matchedChoice = question.choices?.find(
    (c) =>
      c.id.toLowerCase() === rawVal.toLowerCase() ||
      c.label.toLowerCase() === rawVal.toLowerCase()
  );
  const displayVal = matchedChoice ? matchedChoice.label : rawVal;
  const truncated =
    displayVal.length > 22 ? `${displayVal.slice(0, 20)}…` : displayVal;

  if (rule.operator === 'equals') {
    return `If = "${truncated}"`;
  }
  if (rule.operator === 'not_equals') {
    return `If ≠ "${truncated}"`;
  }
  if (rule.operator === 'contains') {
    return `Contains "${truncated}"`;
  }
  return `If ${OPERATOR_SHORT_SYMBOL[rule.operator]} ${truncated}`;
}

/**
 * Computes a clean, readable 2D node layout for any form.
 * Arranges nodes in a structured left-to-right flow with vertical staggering for branches
 * so edges and labels remain legible without manual tweaking.
 */
export function computeAutoLayoutPositions(
  form: FormSchema
): Record<string, FlowNodePosition> {
  const positions: Record<string, FlowNodePosition> = {};
  const COL_WIDTH = 330;
  const ROW_HEIGHT = 215;
  const START_X = 36;
  const TOP_Y = 36;

  const qCount = form.questions.length;
  if (qCount === 0) {
    positions['welcome'] = { x: START_X, y: TOP_Y + 120 };
    positions['completion'] = { x: START_X + COL_WIDTH, y: TOP_Y + 120 };
    return positions;
  }

  // Assign each question a logical depth column based on DAG path from Q0
  const indexById = new Map(form.questions.map((q, idx) => [q.id, idx]));
  const depthByIndex = new Array<number>(qCount).fill(0);

  for (let i = 0; i < qCount; i++) {
    const q = form.questions[i];
    const currentDepth = Math.max(depthByIndex[i], i === 0 ? 0 : 1);
    depthByIndex[i] = currentDepth;

    const outgoingTargets = new Set<string>();
    for (const r of q.logicRules || []) {
      if (r.targetId && r.targetId !== 'completion') {
        outgoingTargets.add(r.targetId);
      }
    }
    if (q.defaultNextId && q.defaultNextId !== 'next') {
      if (q.defaultNextId !== 'completion') {
        outgoingTargets.add(q.defaultNextId);
      }
    } else if (form.questions[i + 1]) {
      outgoingTargets.add(form.questions[i + 1].id);
    }

    for (const targetId of outgoingTargets) {
      const targetIdx = indexById.get(targetId);
      if (targetIdx !== undefined && targetIdx > i) {
        depthByIndex[targetIdx] = Math.max(
          depthByIndex[targetIdx],
          currentDepth + 1
        );
      }
    }
  }

  // Ensure any unvisited/unreachable question still gets a sensible column
  for (let i = 1; i < qCount; i++) {
    if (depthByIndex[i] === 0) {
      depthByIndex[i] = depthByIndex[i - 1] + 1;
    }
  }

  // Group all nodes (welcome, questions, completion) into logical sequence columns
  const columns = new Map<number, string[]>();
  columns.set(0, ['welcome']);
  let maxCol = 0;

  form.questions.forEach((q, idx) => {
    const col = depthByIndex[idx] + 1; // col 0 is welcome
    if (col > maxCol) maxCol = col;
    const list = columns.get(col) || [];
    list.push(q.id);
    columns.set(col, list);
  });

  const endCol = maxCol + 1;
  columns.set(endCol, ['completion']);

  // Wrap into rows of 3 columns so 5-8 question forms stay compact and readable at a glance
  const COLS_PER_ROW = 3;
  const sortedCols = Array.from(columns.keys()).sort((a, b) => a - b);

  sortedCols.forEach((logicalCol, colOrderIdx) => {
    const qIds = columns.get(logicalCol) || [];
    const bandRow = Math.floor(colOrderIdx / COLS_PER_ROW);
    const colInBand = colOrderIdx % COLS_PER_ROW;
    const baseBandY = TOP_Y + bandRow * (ROW_HEIGHT * 1.15);

    qIds.forEach((nodeId, stackIdx) => {
      const staggerY = stackIdx * (ROW_HEIGHT * 0.85) + (colInBand % 2 === 1 && qIds.length === 1 ? 18 : 0);
      positions[nodeId] = {
        x: Math.round(START_X + colInBand * COL_WIDTH),
        y: Math.round(baseBandY + staggerY),
      };
    });
  });

  return positions;
}

/**
 * Derives the complete node-and-edge graph representation from a FormSchema.
 * Both the Visual Canvas and the Rule Editor operate on this exact same FormSchema logic.
 */
export function deriveFlowGraph(
  form: FormSchema,
  simulatedAnswers: Record<string, AnswerValue> = {}
): DerivedFlowGraph {
  const diagnostics = inspectFormWorkflow(form);
  const unreachableSet = new Set(diagnostics.unreachableQuestionIds);
  const activePathQuestionIds = computeActiveQuestionSequence(
    form,
    simulatedAnswers
  );
  const activePathSet = new Set(activePathQuestionIds);

  const autoPositions = computeAutoLayoutPositions(form);
  const savedPositions = form.flowCanvasLayout?.positions || {};

  const resolvePos = (nodeId: string): FlowNodePosition => {
    const saved = savedPositions[nodeId];
    if (
      saved &&
      typeof saved.x === 'number' &&
      Number.isFinite(saved.x) &&
      typeof saved.y === 'number' &&
      Number.isFinite(saved.y)
    ) {
      return { x: saved.x, y: saved.y };
    }
    return autoPositions[nodeId] || { x: 80, y: 220 };
  };

  const nodes: FlowGraphNode[] = [];
  const edges: FlowGraphEdge[] = [];
  const validQuestionIds = new Set(form.questions.map((q) => q.id));
  const questionIndexMap = new Map(
    form.questions.map((q, idx) => [q.id, idx])
  );

  const firstQuestionId =
    form.questions.length > 0 ? form.questions[0].id : 'completion';

  // 1. Welcome / Start node
  nodes.push({
    id: 'welcome',
    kind: 'welcome',
    title: form.welcomeScreen.enabled
      ? form.welcomeScreen.title || 'Welcome Screen'
      : 'Form Start',
    subtitle: form.welcomeScreen.enabled
      ? `Welcome Screen · "${form.welcomeScreen.buttonText || 'Start'}"`
      : 'Welcome screen hidden · Starts at Q1',
    branchRuleCount: 0,
    isUnreachable: false,
    isOnActiveSimulatedPath: true,
    position: resolvePos('welcome'),
    outputHandles: [
      {
        id: 'welcome-out',
        kind: 'welcome',
        label: 'Start → Q1',
        targetId: firstQuestionId,
      },
    ],
  });

  edges.push({
    id: 'edge_welcome_start',
    sourceNodeId: 'welcome',
    sourceHandleId: 'welcome-out',
    targetNodeId: firstQuestionId,
    kind: 'welcome',
    conditionLabel: 'Start',
    isBackwardJump: false,
    isOnActiveSimulatedPath: true,
  });

  // 2. Question nodes and their outgoing edges
  form.questions.forEach((q, idx) => {
    const sequentialNextId = form.questions[idx + 1]
      ? form.questions[idx + 1].id
      : 'completion';

    const resolvedDefaultTargetId =
      q.defaultNextId &&
      q.defaultNextId !== 'next' &&
      (q.defaultNextId === 'completion' || validQuestionIds.has(q.defaultNextId))
        ? q.defaultNextId
        : sequentialNextId;

    const isCustomDefault = Boolean(
      q.defaultNextId && q.defaultNextId !== 'next'
    );

    const outputHandles: FlowOutputHandle[] = [];

    // Rule handles
    for (const rule of q.logicRules || []) {
      const condLabel = formatRuleConditionShort(q, rule);
      const handleId = `rule:${rule.id}`;
      const targetId =
        rule.targetId === 'completion' || validQuestionIds.has(rule.targetId)
          ? rule.targetId
          : 'completion';

      outputHandles.push({
        id: handleId,
        kind: 'rule',
        label: condLabel,
        ruleId: rule.id,
        targetId,
      });

      const targetIdx = questionIndexMap.get(targetId);
      const isBackwardJump = targetIdx !== undefined && targetIdx <= idx;

      // Check if this specific edge is traversed on the active simulated path
      const activeIdx = activePathQuestionIds.indexOf(q.id);
      const nextActiveId =
        activeIdx !== -1
          ? activePathQuestionIds[activeIdx + 1] || 'completion'
          : null;

      // Determine if this rule is the one that fired on the simulated path
      edges.push({
        id: `edge_rule_${q.id}_${rule.id}`,
        sourceNodeId: q.id,
        sourceHandleId: handleId,
        targetNodeId: targetId,
        kind: 'rule',
        ruleId: rule.id,
        conditionLabel: condLabel,
        isBackwardJump,
        isOnActiveSimulatedPath:
          activeIdx !== -1 && nextActiveId === targetId,
      });
    }

    // Default / Otherwise handle
    const defaultLabel =
      (q.logicRules?.length || 0) > 0
        ? 'Otherwise'
        : isCustomDefault
          ? 'Default jump'
          : 'Next';

    outputHandles.push({
      id: 'default',
      kind: 'default',
      label: defaultLabel,
      targetId: resolvedDefaultTargetId,
    });

    // "+ Add branch" handle for dragging a brand-new conditional rule
    outputHandles.push({
      id: 'new-rule',
      kind: 'new-rule',
      label: '+ Add branch',
    });

    const defaultTargetIdx = questionIndexMap.get(resolvedDefaultTargetId);
    const defaultBackward =
      defaultTargetIdx !== undefined && defaultTargetIdx <= idx;

    const activeIdx = activePathQuestionIds.indexOf(q.id);
    const nextActiveId =
      activeIdx !== -1
        ? activePathQuestionIds[activeIdx + 1] || 'completion'
        : null;
    const anyRuleMatchedActiveTarget = edges.some(
      (e) =>
        e.sourceNodeId === q.id &&
        e.kind === 'rule' &&
        e.targetNodeId === nextActiveId &&
        e.isOnActiveSimulatedPath
    );

    edges.push({
      id: `edge_default_${q.id}`,
      sourceNodeId: q.id,
      sourceHandleId: 'default',
      targetNodeId: resolvedDefaultTargetId,
      kind: 'default',
      conditionLabel: defaultLabel,
      isCustomDefault,
      isBackwardJump: defaultBackward,
      isOnActiveSimulatedPath:
        activeIdx !== -1 &&
        nextActiveId === resolvedDefaultTargetId &&
        !anyRuleMatchedActiveTarget,
    });

    nodes.push({
      id: q.id,
      kind: 'question',
      questionIndex: idx,
      questionType: q.type,
      title: q.title || `Untitled Question ${idx + 1}`,
      subtitle: `Q${idx + 1} · ${q.type.replace('_', ' ')}`,
      branchRuleCount: q.logicRules?.length || 0,
      isUnreachable: unreachableSet.has(q.id),
      isOnActiveSimulatedPath: activePathSet.has(q.id),
      position: resolvePos(q.id),
      outputHandles,
    });
  });

  // 3. Completion / End node
  nodes.push({
    id: 'completion',
    kind: 'completion',
    title: form.completionScreen.title || 'Completion Screen',
    subtitle: `End · "${form.completionScreen.buttonText || 'Done'}"`,
    branchRuleCount: 0,
    isUnreachable: false,
    isOnActiveSimulatedPath: true,
    position: resolvePos('completion'),
    outputHandles: [],
  });

  return {
    nodes,
    edges,
    diagnostics,
    activePathQuestionIds,
  };
}

/**
 * Validates whether a proposed connection between a source node/handle and a target node is allowed.
 */
export function validateFlowConnection(
  form: FormSchema,
  sourceNodeId: string,
  sourceHandleId: string,
  targetNodeId: string
): { valid: boolean; reason?: string } {
  if (!sourceNodeId || !targetNodeId) {
    return { valid: false, reason: 'Select both a source and destination node.' };
  }
  if (targetNodeId === 'welcome') {
    return {
      valid: false,
      reason: 'Cannot route a question back into the Welcome screen.',
    };
  }
  if (sourceNodeId === 'completion') {
    return {
      valid: false,
      reason: 'The Completion screen is a final destination and cannot branch outward.',
    };
  }
  if (sourceNodeId === 'welcome') {
    return {
      valid: false,
      reason:
        'The Welcome screen always starts at Question 1. Reorder questions in Build to change Q1.',
    };
  }
  if (sourceNodeId === targetNodeId) {
    return {
      valid: false,
      reason: 'A question cannot branch directly to itself (self-loop).',
    };
  }

  const sourceQuestion = form.questions.find((q) => q.id === sourceNodeId);
  if (!sourceQuestion) {
    return { valid: false, reason: 'Source question does not exist.' };
  }

  const validTarget =
    targetNodeId === 'completion' ||
    form.questions.some((q) => q.id === targetNodeId);
  if (!validTarget) {
    return { valid: false, reason: 'Destination node does not exist.' };
  }

  if (
    sourceHandleId !== 'default' &&
    sourceHandleId !== 'new-rule' &&
    !sourceHandleId.startsWith('rule:')
  ) {
    return { valid: false, reason: 'Unsupported source connection handle.' };
  }

  return { valid: true };
}

/**
 * Creates a sensible default operator and value when a user drags a new branch connector
 * from a question node on the visual canvas.
 */
export function createDefaultRuleForTarget(
  question: FormQuestion,
  targetNodeId: string
): LogicRule {
  let defaultVal = '';
  let operator: LogicOperator = 'equals';

  if (question.choices && question.choices.length > 0) {
    // Pick the first choice that doesn't already have an equals rule if possible
    const usedValues = new Set(
      (question.logicRules || []).map((r) => r.value.trim().toLowerCase())
    );
    const unusedChoice = question.choices.find(
      (c) =>
        !usedValues.has(c.label.trim().toLowerCase()) &&
        !usedValues.has(c.id.trim().toLowerCase())
    );
    defaultVal = (unusedChoice || question.choices[0]).label;
  } else if (question.type === 'rating') {
    operator = 'less_than';
    defaultVal = '4';
  } else if (question.type === 'number') {
    operator = 'greater_than';
    defaultVal = '1';
  } else {
    operator = 'is_answered';
    defaultVal = '';
  }

  return {
    id: generateId('rule'),
    operator,
    value: defaultVal,
    targetId: targetNodeId,
  };
}

/**
 * Pure function that applies a visual canvas connection to the underlying FormSchema.
 * Supports:
 * - Connecting `default` handle -> updates `question.defaultNextId`
 * - Connecting `rule:<ruleId>` handle -> updates that rule's `targetId`
 * - Connecting `new-rule` handle -> creates a new `LogicRule` targeting `targetNodeId`
 */
export function applyFlowConnection(
  form: FormSchema,
  params: {
    sourceQuestionId: string;
    sourceHandleId: string;
    targetNodeId: string;
    operator?: LogicOperator;
    value?: string;
  }
): {
  valid: boolean;
  form: FormSchema;
  createdRuleId?: string;
  updatedRuleId?: string;
  reason?: string;
} {
  const validation = validateFlowConnection(
    form,
    params.sourceQuestionId,
    params.sourceHandleId,
    params.targetNodeId
  );
  if (!validation.valid) {
    return { valid: false, form, reason: validation.reason };
  }

  const qIdx = form.questions.findIndex(
    (q) => q.id === params.sourceQuestionId
  );
  if (qIdx === -1) {
    return { valid: false, form, reason: 'Source question not found.' };
  }

  const question = form.questions[qIdx];
  const sequentialNextId = form.questions[qIdx + 1]
    ? form.questions[qIdx + 1].id
    : 'completion';

  if (params.sourceHandleId === 'default') {
    const nextDefaultId =
      params.targetNodeId === sequentialNextId ? 'next' : params.targetNodeId;
    const updatedQuestion: FormQuestion = {
      ...question,
      defaultNextId: nextDefaultId,
    };
    const nextQuestions = [...form.questions];
    nextQuestions[qIdx] = updatedQuestion;
    return {
      valid: true,
      form: {
        ...form,
        updatedAt: new Date().toISOString(),
        questions: nextQuestions,
      },
    };
  }

  if (params.sourceHandleId.startsWith('rule:')) {
    const ruleId = params.sourceHandleId.slice('rule:'.length);
    const ruleExists = (question.logicRules || []).some((r) => r.id === ruleId);
    if (!ruleExists) {
      return { valid: false, form, reason: 'Branch rule not found.' };
    }
    const updatedQuestion: FormQuestion = {
      ...question,
      logicRules: (question.logicRules || []).map((r) =>
        r.id === ruleId ? { ...r, targetId: params.targetNodeId } : r
      ),
    };
    const nextQuestions = [...form.questions];
    nextQuestions[qIdx] = updatedQuestion;
    return {
      valid: true,
      updatedRuleId: ruleId,
      form: {
        ...form,
        updatedAt: new Date().toISOString(),
        questions: nextQuestions,
      },
    };
  }

  // Otherwise `new-rule`: create a new conditional rule
  const baseRule = createDefaultRuleForTarget(question, params.targetNodeId);
  const newRule: LogicRule = {
    ...baseRule,
    ...(params.operator ? { operator: params.operator } : {}),
    ...(params.value !== undefined ? { value: params.value } : {}),
    targetId: params.targetNodeId,
  };

  // Prevent exact duplicate rule (same operator, value, and targetId)
  const isDuplicate = (question.logicRules || []).some(
    (r) =>
      r.operator === newRule.operator &&
      r.value.trim().toLowerCase() === newRule.value.trim().toLowerCase() &&
      r.targetId === newRule.targetId
  );
  if (isDuplicate) {
    return {
      valid: false,
      form,
      reason: 'An identical branch rule to this destination already exists.',
    };
  }

  const updatedQuestion: FormQuestion = {
    ...question,
    logicRules: [...(question.logicRules || []), newRule],
  };
  const nextQuestions = [...form.questions];
  nextQuestions[qIdx] = updatedQuestion;

  return {
    valid: true,
    createdRuleId: newRule.id,
    form: {
      ...form,
      updatedAt: new Date().toISOString(),
      questions: nextQuestions,
    },
  };
}

/**
 * Pure function that disconnects/deletes a branch edge from the graph:
 * - If it is a `rule` edge, removes that `LogicRule` from its source question.
 * - If it is a `default` edge, resets `defaultNextId` to `'next'`.
 */
export function disconnectFlowEdge(form: FormSchema, edgeId: string): FormSchema {
  if (edgeId.startsWith('edge_rule_')) {
    for (let i = 0; i < form.questions.length; i++) {
      const q = form.questions[i];
      const prefix = `edge_rule_${q.id}_`;
      if (edgeId.startsWith(prefix)) {
        const ruleId = edgeId.slice(prefix.length);
        const nextRules = (q.logicRules || []).filter((r) => r.id !== ruleId);
        if (nextRules.length === (q.logicRules || []).length) return form;
        const nextQuestions = [...form.questions];
        nextQuestions[i] = { ...q, logicRules: nextRules };
        return {
          ...form,
          updatedAt: new Date().toISOString(),
          questions: nextQuestions,
        };
      }
    }
  }

  if (edgeId.startsWith('edge_default_')) {
    const qId = edgeId.slice('edge_default_'.length);
    const idx = form.questions.findIndex((q) => q.id === qId);
    if (idx !== -1 && form.questions[idx].defaultNextId !== 'next') {
      const nextQuestions = [...form.questions];
      nextQuestions[idx] = { ...form.questions[idx], defaultNextId: 'next' };
      return {
        ...form,
        updatedAt: new Date().toISOString(),
        questions: nextQuestions,
      };
    }
  }

  return form;
}

/**
 * Updates the saved 2D position of a single node on the visual canvas without altering
 * question sequence, logic rules, or respondent revision numbers.
 */
export function updateFlowNodePosition(
  form: FormSchema,
  nodeId: string,
  position: FlowNodePosition
): FormSchema {
  const basePositions =
    form.flowCanvasLayout?.positions || computeAutoLayoutPositions(form);

  return {
    ...form,
    updatedAt: new Date().toISOString(),
    flowCanvasLayout: {
      ...(form.flowCanvasLayout || {}),
      positions: {
        ...basePositions,
        [nodeId]: {
          x: Math.round(position.x),
          y: Math.round(position.y),
        },
      },
    },
  };
}

/**
 * Resets all visual canvas node coordinates to a fresh auto-arranged DAG layout.
 */
export function applyAutoLayoutToForm(form: FormSchema): FormSchema {
  const autoPositions = computeAutoLayoutPositions(form);
  return {
    ...form,
    updatedAt: new Date().toISOString(),
    flowCanvasLayout: {
      ...(form.flowCanvasLayout || {}),
      positions: autoPositions,
    },
  };
}

/**
 * Pure function that creates a new question on the visual canvas at a specified (or auto-computed)
 * 2D position and optionally connects a source node handle ('new-rule', 'default', or 'rule:<id>')
 * directly to the newly created question.
 */
export function createAndConnectQuestionOnCanvas(
  form: FormSchema,
  params: {
    questionType: QuestionType;
    position?: FlowNodePosition;
    sourceQuestionId?: string;
    sourceHandleId?: string;
    operator?: LogicOperator;
    value?: string;
  }
): {
  valid: boolean;
  form: FormSchema;
  createdQuestion: FormQuestion;
  createdRuleId?: string;
  updatedRuleId?: string;
  reason?: string;
} {
  const newQuestion = createDefaultQuestion(
    params.questionType,
    form.questions.length + 1
  );

  // Preserve existing node positions so existing cards don't jump when a new node is added
  const currentPositions: Record<string, FlowNodePosition> = {
    ...computeAutoLayoutPositions(form),
    ...(form.flowCanvasLayout?.positions || {}),
  };

  let targetPos: FlowNodePosition;
  if (
    params.position &&
    Number.isFinite(params.position.x) &&
    Number.isFinite(params.position.y)
  ) {
    targetPos = {
      x: Math.round(params.position.x),
      y: Math.round(params.position.y),
    };
  } else if (params.sourceQuestionId && currentPositions[params.sourceQuestionId]) {
    const srcPos = currentPositions[params.sourceQuestionId];
    targetPos = {
      x: Math.round(srcPos.x + 340),
      y: Math.round(srcPos.y + 40),
    };
  } else {
    // Place to the right/below the last question node
    const lastQ = form.questions[form.questions.length - 1];
    const refPos =
      (lastQ && currentPositions[lastQ.id]) ||
      currentPositions['welcome'] || { x: 40, y: 60 };
    targetPos = {
      x: Math.round(refPos.x + 330),
      y: Math.round(refPos.y),
    };
  }

  const nextQuestions = [...form.questions, newQuestion];
  const nextPositions: Record<string, FlowNodePosition> = {
    ...currentPositions,
    [newQuestion.id]: targetPos,
  };

  // If the completion node would overlap the newly placed node, nudge completion to the right
  const compPos = nextPositions['completion'];
  if (
    compPos &&
    Math.abs(compPos.x - targetPos.x) < 260 &&
    Math.abs(compPos.y - targetPos.y) < 160
  ) {
    nextPositions['completion'] = {
      x: Math.round(Math.max(compPos.x, targetPos.x) + 340),
      y: compPos.y,
    };
  }

  const formWithQuestion: FormSchema = {
    ...form,
    updatedAt: new Date().toISOString(),
    questionOrder: nextQuestions.map((q) => q.id),
    questions: nextQuestions,
    flowCanvasLayout: {
      ...(form.flowCanvasLayout || {}),
      positions: nextPositions,
    },
  };

  // If triggered from a source question handle (e.g. spaghetti drop or clicking "+ Add branch"), wire it immediately
  if (
    params.sourceQuestionId &&
    params.sourceQuestionId !== 'welcome' &&
    params.sourceQuestionId !== 'completion' &&
    params.sourceHandleId
  ) {
    const connResult = applyFlowConnection(formWithQuestion, {
      sourceQuestionId: params.sourceQuestionId,
      sourceHandleId: params.sourceHandleId,
      targetNodeId: newQuestion.id,
      operator: params.operator,
      value: params.value,
    });
    if (!connResult.valid) {
      return {
        valid: false,
        form,
        createdQuestion: newQuestion,
        reason: connResult.reason,
      };
    }
    return {
      valid: true,
      form: connResult.form,
      createdQuestion: newQuestion,
      createdRuleId: connResult.createdRuleId,
      updatedRuleId: connResult.updatedRuleId,
    };
  }

  return {
    valid: true,
    form: formWithQuestion,
    createdQuestion: newQuestion,
  };
}

