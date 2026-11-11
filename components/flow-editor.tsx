'use client';

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import {
  FormSchema,
  FormQuestion,
  QuestionType,
  LogicRule,
  LogicOperator,
  AnswerValue,
  FlowNodePosition,
  FlowGraphNode,
  RecordChangeOptions,
  QUESTION_TYPE_META,
  computeActiveQuestionSequence,
  deriveFlowGraph,
  applyFlowConnection,
  disconnectFlowEdge,
  updateFlowNodePosition,
  applyAutoLayoutToForm,
  validateFlowConnection,
  createAndConnectQuestionOnCanvas,
  removeQuestionAndCleanReferences,
  updateQuestionChoicesAndSyncRules,
  reorderQuestions,
  reorderQuestionChoices,
  generateId,
  FlowOverlayAnalytics,
} from '@/lib/form-engine';
import { PaperButton } from './paper-primitives';
import {
  GitBranch,
  Plus,
  Trash2,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Copy,
  Sparkles,
  CheckCircle2,
  Play,
  CornerDownRight,
  Compass,
  ZoomIn,
  ZoomOut,
  Maximize2,
  LayoutGrid,
  Workflow,
  ListFilter,
  AlertTriangle,
  X,
  GripHorizontal,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  BarChart3,
} from 'lucide-react';

export type FlowEditorMode = 'visual' | 'rules';

// Persisted preference key; changing it would discard existing selections.
const FLOW_MODE_STORAGE_KEY = 'fieldnote_flow_editor_mode_v1';

const ALL_QUESTION_TYPES: QuestionType[] = [
  'short_text',
  'long_text',
  'email',
  'single_choice',
  'multiple_choice',
  'dropdown',
  'yes_no',
  'rating',
  'number',
  'date',
];

interface FlowEditorProps {
  form: FormSchema;
  initialSelectedQuestionId?: string;
  onSelectBuilderNode?: (nodeId: string) => void;
  onOpenBuilder?: () => void;
  onUpdateForm: (
    updater: (prev: FormSchema) => FormSchema,
    options?: RecordChangeOptions
  ) => void;
  onLaunchPreview: () => void;
  flowOverlay?: FlowOverlayAnalytics;
}

const OPERATOR_LABELS: Record<LogicOperator, string> = {
  equals: 'is equal to',
  not_equals: 'is not equal to',
  contains: 'contains',
  greater_than: 'is greater than',
  less_than: 'is less than',
  is_answered: 'is answered (any value)',
};

const NODE_WIDTH = 272;

function getHandleOffsetY(handleIndex: number): number {
  // Header + title takes ~92px; each output handle row is 32px tall
  return 108 + handleIndex * 32;
}

interface PendingDropMenuState {
  sourceNodeId: string;
  sourceHandleId: string;
  sourceLabel: string;
  startX: number;
  startY: number;
  dropX: number;
  dropY: number;
  menuX: number;
  menuY: number;
}

export function FlowEditor({
  form,
  initialSelectedQuestionId,
  onSelectBuilderNode,
  onOpenBuilder,
  onUpdateForm,
  onLaunchPreview,
  flowOverlay,
}: FlowEditorProps) {
  const [showAnalyticsOverlay, setShowAnalyticsOverlay] = useState<boolean>(true);
  const [flowMode, setFlowMode] = useState<FlowEditorMode>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = window.localStorage.getItem(FLOW_MODE_STORAGE_KEY);
        if (saved === 'visual' || saved === 'rules') return saved;
      } catch {
        // Ignore storage read errors
      }
    }
    return 'visual';
  });

  const handleSelectFlowMode = (nextMode: FlowEditorMode) => {
    setFlowMode(nextMode);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(FLOW_MODE_STORAGE_KEY, nextMode);
      } catch {
        // Ignore storage write errors
      }
    }
  };

  // Can be 'welcome', 'completion', or a question ID
  const [selectedNodeId, setSelectedNodeIdState] = useState<string>(() => {
    if (initialSelectedQuestionId) return initialSelectedQuestionId;
    const firstWithRules = form.questions.find(
      (q) => q.logicRules && q.logicRules.length > 0
    );
    return firstWithRules?.id || form.questions[0]?.id || 'welcome';
  });

  const setSelectedNodeId = useCallback(
    (nextId: string) => {
      setSelectedNodeIdState(nextId);
      onSelectBuilderNode?.(nextId);
    },
    [onSelectBuilderNode]
  );

  const [highlightedRuleId, setHighlightedRuleId] = useState<string | null>(
    null
  );
  const [connectionFeedback, setConnectionFeedback] = useState<{
    type: 'error' | 'info';
    message: string;
  } | null>(null);

  const [showToolbarAddMenu, setShowToolbarAddMenu] = useState(false);
  const [isQuestionContentExpanded, setIsQuestionContentExpanded] =
    useState(true);

  // Floating menu opened when a user drags a connection and drops it on empty space,
  // OR when a user clicks "+ Add branch" / an output port directly on a card
  const [pendingDropMenu, setPendingDropMenu] =
    useState<PendingDropMenuState | null>(null);

  // Simulated answers for the Live Path Simulator (shared across Visual Canvas & Rule Editor)
  const [simulatedAnswers, setSimulatedAnswers] = useState<
    Record<string, AnswerValue>
  >(() => {
    const initial: Record<string, AnswerValue> = {};
    form.questions.forEach((q) => {
      if (q.type === 'yes_no') initial[q.id] = 'Yes';
      else if (q.choices && q.choices.length > 0)
        initial[q.id] = q.choices[0].label;
      else if (q.type === 'rating') initial[q.id] = 5;
      else if (q.type === 'number') initial[q.id] = 2;
      else initial[q.id] = 'Sample answer';
    });
    return initial;
  });

  // Visual Canvas viewport state (zoom & pan unified for atomic focal-point updates) + transient drag states
  const [viewport, setViewport] = useState<{
    zoom: number;
    pan: { x: number; y: number };
  }>(() => ({
    zoom: form.flowCanvasLayout?.zoom || 0.78,
    pan: form.flowCanvasLayout?.pan || { x: 20, y: 18 },
  }));
  const zoom = viewport.zoom;
  const pan = viewport.pan;

  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{
    clientX: number;
    clientY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const [draggingNode, setDraggingNode] = useState<{
    nodeId: string;
    startClientX: number;
    startClientY: number;
    originX: number;
    originY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  // Interactive connection state (supports both pointer drag and click-to-open-menu / click-to-connect)
  const [activeConnection, setActiveConnection] = useState<{
    sourceNodeId: string;
    sourceHandleId: string;
    sourceLabel: string;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    startClientX: number;
    startClientY: number;
    isDragging: boolean;
    hoveredTargetId: string | null;
  } | null>(null);

  const canvasViewportRef = useRef<HTMLDivElement | null>(null);
  const lastFittedContextRef = useRef<string | null>(null);

  const derivedGraph = useMemo(
    () => deriveFlowGraph(form, simulatedAnswers),
    [form, simulatedAnswers]
  );
  const activeSequence = useMemo(
    () => computeActiveQuestionSequence(form, simulatedAnswers),
    [form, simulatedAnswers]
  );
  const activeSequenceSet = useMemo(
    () => new Set(activeSequence),
    [activeSequence]
  );

  const selectedQuestion: FormQuestion | undefined =
    selectedNodeId !== 'welcome' && selectedNodeId !== 'completion'
      ? form.questions.find((q) => q.id === selectedNodeId) ||
        form.questions[0]
      : undefined;

  const selectedQuestionIndex = selectedQuestion
    ? form.questions.findIndex((q) => q.id === selectedQuestion.id)
    : -1;

  // Resolve effective node positions (applying live drag offset when a node is actively being dragged)
  const getEffectiveNodePosition = useCallback(
    (nodeId: string, basePos: FlowNodePosition): FlowNodePosition => {
      if (draggingNode && draggingNode.nodeId === nodeId) {
        return {
          x: Math.round(draggingNode.currentX),
          y: Math.round(draggingNode.currentY),
        };
      }
      return basePos;
    },
    [draggingNode]
  );

  // Smoothly zoom around the center of the canvas viewport (or cursor focal point)
  const applyZoomLevel = useCallback(
    (
      resolveNextZoom: (currentZoom: number) => number,
      focalPoint?: { x: number; y: number }
    ) => {
      const viewportEl = canvasViewportRef.current;
      const rect = viewportEl?.getBoundingClientRect();
      const cx = focalPoint
        ? focalPoint.x
        : rect && rect.width > 0
          ? rect.width / 2
          : 420;
      const cy = focalPoint
        ? focalPoint.y
        : rect && rect.height > 0
          ? rect.height / 2
          : 310;

      setViewport((prev) => {
        const rawNext = resolveNextZoom(prev.zoom);
        const nextZoom = Math.min(
          1.75,
          Math.max(0.35, Number(rawNext.toFixed(2)))
        );
        if (nextZoom === prev.zoom) return prev;

        const worldX = (cx - prev.pan.x) / prev.zoom;
        const worldY = (cy - prev.pan.y) / prev.zoom;
        const nextPanX = Math.round(cx - worldX * nextZoom);
        const nextPanY = Math.round(cy - worldY * nextZoom);

        return {
          zoom: nextZoom,
          pan: { x: nextPanX, y: nextPanY },
        };
      });
    },
    []
  );

  // Fit a given list of nodes comfortably and centered inside the canvas viewport
  const fitNodesToViewport = useCallback((nodesToFit: FlowGraphNode[]) => {
    const viewportEl = canvasViewportRef.current;
    if (!viewportEl || nodesToFit.length === 0) {
      setViewport({ zoom: 0.92, pan: { x: 24, y: 24 } });
      return;
    }

    const rect = viewportEl.getBoundingClientRect();
    const viewW = rect.width > 0 ? rect.width : 840;
    const viewH = rect.height > 0 ? rect.height : 620;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const n of nodesToFit) {
      const pos = n.position;
      if (pos.x < minX) minX = pos.x;
      if (pos.y < minY) minY = pos.y;
      if (pos.x + NODE_WIDTH > maxX) maxX = pos.x + NODE_WIDTH;

      const domNode = viewportEl.querySelector<HTMLElement>(
        `[data-flow-node-id="${n.id}"]`
      );
      const nodeHeight =
        domNode && domNode.offsetHeight > 0
          ? domNode.offsetHeight
          : n.kind === 'welcome' || n.kind === 'completion'
            ? 136
            : 148 + n.outputHandles.length * 32;

      if (pos.y + nodeHeight > maxY) maxY = pos.y + nodeHeight;
    }

    const padX = 52;
    const padY = 44;
    const boxW = Math.max(NODE_WIDTH, maxX - minX);
    const boxH = Math.max(140, maxY - minY);

    const scaleX = Math.max(180, viewW - padX * 2) / boxW;
    const scaleY = Math.max(180, viewH - padY * 2) / boxH;
    const nextZoom = Number(
      Math.min(1.15, Math.max(0.35, Math.min(scaleX, scaleY))).toFixed(2)
    );

    const nextPanX = Math.round(
      (viewW - boxW * nextZoom) / 2 - minX * nextZoom
    );
    const nextPanY = Math.round(
      (viewH - boxH * nextZoom) / 2 - minY * nextZoom
    );

    setViewport({
      zoom: nextZoom,
      pan: { x: nextPanX, y: nextPanY },
    });
  }, []);

  // Fit all current nodes comfortably inside the canvas viewport
  const handleFitToView = useCallback(() => {
    const liveNodes = derivedGraph.nodes.map((n) => ({
      ...n,
      position: getEffectiveNodePosition(n.id, n.position),
    }));
    fitNodesToViewport(liveNodes);
  }, [derivedGraph.nodes, getEffectiveNodePosition, fitNodesToViewport]);

  const handleAutoArrange = () => {
    const nextForm = applyAutoLayoutToForm(form);
    onUpdateForm(() => nextForm, {
      label: 'Auto-arrange flow canvas',
    });
    const nextGraph = deriveFlowGraph(nextForm, simulatedAnswers);
    setTimeout(() => {
      fitNodesToViewport(nextGraph.nodes);
    }, 30);
  };

  // Automatically fit the graph into view once when entering Visual Canvas mode for a form
  useEffect(() => {
    if (flowMode !== 'visual') {
      lastFittedContextRef.current = null;
      return;
    }

    const contextKey = `${form.id}:${flowMode}`;
    if (lastFittedContextRef.current === contextKey) {
      return;
    }

    if (!form.flowCanvasLayout?.pan) {
      const timer = setTimeout(() => {
        lastFittedContextRef.current = contextKey;
        fitNodesToViewport(derivedGraph.nodes);
      }, 40);
      return () => clearTimeout(timer);
    } else {
      lastFittedContextRef.current = contextKey;
    }
  }, [
    flowMode,
    form.id,
    form.flowCanvasLayout?.pan,
    derivedGraph.nodes,
    fitNodesToViewport,
  ]);

  const completeFlowConnection = useCallback(
    (
      sourceNodeId: string,
      sourceHandleId: string,
      targetNodeId: string
    ) => {
      const result = applyFlowConnection(form, {
        sourceQuestionId: sourceNodeId,
        sourceHandleId,
        targetNodeId,
      });

      if (!result.valid) {
        setConnectionFeedback({
          type: 'error',
          message: result.reason || 'Invalid branch connection.',
        });
        return;
      }

      onUpdateForm(() => result.form, {
        label:
          sourceHandleId === 'default'
            ? 'Update default path'
            : sourceHandleId === 'new-rule'
              ? 'Connect branch rule'
              : 'Retarget branch rule',
      });

      setSelectedNodeId(sourceNodeId);
      setPendingDropMenu(null);
      if (result.createdRuleId) {
        setHighlightedRuleId(result.createdRuleId);
        setConnectionFeedback({
          type: 'info',
          message:
            'Branch connected. Edit its condition in the settings panel.',
        });
      } else if (result.updatedRuleId) {
        setHighlightedRuleId(result.updatedRuleId);
        setConnectionFeedback(null);
      } else {
        setConnectionFeedback(null);
      }
    },
    [form, onUpdateForm, setSelectedNodeId]
  );

  // Spawn a brand-new question directly on the canvas (from spaghetti drop menu, "+ Add branch" menu, or toolbar)
  const handleCreateQuestionOnCanvas = useCallback(
    (
      type: QuestionType,
      options?: {
        position?: FlowNodePosition;
        sourceQuestionId?: string;
        sourceHandleId?: string;
      }
    ) => {
      const result = createAndConnectQuestionOnCanvas(form, {
        questionType: type,
        position: options?.position,
        sourceQuestionId: options?.sourceQuestionId,
        sourceHandleId: options?.sourceHandleId,
      });

      if (!result.valid) {
        setConnectionFeedback({
          type: 'error',
          message:
            result.reason || 'Could not create and connect new question.',
        });
        return;
      }

      onUpdateForm(() => result.form, {
        label: options?.sourceQuestionId
          ? `Add & connect ${QUESTION_TYPE_META[type].label} question`
          : `Add ${QUESTION_TYPE_META[type].label} question`,
      });

      // Initialize simulated answer for the new question so live path simulator stays ready
      setSimulatedAnswers((prev) => {
        const q = result.createdQuestion;
        let sample: AnswerValue = 'Sample answer';
        if (q.type === 'yes_no') sample = 'Yes';
        else if (q.choices && q.choices.length > 0) sample = q.choices[0].label;
        else if (q.type === 'rating') sample = 5;
        else if (q.type === 'number') sample = 2;
        return { ...prev, [q.id]: sample };
      });

      setSelectedNodeId(result.createdQuestion.id);
      setIsQuestionContentExpanded(true);
      setHighlightedRuleId(result.createdRuleId || null);
      setPendingDropMenu(null);
      setShowToolbarAddMenu(false);

      if (options?.sourceQuestionId) {
        setConnectionFeedback({
          type: 'info',
          message: `Created "${result.createdQuestion.title}" and connected it! Edit its prompt or branch rules in the Inspector.`,
        });
      } else {
        setConnectionFeedback(null);
      }
    },
    [form, onUpdateForm, setSelectedNodeId]
  );

  // Start a connection drag or click from a question's output handle
  const initiateHandleConnection = (
    e: React.PointerEvent,
    node: FlowGraphNode,
    handle: { id: string; label: string },
    handleIdx: number
  ) => {
    if (!e.isPrimary || e.button !== 0) return;
    e.stopPropagation();
    const handleY =
      node.kind === 'welcome' ? 68 : getHandleOffsetY(handleIdx);
    const startX = node.position.x + NODE_WIDTH;
    const startY = node.position.y + handleY;

    if (node.kind === 'question') {
      setSelectedNodeId(node.id);
    }
    setConnectionFeedback(null);
    setPendingDropMenu(null);
    setShowToolbarAddMenu(false);

    setActiveConnection({
      sourceNodeId: node.id,
      sourceHandleId: handle.id,
      sourceLabel: `Q${(node.questionIndex ?? 0) + 1} (${handle.label})`,
      startX,
      startY,
      currentX: startX + 24,
      currentY: startY,
      startClientX: e.clientX,
      startClientY: e.clientY,
      isDragging: false,
      hoveredTargetId: null,
    });
  };

  // Global window pointer move/up listeners for smooth node dragging, canvas panning, and spaghetti edge wiring
  useEffect(() => {
    if (!isPanning && !draggingNode && !activeConnection) return;

    const handlePointerMove = (e: PointerEvent) => {
      if (!e.isPrimary) return;
      if (isPanning && panStartRef.current) {
        const dx = e.clientX - panStartRef.current.clientX;
        const dy = e.clientY - panStartRef.current.clientY;
        const nextX = Math.round(panStartRef.current.originX + dx);
        const nextY = Math.round(panStartRef.current.originY + dy);
        setViewport((prev) => ({
          ...prev,
          pan: { x: nextX, y: nextY },
        }));
      } else if (draggingNode) {
        const dx = (e.clientX - draggingNode.startClientX) / zoom;
        const dy = (e.clientY - draggingNode.startClientY) / zoom;
        setDraggingNode((prev) =>
          prev
            ? {
                ...prev,
                currentX: prev.originX + dx,
                currentY: prev.originY + dy,
              }
            : null
        );
      } else if (activeConnection && canvasViewportRef.current) {
        const rect = canvasViewportRef.current.getBoundingClientRect();
        const canvasX = (e.clientX - rect.left - pan.x) / zoom;
        const canvasY = (e.clientY - rect.top - pan.y) / zoom;
        const movedScreenPx = Math.hypot(
          e.clientX - activeConnection.startClientX,
          e.clientY - activeConnection.startClientY
        );

        // Detect if pointer is hovering over a node with a target port
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const targetNodeEl = el?.closest('[data-flow-node-id]');
        const hoveredId = targetNodeEl
          ? targetNodeEl.getAttribute('data-flow-node-id')
          : null;

        setActiveConnection((prev) =>
          prev
            ? {
                ...prev,
                currentX: canvasX,
                currentY: canvasY,
                isDragging: prev.isDragging || movedScreenPx > 6,
                hoveredTargetId: hoveredId,
              }
            : null
        );
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!e.isPrimary) return;
      if (isPanning) {
        setIsPanning(false);
        panStartRef.current = null;
      }

      if (draggingNode) {
        const dx = (e.clientX - draggingNode.startClientX) / zoom;
        const dy = (e.clientY - draggingNode.startClientY) / zoom;
        const finalNodeId = draggingNode.nodeId;
        const finalPos = {
          x: Math.round(draggingNode.originX + dx),
          y: Math.round(draggingNode.originY + dy),
        };
        setDraggingNode(null);

        if (Math.hypot(dx * zoom, dy * zoom) > 4) {
          onUpdateForm(
            (prev) => updateFlowNodePosition(prev, finalNodeId, finalPos),
            { label: 'Move canvas node' }
          );
        }
      }

      if (activeConnection) {
        const computeClampedMenuCoords = (rawX: number, rawY: number) => {
          const viewportEl = canvasViewportRef.current;
          const rect = viewportEl?.getBoundingClientRect();
          const viewW = rect && rect.width > 0 ? rect.width : 840;
          const viewH = rect && rect.height > 0 ? rect.height : 640;
          const minWorldX = Math.round((16 - pan.x) / zoom);
          const maxWorldX = Math.round((viewW - pan.x - 16) / zoom - 304);
          const minWorldY = Math.round((54 - pan.y) / zoom);
          const maxWorldY = Math.round((viewH - pan.y - 20) / zoom - 445);
          return {
            menuX: Math.max(
              minWorldX,
              Math.min(Math.max(minWorldX, maxWorldX), rawX)
            ),
            menuY: Math.max(
              minWorldY,
              Math.min(Math.max(minWorldY, maxWorldY), rawY)
            ),
          };
        };

        const moved = Math.hypot(e.clientX - activeConnection.startClientX, e.clientY - activeConnection.startClientY);
        if (activeConnection.isDragging || moved > 6) {
          const el = document.elementFromPoint(e.clientX, e.clientY);
          const targetNodeEl = el?.closest('[data-flow-node-id]');
          const dropTargetId =
            targetNodeEl?.getAttribute('data-flow-node-id') ||
            activeConnection.hoveredTargetId;

          if (
            dropTargetId &&
            dropTargetId !== activeConnection.sourceNodeId
          ) {
            completeFlowConnection(
              activeConnection.sourceNodeId,
              activeConnection.sourceHandleId,
              dropTargetId
            );
            setActiveConnection(null);
          } else if (
            dropTargetId &&
            dropTargetId === activeConnection.sourceNodeId
          ) {
            setConnectionFeedback({
              type: 'error',
              message:
                'A question cannot branch directly to itself (self-loop). Drag to another question, Completion, or empty canvas space.',
            });
            setActiveConnection(null);
          } else {
            // Released on empty canvas space after dragging a connection!
            // Open the floating "Add Next Step / Branch" menu right where the user let go.
            let dropX = Math.round(activeConnection.currentX);
            let dropY = Math.round(activeConnection.currentY - 24);
            if (canvasViewportRef.current) {
              const rect = canvasViewportRef.current.getBoundingClientRect();
              dropX = Math.round((e.clientX - rect.left - pan.x) / zoom);
              dropY = Math.round((e.clientY - rect.top - pan.y) / zoom - 24);
            }
            const safeDropX = Math.max(24, dropX);
            const safeDropY = Math.max(24, dropY);
            const { menuX, menuY } = computeClampedMenuCoords(
              safeDropX,
              safeDropY
            );
            setPendingDropMenu({
              sourceNodeId: activeConnection.sourceNodeId,
              sourceHandleId: activeConnection.sourceHandleId,
              sourceLabel: activeConnection.sourceLabel,
              startX: activeConnection.startX,
              startY: activeConnection.startY,
              dropX: safeDropX,
              dropY: safeDropY,
              menuX,
              menuY,
            });
            setActiveConnection(null);
          }
        } else {
          // User clicked "+ Add branch" or the output port without dragging!
          // Open the exact same floating "Add Next Step / Branch" menu next to the card.
          const rawDropX = Math.round(activeConnection.startX + 56);
          const rawDropY = Math.max(20, Math.round(activeConnection.startY - 36));
          const { menuX, menuY } = computeClampedMenuCoords(rawDropX, rawDropY);
          setPendingDropMenu({
            sourceNodeId: activeConnection.sourceNodeId,
            sourceHandleId: activeConnection.sourceHandleId,
            sourceLabel: activeConnection.sourceLabel,
            startX: activeConnection.startX,
            startY: activeConnection.startY,
            dropX: rawDropX,
            dropY: rawDropY,
            menuX,
            menuY,
          });
          setActiveConnection(null);
        }
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    const cancelGesture = () => {
      panStartRef.current = null;
      setIsPanning(false);
      setDraggingNode(null);
      setActiveConnection(null);
    };
    window.addEventListener('pointercancel', cancelGesture);
    window.addEventListener('blur', cancelGesture);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', cancelGesture);
      window.removeEventListener('blur', cancelGesture);
    };
  });

  const handleDisconnectEdge = (edgeId: string, label: string) => {
    onUpdateForm((prev) => disconnectFlowEdge(prev, edgeId), {
      label: `Remove branch (${label})`,
    });
    setConnectionFeedback(null);
  };

  // Question content editing helpers (100% parity with FormBuilder so everything works in the canvas)
  const handleUpdateQuestion = (
    questionId: string,
    updates: Partial<FormQuestion>,
    options?: RecordChangeOptions
  ) => {
    let inferredOptions = options;
    if (!inferredOptions) {
      if ('title' in updates && Object.keys(updates).length === 1) {
        inferredOptions = {
          label: 'Edit question prompt',
          coalesceKey: `q-title-${questionId}`,
        };
      } else if (
        'description' in updates &&
        Object.keys(updates).length === 1
      ) {
        inferredOptions = {
          label: 'Edit question description',
          coalesceKey: `q-desc-${questionId}`,
        };
      } else if (
        'placeholder' in updates &&
        Object.keys(updates).length === 1
      ) {
        inferredOptions = {
          label: 'Edit placeholder',
          coalesceKey: `q-placeholder-${questionId}`,
        };
      } else if ('type' in updates) {
        inferredOptions = { label: 'Change question type' };
      } else if ('required' in updates) {
        inferredOptions = { label: 'Toggle required answer' };
      } else {
        inferredOptions = { label: 'Update question settings' };
      }
    }

    onUpdateForm(
      (prev) => ({
        ...prev,
        updatedAt: new Date().toISOString(),
        questions: prev.questions.map((q) => {
          if (q.id !== questionId) return q;
          const next = { ...q, ...updates };
          if (
            (next.type === 'single_choice' ||
              next.type === 'multiple_choice' ||
              next.type === 'dropdown') &&
            (!next.choices || next.choices.length === 0)
          ) {
            next.choices = [
              { id: generateId('opt'), label: 'Option A' },
              { id: generateId('opt'), label: 'Option B' },
              { id: generateId('opt'), label: 'Option C' },
            ];
          }
          if (next.type === 'yes_no') {
            next.choices = [
              { id: 'yes', label: 'Yes' },
              { id: 'no', label: 'No' },
            ];
          }
          if (next.type === 'rating' && !next.maxRating) {
            next.maxRating = 5;
          }
          return next;
        }),
      }),
      inferredOptions
    );
  };

  const handleMoveQuestion = (index: number, direction: -1 | 1) => {
    const toIndex = index + direction;
    if (
      index < 0 ||
      index >= form.questions.length ||
      toIndex < 0 ||
      toIndex >= form.questions.length
    ) {
      return;
    }
    onUpdateForm((prev) => reorderQuestions(prev, index, toIndex), {
      label: 'Reorder questions',
    });
  };

  const handleDuplicateQuestion = (question: FormQuestion, index: number) => {
    const duplicated: FormQuestion = {
      ...question,
      id: generateId('q'),
      title: `${question.title} (Copy)`,
      choices: question.choices?.map((c) => ({ ...c, id: generateId('opt') })),
      logicRules: [],
    };
    onUpdateForm(
      (prev) => {
        const copy = [...prev.questions];
        copy.splice(index + 1, 0, duplicated);
        const existingPos = prev.flowCanvasLayout?.positions?.[question.id];
        const nextPositions = {
          ...(prev.flowCanvasLayout?.positions || {}),
          ...(existingPos
            ? {
                [duplicated.id]: {
                  x: existingPos.x + 40,
                  y: existingPos.y + 180,
                },
              }
            : {}),
        };
        return {
          ...prev,
          updatedAt: new Date().toISOString(),
          questionOrder: copy.map((q) => q.id),
          questions: copy,
          flowCanvasLayout: {
            ...(prev.flowCanvasLayout || {}),
            positions: nextPositions,
          },
        };
      },
      { label: 'Duplicate question' }
    );
    setSelectedNodeId(duplicated.id);
  };

  const handleDeleteQuestion = (questionId: string) => {
    if (form.questions.length <= 1) return;
    const idx = form.questions.findIndex((q) => q.id === questionId);
    const cleanedForm = removeQuestionAndCleanReferences(form, questionId);
    onUpdateForm((prev) => removeQuestionAndCleanReferences(prev, questionId), {
      label: 'Delete question',
    });
    const fallbackQ = cleanedForm.questions[Math.max(0, idx - 1)];
    setSelectedNodeId(fallbackQ ? fallbackQ.id : 'welcome');
  };

  const handleReorderChoice = (
    question: FormQuestion,
    fromIndex: number,
    toIndex: number
  ) => {
    const reordered = reorderQuestionChoices(question, fromIndex, toIndex);
    if (reordered === question) return;
    handleUpdateQuestion(
      question.id,
      {
        choices: reordered.choices,
        logicRules: reordered.logicRules,
      },
      { label: 'Reorder choices' }
    );
  };

  const getTargetLabel = (targetId: string | undefined, currentIdx: number) => {
    if (!targetId || targetId === 'next') {
      const nextQ = form.questions[currentIdx + 1];
      if (!nextQ) return 'Completion Screen';
      return `${String(currentIdx + 2).padStart(2, '0')} · ${nextQ.title}`;
    }
    if (targetId === 'completion') {
      return 'Completion Screen';
    }
    const targetIdx = form.questions.findIndex((q) => q.id === targetId);
    if (targetIdx === -1) return 'Completion Screen';
    return `${String(targetIdx + 1).padStart(2, '0')} · ${form.questions[targetIdx].title}`;
  };

  const handleAddRule = (question: FormQuestion) => {
    const qIdx = form.questions.findIndex((q) => q.id === question.id);
    const defaultTarget =
      form.questions[qIdx + 2]?.id ||
      form.questions[qIdx + 1]?.id ||
      'completion';

    let defaultVal = '';
    let defaultOp: LogicOperator = 'equals';

    if (question.type === 'yes_no') {
      defaultVal = 'No';
    } else if (question.choices && question.choices.length > 0) {
      defaultVal = question.choices[0].label;
    } else if (question.type === 'rating') {
      defaultOp = 'less_than';
      defaultVal = '4';
    } else if (question.type === 'number') {
      defaultOp = 'greater_than';
      defaultVal = '2';
    } else {
      defaultOp = 'is_answered';
      defaultVal = '';
    }

    const newRule: LogicRule = {
      id: generateId('rule'),
      operator: defaultOp,
      value: defaultVal,
      targetId: defaultTarget,
    };

    onUpdateForm(
      (prev) => ({
        ...prev,
        updatedAt: new Date().toISOString(),
        questions: prev.questions.map((q) =>
          q.id === question.id
            ? { ...q, logicRules: [...(q.logicRules || []), newRule] }
            : q
        ),
      }),
      { label: 'Add branch rule' }
    );
    setHighlightedRuleId(newRule.id);
  };

  const handleUpdateRule = (
    questionId: string,
    ruleId: string,
    updates: Partial<LogicRule>,
    coalesceKey?: string
  ) => {
    onUpdateForm(
      (prev) => ({
        ...prev,
        updatedAt: new Date().toISOString(),
        questions: prev.questions.map((q) =>
          q.id === questionId
            ? {
                ...q,
                logicRules: q.logicRules.map((r) =>
                  r.id === ruleId ? { ...r, ...updates } : r
                ),
              }
            : q
        ),
      }),
      {
        label: 'Update branch rule',
        ...(coalesceKey ? { coalesceKey } : {}),
      }
    );
  };

  const handleDeleteRule = (questionId: string, ruleId: string) => {
    onUpdateForm(
      (prev) => ({
        ...prev,
        updatedAt: new Date().toISOString(),
        questions: prev.questions.map((q) =>
          q.id === questionId
            ? { ...q, logicRules: q.logicRules.filter((r) => r.id !== ruleId) }
            : q
        ),
      }),
      { label: 'Delete branch rule' }
    );
  };

  const handleUpdateDefaultNext = (
    questionId: string,
    defaultNextId: string
  ) => {
    onUpdateForm(
      (prev) => ({
        ...prev,
        updatedAt: new Date().toISOString(),
        questions: prev.questions.map((q) =>
          q.id === questionId ? { ...q, defaultNextId } : q
        ),
      }),
      { label: 'Update default path' }
    );
  };

  // Build map of nodes by ID with effective live positions for edge SVG rendering
  const nodeMap = new Map(
    derivedGraph.nodes.map((n) => [
      n.id,
      {
        ...n,
        position: getEffectiveNodePosition(n.id, n.position),
      },
    ])
  );

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-5 space-y-5">
      <div className="bg-[#FFFDF9] border-2 border-[#2A2623] rounded-2xl p-4 sm:p-5 shadow-[3px_3px_0px_#2A2623] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-display text-xl font-bold text-[#2A2623] flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-[#E86D52]" />
              <span>Form flow</span>
            </h2>
            <p className="text-xs sm:text-sm text-[#6E655E]">
              Connect questions to set the path respondents follow. Drag a connection
              to a question or empty space, or choose{' '}
              <strong className="text-[#D4573B]">+ Add branch</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div
              className="inline-flex items-center gap-1 p-1 bg-[#EFE9DE] border-2 border-[#2A2623] rounded-xl"
              role="tablist"
              aria-label="Flow editor view mode"
            >
              <button
                type="button"
                role="tab"
                data-testid="flow-mode-visual"
                aria-selected={flowMode === 'visual'}
                onClick={() => handleSelectFlowMode('visual')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  flowMode === 'visual'
                    ? 'bg-[#FFFDF9] text-[#2A2623] border border-[#2A2623] shadow-[1px_1px_0px_#2A2623]'
                    : 'text-[#6E655E] hover:text-[#2A2623]'
                }`}
              >
                <Workflow className="w-3.5 h-3.5 text-[#E86D52]" />
                <span>Visual Canvas</span>
              </button>

              <button
                type="button"
                role="tab"
                data-testid="flow-mode-rules"
                aria-selected={flowMode === 'rules'}
                onClick={() => handleSelectFlowMode('rules')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  flowMode === 'rules'
                    ? 'bg-[#FFFDF9] text-[#2A2623] border border-[#2A2623] shadow-[1px_1px_0px_#2A2623]'
                    : 'text-[#6E655E] hover:text-[#2A2623]'
                }`}
              >
                <ListFilter className="w-3.5 h-3.5 text-[#E86D52]" />
                <span>Rule Editor</span>
              </button>
            </div>

            <PaperButton variant="yellow" size="sm" onClick={onLaunchPreview}>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Test Flow in Preview</span>
            </PaperButton>
          </div>
        </div>
        <div className="p-3.5 rounded-xl bg-[#FAF6F0] border-2 border-[#2A2623] space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-bold text-[#2A2623] flex items-center gap-1.5">
              <Compass className="w-4 h-4 text-[#E86D52]" />
              <span>Live Path Simulator</span>
            </span>
            <span className="font-mono font-semibold text-[#6E655E] tabular-nums">
              Active path visits {activeSequence.length} of{' '}
              {form.questions.length} questions
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {form.questions
              .filter((q) => q.logicRules && q.logicRules.length > 0)
              .map((q) => {
                const qIdx = form.questions.findIndex(
                  (item) => item.id === q.id
                );
                const currentSimVal = String(simulatedAnswers[q.id] ?? '');

                return (
                  <div
                    key={q.id}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#FFFDF9] border border-[#2A2623] text-xs"
                  >
                    <span className="font-mono font-bold text-[#2A2623]">
                      Q{qIdx + 1}:
                    </span>
                    <label htmlFor={`sim-select-${q.id}`} className="sr-only">
                      Simulate answer for {q.title}
                    </label>
                    {q.type === 'yes_no' ? (
                      <select
                        id={`sim-select-${q.id}`}
                        value={currentSimVal}
                        onChange={(e) =>
                          setSimulatedAnswers((prev) => ({
                            ...prev,
                            [q.id]: e.target.value,
                          }))
                        }
                        className="font-bold text-[#D4573B] bg-transparent focus:outline-none cursor-pointer"
                      >
                        <option value="Yes">Answer = Yes</option>
                        <option value="No">Answer = No</option>
                      </select>
                    ) : q.choices && q.choices.length > 0 ? (
                      <select
                        id={`sim-select-${q.id}`}
                        value={currentSimVal}
                        onChange={(e) =>
                          setSimulatedAnswers((prev) => ({
                            ...prev,
                            [q.id]: e.target.value,
                          }))
                        }
                        className="font-bold text-[#D4573B] bg-transparent focus:outline-none cursor-pointer max-w-[180px] truncate"
                      >
                        {q.choices.map((c) => (
                          <option key={c.id} value={c.label}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    ) : q.type === 'rating' ? (
                      <select
                        id={`sim-select-${q.id}`}
                        value={currentSimVal}
                        onChange={(e) =>
                          setSimulatedAnswers((prev) => ({
                            ...prev,
                            [q.id]: Number(e.target.value),
                          }))
                        }
                        className="font-bold text-[#D4573B] bg-transparent focus:outline-none cursor-pointer"
                      >
                        {Array.from(
                          { length: q.maxRating || 5 },
                          (_, i) => i + 1
                        ).map((score) => (
                          <option key={score} value={String(score)}>
                            Rating = {score} ★
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={`sim-select-${q.id}`}
                        type="text"
                        value={currentSimVal}
                        onChange={(e) =>
                          setSimulatedAnswers((prev) => ({
                            ...prev,
                            [q.id]: e.target.value,
                          }))
                        }
                        className="w-24 font-bold text-[#D4573B] bg-transparent border-b border-[#2A2623] focus:outline-none"
                      />
                    )}
                  </div>
                );
              })}
            {form.questions.every(
              (q) => !q.logicRules || q.logicRules.length === 0
            ) && (
              <span className="text-xs text-[#6E655E]">
                Drag a connection from any node or click{' '}
                <strong className="text-[#D4573B]">+ Add branch</strong> on a
                card to create your first branch or next question.
              </span>
            )}
          </div>
        </div>
        {(derivedGraph.diagnostics.unreachableQuestionIds.length > 0 ||
          derivedGraph.diagnostics.circularPathsDetected) && (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-[#FFF9EB] border-2 border-[#2A2623] text-xs text-[#2A2623]"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#D4573B] shrink-0" />
              <span>
                {derivedGraph.diagnostics.unreachableQuestionIds.length > 0 && (
                  <>
                    <strong>Unreachable questions detected:</strong>{' '}
                    {derivedGraph.diagnostics.unreachableQuestionIds
                      .map((id) => {
                        const idx = form.questions.findIndex(
                          (q) => q.id === id
                        );
                        return idx >= 0 ? `Q${idx + 1}` : id;
                      })
                      .join(', ')}{' '}
                    cannot be reached from the start. Add a branch or change a default destination to include them.{' '}
                  </>
                )}
                {derivedGraph.diagnostics.circularPathsDetected && (
                  <span>
                    <strong>Backward jump detected:</strong> Ensure loop
                    conditions eventually route forward so respondents can
                    finish.
                  </span>
                )}
              </span>
            </div>
          </div>
        )}
        {connectionFeedback && (
          <div
            role="alert"
            className={`flex items-center justify-between gap-2 px-3.5 py-2 rounded-xl border-2 border-[#2A2623] text-xs font-semibold ${
              connectionFeedback.type === 'error'
                ? 'bg-[#FDECE8] text-[#D4573B]'
                : 'bg-[#C5DFC9] text-[#2A2623]'
            }`}
          >
            <span>{connectionFeedback.message}</span>
            <button
              type="button"
              onClick={() => setConnectionFeedback(null)}
              aria-label="Dismiss notice"
              className="p-1 rounded hover:bg-black/10 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section
          aria-label={
            flowMode === 'visual'
              ? 'Interactive visual node canvas'
              : 'Structured rule editor'
          }
          className="lg:col-span-7 xl:col-span-8"
        >
          {flowMode === 'visual' ? (
            /* =========================================================
               MODE 1: INTERACTIVE NODE-BASED VISUAL CANVAS
               ========================================================= */
            <div
              data-testid="visual-flow-canvas-container"
              className="bg-[#FFFDF9] border-2 border-[#2A2623] rounded-3xl overflow-hidden shadow-[4px_4px_0px_#2A2623] flex flex-col"
            >
              <div className="px-4 py-3 bg-[#FAF6F0] border-b-2 border-[#2A2623] flex flex-wrap items-center justify-between gap-3 relative">
                <div className="flex flex-wrap items-center gap-2.5 text-xs text-[#6E655E]">
                  <div className="relative">
                    <button
                      type="button"
                      data-testid="canvas-toolbar-add-question"
                      onClick={() => {
                        setShowToolbarAddMenu((v) => !v);
                        setPendingDropMenu(null);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#E86D52] border-2 border-[#2A2623] text-xs font-bold text-white shadow-[2px_2px_0px_#2A2623] hover:bg-[#d95d42] active:translate-y-px cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Question</span>
                    </button>

                    {showToolbarAddMenu && (
                      <div
                        data-testid="canvas-toolbar-add-picker"
                        className="absolute left-0 top-full mt-2 z-50 w-72 p-3 bg-[#FFFDF9] border-2 border-[#2A2623] rounded-2xl shadow-[4px_4px_0px_#2A2623] space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-[#2A2623]">
                            Add Question to Canvas
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowToolbarAddMenu(false)}
                            aria-label="Close add question menu"
                            className="p-0.5 rounded hover:bg-[#EFE9DE] text-[#6E655E] cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {ALL_QUESTION_TYPES.map((t) => {
                            const info = QUESTION_TYPE_META[t];
                            return (
                              <button
                                key={t}
                                type="button"
                                data-testid={`canvas-toolbar-create-${t}`}
                                onClick={() => handleCreateQuestionOnCanvas(t)}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#FAF6F0] border border-[#2A2623] hover:bg-[#F6D97A] text-left text-xs font-semibold text-[#2A2623] transition-colors cursor-pointer"
                              >
                                <span
                                  className="w-2.5 h-2.5 rounded-full border border-[#2A2623] shrink-0"
                                  style={{ backgroundColor: info.badgeBg }}
                                />
                                <span className="truncate">{info.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  <span className="hidden xl:inline text-[11px] text-[#6E655E]">
                    Drag a line and let go anywhere—or click{' '}
                    <strong className="text-[#D4573B]">+ Add branch</strong>—to
                    add or connect what comes next
                  </span>
                </div>

                <div
                  className="flex items-center gap-1.5"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    data-testid="canvas-zoom-out"
                    onClick={() => applyZoomLevel((z) => z - 0.1)}
                    aria-label="Zoom out canvas"
                    title="Zoom Out"
                    className="p-1.5 rounded-lg bg-[#FFFDF9] border border-[#2A2623] text-[#2A2623] hover:bg-[#EFE9DE] active:translate-y-px cursor-pointer"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    data-testid="canvas-zoom-reset"
                    onClick={() => applyZoomLevel(() => 1)}
                    aria-label="Reset zoom to 100%"
                    title="Reset Zoom to 100%"
                    className="px-2 py-1 rounded-lg bg-[#FFFDF9] border border-[#2A2623] font-mono text-xs font-bold text-[#2A2623] hover:bg-[#EFE9DE] active:translate-y-px cursor-pointer tabular-nums"
                  >
                    {Math.round(zoom * 100)}%
                  </button>
                  <button
                    type="button"
                    data-testid="canvas-zoom-in"
                    onClick={() => applyZoomLevel((z) => z + 0.1)}
                    aria-label="Zoom in canvas"
                    title="Zoom In"
                    className="p-1.5 rounded-lg bg-[#FFFDF9] border border-[#2A2623] text-[#2A2623] hover:bg-[#EFE9DE] active:translate-y-px cursor-pointer"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    data-testid="canvas-fit-view"
                    onClick={() => handleFitToView()}
                    aria-label="Fit flow diagram to view"
                    title="Fit to View"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#FFFDF9] border border-[#2A2623] text-xs font-bold text-[#2A2623] hover:bg-[#EFE9DE] active:translate-y-px cursor-pointer"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Fit</span>
                  </button>
                  <button
                    type="button"
                    data-testid="canvas-auto-layout"
                    onClick={handleAutoArrange}
                    aria-label="Auto-arrange node layout"
                    title="Auto-Arrange Nodes"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F6D97A] border border-[#2A2623] text-xs font-bold text-[#2A2623] hover:bg-[#f2ce5c] active:translate-y-px cursor-pointer"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>Auto-Layout</span>
                  </button>
                  {flowOverlay && (
                    <button
                      type="button"
                      data-testid="canvas-toggle-analytics-overlay"
                      onClick={() => setShowAnalyticsOverlay((prev) => !prev)}
                      aria-label="Toggle flow analytics overlay"
                      title="Show or hide respondent visit counts and branch usage percentages"
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#2A2623] text-xs font-bold active:translate-y-px cursor-pointer transition-colors ${
                        showAnalyticsOverlay
                          ? 'bg-[#C5DFC9] text-[#2A2623]'
                          : 'bg-[#FFFDF9] text-[#6E655E] hover:bg-[#EFE9DE]'
                      }`}
                    >
                      <BarChart3 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Traffic</span>
                    </button>
                  )}
                </div>
              </div>
              <div
                ref={canvasViewportRef}
                data-testid="visual-flow-viewport"
                onPointerDown={(e) => {
                  if (!e.isPrimary || e.button !== 0) return;
                  // Only pan when clicking directly on the canvas background
                  const target = e.target as HTMLElement;
                  if (
                    target.closest('[data-flow-node-id]') ||
                    target.closest('[data-flow-edge-control]') ||
                    target.closest('[data-flow-drop-menu]') ||
                    target.closest('[data-flow-helper-banner]')
                  ) {
                    return;
                  }
                  if (activeConnection) {
                    setActiveConnection(null);
                  }
                  if (pendingDropMenu) {
                    setPendingDropMenu(null);
                  }
                  if (showToolbarAddMenu) {
                    setShowToolbarAddMenu(false);
                  }
                  setIsPanning(true);
                  panStartRef.current = {
                    clientX: e.clientX,
                    clientY: e.clientY,
                    originX: pan.x,
                    originY: pan.y,
                  };
                }}
                onWheel={(e) => {
                  if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const delta = e.deltaY < 0 ? 0.08 : -0.08;
                    applyZoomLevel((z) => z + delta, {
                      x: e.clientX - rect.left,
                      y: e.clientY - rect.top,
                    });
                  }
                }}
                style={{
                  backgroundImage:
                    'radial-gradient(#2A2623 1px, transparent 1px)',
                  backgroundSize: `${Math.round(24 * zoom)}px ${Math.round(24 * zoom)}px`,
                  backgroundPosition: `${pan.x}px ${pan.y}px`,
                  backgroundColor: '#FAF6F0',
                }}
                className={`relative h-[min(62dvh,640px)] min-h-[360px] w-full touch-none overflow-hidden select-none ${
                  isPanning ? 'cursor-grabbing' : 'cursor-grab'
                }`}
              >
                {(activeConnection || pendingDropMenu) && (
                  <div
                    data-flow-helper-banner="true"
                    className="absolute top-2.5 left-3 right-3 z-40 px-3.5 py-2 rounded-xl bg-[#F6D97A] border-2 border-[#2A2623] shadow-[3px_3px_0px_#2A2623] flex items-center justify-between gap-2 text-xs font-bold text-[#2A2623]"
                  >
                    <span className="truncate">
                      Connecting{' '}
                      <strong>
                        {activeConnection?.sourceLabel ||
                          pendingDropMenu?.sourceLabel}
                      </strong>{' '}
                      — choose what to add next in the popup menu, or click any
                      destination card on the canvas.
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveConnection(null);
                        setPendingDropMenu(null);
                      }}
                      className="px-2 py-0.5 rounded bg-[#FFFDF9] border border-[#2A2623] text-[11px] shrink-0 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                )}
                <div
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transformOrigin: '0 0',
                  }}
                  className="absolute top-0 left-0 w-[3200px] h-[2000px] pointer-events-none"
                >
                  <svg
                    className="absolute inset-0 w-full h-full overflow-visible pointer-events-none"
                    aria-label="Branch connections"
                  >
                    <defs>
                      <marker
                        id="arrow-rule-active"
                        viewBox="0 0 10 10"
                        refX="8"
                        refY="5"
                        markerWidth="6"
                        markerHeight="6"
                        orient="auto-start-reverse"
                      >
                        <path d="M 0 1 L 10 5 L 0 9 z" fill="#E86D52" />
                      </marker>
                      <marker
                        id="arrow-default"
                        viewBox="0 0 10 10"
                        refX="8"
                        refY="5"
                        markerWidth="6"
                        markerHeight="6"
                        orient="auto-start-reverse"
                      >
                        <path d="M 0 1 L 10 5 L 0 9 z" fill="#2A2623" />
                      </marker>
                      <marker
                        id="arrow-muted"
                        viewBox="0 0 10 10"
                        refX="8"
                        refY="5"
                        markerWidth="6"
                        markerHeight="6"
                        orient="auto-start-reverse"
                      >
                        <path d="M 0 1 L 10 5 L 0 9 z" fill="#9C9288" />
                      </marker>
                    </defs>

                    {derivedGraph.edges.map((edge) => {
                      const sourceNode = nodeMap.get(edge.sourceNodeId);
                      const targetNode = nodeMap.get(edge.targetNodeId);
                      if (!sourceNode || !targetNode) return null;

                      const handleIdx = Math.max(
                        0,
                        sourceNode.outputHandles.findIndex(
                          (h) => h.id === edge.sourceHandleId
                        )
                      );

                      const x1 = sourceNode.position.x + NODE_WIDTH;
                      const y1 =
                        sourceNode.position.y +
                        (sourceNode.kind === 'welcome'
                          ? 68
                          : getHandleOffsetY(handleIdx));

                      const x2 = targetNode.position.x;
                      const y2 = targetNode.position.y + 52;

                      const dx = Math.max(80, Math.abs(x2 - x1) * 0.48);
                      const pathD = edge.isBackwardJump
                        ? `M ${x1} ${y1} C ${x1 + 110} ${y1 - 120}, ${x2 - 110} ${y2 - 120}, ${x2} ${y2}`
                        : `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

                      const midX = (x1 + x2) / 2;
                      const midY = edge.isBackwardJump
                        ? Math.min(y1, y2) - 70
                        : (y1 + y2) / 2 + (edge.kind === 'rule' ? -10 : 12);

                      const isRule = edge.kind === 'rule';
                      const isActive = edge.isOnActiveSimulatedPath;
                      const strokeColor = isRule
                        ? '#E86D52'
                        : isActive
                          ? '#2A2623'
                          : '#9C9288';

                      return (
                        <g key={edge.id}>
                          {isActive && (
                            <path
                              d={pathD}
                              fill="none"
                              stroke={isRule ? '#F6D97A' : '#C5DFC9'}
                              strokeWidth={7}
                              strokeOpacity={0.65}
                            />
                          )}
                          <path
                            d={pathD}
                            fill="none"
                            stroke={strokeColor}
                            strokeWidth={isActive ? 2.75 : 2}
                            strokeDasharray={
                              edge.kind === 'default' ? '6 4' : undefined
                            }
                            markerEnd={
                              isRule
                                ? 'url(#arrow-rule-active)'
                                : isActive
                                  ? 'url(#arrow-default)'
                                  : 'url(#arrow-muted)'
                            }
                          />
                          <foreignObject
                            x={midX - 96}
                            y={midY - 14}
                            width={192}
                            height={30}
                            className="overflow-visible pointer-events-auto"
                          >
                            <div
                              data-flow-edge-control="true"
                              className="flex items-center justify-center"
                            >
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (edge.sourceNodeId !== 'welcome') {
                                    setSelectedNodeId(edge.sourceNodeId);
                                    if (edge.ruleId) {
                                      setHighlightedRuleId(edge.ruleId);
                                    }
                                  }
                                }}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-[#2A2623] text-[10px] font-bold shadow-[1px_1px_0px_#2A2623] cursor-pointer whitespace-nowrap ${
                                  isRule
                                    ? 'bg-[#FDECE8] text-[#2A2623]'
                                    : edge.isCustomDefault
                                      ? 'bg-[#F6D97A] text-[#2A2623]'
                                      : 'bg-[#FFFDF9] text-[#6E655E]'
                                }`}
                              >
                                <span className="truncate max-w-[115px]">
                                  {edge.conditionLabel}
                                </span>
                                {showAnalyticsOverlay &&
                                  flowOverlay?.edgeTraversals[edge.id] && (
                                    <span
                                      data-testid={`flow-edge-traffic-${edge.id}`}
                                      className="px-1 py-px rounded bg-[#2A2623]/10 font-mono text-[9px] text-[#2A2623] tabular-nums"
                                      title={`${flowOverlay.edgeTraversals[edge.id].count} traversals (${flowOverlay.edgeTraversals[edge.id].percentageOfSource}% of source exits)`}
                                    >
                                      {flowOverlay.edgeTraversals[edge.id].count} ·{' '}
                                      {
                                        flowOverlay.edgeTraversals[edge.id]
                                          .percentageOfSource
                                      }
                                      %
                                    </span>
                                  )}
                                {(isRule || edge.isCustomDefault) && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDisconnectEdge(
                                        edge.id,
                                        edge.conditionLabel
                                      );
                                    }}
                                    aria-label={`Disconnect ${edge.conditionLabel}`}
                                    title="Remove branch connection"
                                    className="ml-0.5 rounded-full hover:bg-[#2A2623] hover:text-white p-0.5 transition-colors cursor-pointer"
                                  >
                                    <X className="w-2.5 h-2.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </foreignObject>
                        </g>
                      );
                    })}
                    {activeConnection && (
                      <path
                        d={`M ${activeConnection.startX} ${activeConnection.startY} C ${
                          activeConnection.startX + 90
                        } ${activeConnection.startY}, ${
                          activeConnection.currentX - 90
                        } ${activeConnection.currentY}, ${
                          activeConnection.currentX
                        } ${activeConnection.currentY}`}
                        fill="none"
                        stroke="#E86D52"
                        strokeWidth={3}
                        strokeDasharray="5 4"
                        markerEnd="url(#arrow-rule-active)"
                      />
                    )}
                    {pendingDropMenu && (
                      <path
                        d={`M ${pendingDropMenu.startX} ${pendingDropMenu.startY} C ${
                          pendingDropMenu.startX + 85
                        } ${pendingDropMenu.startY}, ${
                          pendingDropMenu.menuX - 85
                        } ${pendingDropMenu.menuY + 28}, ${
                          pendingDropMenu.menuX
                        } ${pendingDropMenu.menuY + 28}`}
                        fill="none"
                        stroke="#E86D52"
                        strokeWidth={3}
                        strokeDasharray="5 4"
                        markerEnd="url(#arrow-rule-active)"
                      />
                    )}
                  </svg>
                  {derivedGraph.nodes.map((rawNode) => {
                    const node = nodeMap.get(rawNode.id) || rawNode;
                    const isSelected = selectedNodeId === node.id;

                    const activeWireSource =
                      activeConnection || pendingDropMenu;

                    // Determine if this node is a valid target for an active connection or open drop menu
                    const connectionValidation = activeWireSource
                      ? validateFlowConnection(
                          form,
                          activeWireSource.sourceNodeId,
                          activeWireSource.sourceHandleId,
                          node.id
                        )
                      : null;

                    const isHoveredTarget =
                      activeConnection?.hoveredTargetId === node.id;

                    return (
                      <div
                        key={node.id}
                        data-flow-node-id={node.id}
                        data-testid={`flow-canvas-node-${node.id}`}
                        style={{
                          transform: `translate(${node.position.x}px, ${node.position.y}px)`,
                          width: `${NODE_WIDTH}px`,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (
                            activeWireSource &&
                            activeWireSource.sourceNodeId !== node.id
                          ) {
                            completeFlowConnection(
                              activeWireSource.sourceNodeId,
                              activeWireSource.sourceHandleId,
                              node.id
                            );
                            setActiveConnection(null);
                            setPendingDropMenu(null);
                            return;
                          }
                          setSelectedNodeId(node.id);
                        }}
                        className={`absolute top-0 left-0 pointer-events-auto rounded-2xl border-2 transition-shadow ${
                          node.kind === 'welcome'
                            ? isSelected
                              ? 'bg-[#FFF9EB] border-[#2A2623] shadow-[5px_5px_0px_#E86D52]'
                              : 'bg-[#FAF6F0] border-[#2A2623] shadow-[3px_3px_0px_#2A2623]'
                            : node.kind === 'completion'
                              ? isSelected
                                ? 'bg-[#C5DFC9] border-[#2A2623] shadow-[5px_5px_0px_#E86D52]'
                                : 'bg-[#C5DFC9] border-[#2A2623] shadow-[3px_3px_0px_#2A2623]'
                              : isSelected
                                ? 'bg-[#FFF9EB] border-[#2A2623] shadow-[5px_5px_0px_#E86D52]'
                                : node.isUnreachable
                                  ? 'bg-[#FDECE8] border-[#D4573B] shadow-[3px_3px_0px_#D4573B]'
                                  : node.isOnActiveSimulatedPath
                                    ? 'bg-[#FFFDF9] border-[#2A2623] shadow-[3px_3px_0px_#2A2623]'
                                    : 'bg-[#FAF6F0] border-[#2A2623]/50 opacity-80'
                        } ${
                          isHoveredTarget && connectionValidation?.valid
                            ? 'ring-4 ring-[#E86D52]'
                            : ''
                        }`}
                      >
                        {node.kind !== 'welcome' && (
                          <button
                            type="button"
                            data-testid={`flow-target-port-${node.id}`}
                            aria-label={`Connect branch into ${node.title}`}
                            title={
                              activeWireSource
                                ? connectionValidation?.valid
                                  ? `Connect to ${node.title}`
                                  : connectionValidation?.reason
                                : `Target input port for ${node.title}`
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              if (activeWireSource) {
                                completeFlowConnection(
                                  activeWireSource.sourceNodeId,
                                  activeWireSource.sourceHandleId,
                                  node.id
                                );
                                setActiveConnection(null);
                                setPendingDropMenu(null);
                              }
                            }}
                            className={`absolute -left-3 top-[42px] w-5 h-5 rounded-full border-2 border-[#2A2623] flex items-center justify-center transition-transform cursor-pointer ${
                              activeWireSource
                                ? connectionValidation?.valid
                                  ? 'bg-[#F6D97A] scale-125 animate-pulse'
                                  : 'bg-[#FDECE8] opacity-50 cursor-not-allowed'
                                : 'bg-[#FFFDF9] hover:scale-110'
                            }`}
                          >
                            <span className="w-2 h-2 rounded-full bg-[#2A2623]" />
                          </button>
                        )}
                        <div
                          onPointerDown={(e) => {
                            if (
                              !e.isPrimary || e.button !== 0 ||
                              activeConnection ||
                              (e.target as HTMLElement).closest(
                                '[data-port-handle]'
                              ) ||
                              (e.target as HTMLElement).closest(
                                '[data-node-action]'
                              )
                            ) {
                              return;
                            }
                            e.stopPropagation();
                            setSelectedNodeId(node.id);
                            setDraggingNode({
                              nodeId: node.id,
                              startClientX: e.clientX,
                              startClientY: e.clientY,
                              originX: node.position.x,
                              originY: node.position.y,
                              currentX: node.position.x,
                              currentY: node.position.y,
                            });
                          }}
                          className="p-3.5 cursor-move"
                        >
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-1.5">
                              {node.kind === 'welcome' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#F6D97A] border border-[#2A2623] text-[10px] font-bold text-[#2A2623]">
                                  <Sparkles className="w-3 h-3 text-[#E86D52]" />
                                  START
                                </span>
                              )}
                              {node.kind === 'completion' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#FFFDF9] border border-[#2A2623] text-[10px] font-bold text-[#2A2623]">
                                  <CheckCircle2 className="w-3 h-3 text-[#2A2623]" />
                                  END
                                </span>
                              )}
                              {node.kind === 'question' &&
                                node.questionIndex !== undefined &&
                                node.questionType && (
                                  <>
                                    <span
                                      className="px-2 py-0.5 rounded-md border border-[#2A2623] font-mono text-[11px] font-bold text-[#2A2623] tabular-nums"
                                      style={{
                                        backgroundColor:
                                          QUESTION_TYPE_META[node.questionType]
                                            .badgeBg,
                                      }}
                                    >
                                      {String(node.questionIndex + 1).padStart(
                                        2,
                                        '0'
                                      )}
                                    </span>
                                    <span className="text-[11px] font-semibold text-[#6E655E]">
                                      {
                                        QUESTION_TYPE_META[node.questionType]
                                          .shortLabel
                                      }
                                    </span>
                                  </>
                                )}
                            </div>

                            <div className="flex items-center gap-1">
                              {showAnalyticsOverlay && flowOverlay && (
                                <span
                                  data-testid={`flow-node-visits-${node.id}`}
                                  title="Aggregated visits across tracked sessions and submissions"
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#EBF3FA] border border-[#2A2623] font-mono text-[10px] font-bold text-[#2A2623] tabular-nums"
                                >
                                  {flowOverlay.nodeVisits[node.id] ?? 0}v
                                </span>
                              )}
                              {node.branchRuleCount > 0 && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#FDECE8] border border-[#2A2623] font-mono text-[10px] font-bold text-[#D4573B]">
                                  <GitBranch className="w-2.5 h-2.5" />
                                  {node.branchRuleCount}
                                </span>
                              )}
                              {node.kind === 'question' &&
                                node.questionIndex !== undefined && (
                                  <div
                                    data-node-action="true"
                                    className="flex items-center gap-0.5"
                                  >
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const qObj =
                                          form.questions[node.questionIndex!];
                                        if (qObj) {
                                          handleDuplicateQuestion(
                                            qObj,
                                            node.questionIndex!
                                          );
                                        }
                                      }}
                                      aria-label={`Duplicate question ${node.questionIndex + 1}`}
                                      title="Duplicate question"
                                      className="p-1 rounded hover:bg-[#EFE9DE] text-[#6E655E] hover:text-[#2A2623] cursor-pointer"
                                    >
                                      <Copy className="w-3 h-3" />
                                    </button>
                                    {form.questions.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteQuestion(node.id);
                                        }}
                                        aria-label={`Delete question ${node.questionIndex + 1}`}
                                        title="Delete question"
                                        className="p-1 rounded hover:bg-[#FDECE8] text-[#6E655E] hover:text-[#D4573B] cursor-pointer"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                )}
                              <GripHorizontal className="w-3.5 h-3.5 text-[#6E655E]" />
                            </div>
                          </div>

                          <p className="font-display text-sm font-bold text-[#2A2623] line-clamp-2 leading-snug">
                            {node.title}
                          </p>
                          {node.isUnreachable && (
                            <p className="text-[10px] font-bold text-[#D4573B] mt-1">
                              ⚠ Unreachable from Q1
                            </p>
                          )}
                        </div>
                        {node.outputHandles.length > 0 && (
                          <div className="border-t border-[#2A2623]/15 bg-[#FAF6F0]/70 rounded-b-2xl px-3 py-2 space-y-1.5">
                            {node.outputHandles.map((handle, hIdx) => {
                              const isNewRuleHandle =
                                handle.kind === 'new-rule';
                              const isRuleHandle = handle.kind === 'rule';

                              return (
                                <div
                                  key={handle.id}
                                  className="flex items-center justify-between gap-2 text-[11px] h-[26px]"
                                >
                                  {node.kind === 'question' ? (
                                    <button
                                      type="button"
                                      data-port-handle="true"
                                      data-testid={
                                        isNewRuleHandle
                                          ? `flow-add-branch-btn-${node.id}`
                                          : `flow-handle-label-${node.id}-${handle.id}`
                                      }
                                      onPointerDown={(e) =>
                                        initiateHandleConnection(
                                          e,
                                          node,
                                          handle,
                                          hIdx
                                        )
                                      }
                                      title={
                                        isNewRuleHandle
                                          ? 'Click or drag to add a branch or create the next question'
                                          : 'Click or drag to retarget this connection'
                                      }
                                      className={`truncate text-left transition-colors cursor-pointer rounded px-1.5 py-0.5 -ml-1.5 ${
                                        isNewRuleHandle
                                          ? 'font-bold text-[#D4573B] hover:bg-[#FDECE8] border border-transparent hover:border-[#E86D52]/40'
                                          : isRuleHandle
                                            ? 'font-semibold text-[#2A2623] hover:bg-[#FFF9EB]'
                                            : 'text-[#6E655E] hover:text-[#2A2623] hover:bg-[#EFE9DE]/60'
                                      }`}
                                    >
                                      {handle.label}
                                    </button>
                                  ) : (
                                    <span className="truncate text-[#6E655E]">
                                      {handle.label}
                                    </span>
                                  )}
                                  {node.kind === 'question' && (
                                    <button
                                      type="button"
                                      data-port-handle="true"
                                      data-testid={`flow-source-port-${node.id}-${handle.id}`}
                                      aria-label={`Connect ${handle.label} from question ${(node.questionIndex ?? 0) + 1}`}
                                      title="Drag a connection (or click) to add a question or connect to an existing step"
                                      onPointerDown={(e) =>
                                        initiateHandleConnection(
                                          e,
                                          node,
                                          handle,
                                          hIdx
                                        )
                                      }
                                      className={`-mr-5 w-4 h-4 rounded-full border-2 border-[#2A2623] flex items-center justify-center transition-transform hover:scale-125 cursor-crosshair shrink-0 ${
                                        isNewRuleHandle
                                          ? 'bg-[#E86D52] text-white'
                                          : isRuleHandle
                                            ? 'bg-[#F6D97A]'
                                            : 'bg-[#FFFDF9]'
                                      }`}
                                    >
                                      <span className="w-1.5 h-1.5 rounded-full bg-[#2A2623]" />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {pendingDropMenu && (
                    <div
                      data-flow-drop-menu="true"
                      data-testid="canvas-branch-drop-menu"
                      style={{
                        transform: `translate(${pendingDropMenu.menuX}px, ${pendingDropMenu.menuY}px)`,
                      }}
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="absolute top-0 left-0 z-50 w-[300px] pointer-events-auto bg-[#FFFDF9] border-2 border-[#2A2623] rounded-2xl p-3.5 shadow-[5px_5px_0px_#2A2623] space-y-3"
                    >
                      <span
                        aria-hidden="true"
                        className="absolute -left-2.5 top-[22px] w-4 h-4 rounded-full bg-[#E86D52] border-2 border-[#2A2623]"
                      />

                      <div className="flex items-start justify-between gap-2 border-b border-[#2A2623]/15 pb-2">
                        <div>
                          <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#E86D52]">
                            {pendingDropMenu.sourceLabel}
                          </p>
                          <h4 className="font-display text-xs font-bold text-[#2A2623]">
                            What should happen next?
                          </h4>
                        </div>
                        <button
                          type="button"
                          data-testid="close-branch-drop-menu"
                          onClick={() => setPendingDropMenu(null)}
                          aria-label="Close branch menu"
                          className="p-1 rounded-lg text-[#6E655E] hover:text-[#2A2623] hover:bg-[#EFE9DE] cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-bold text-[#2A2623]">
                          Create & connect a new question here:
                        </p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {ALL_QUESTION_TYPES.map((t) => {
                            const info = QUESTION_TYPE_META[t];
                            return (
                              <button
                                key={t}
                                type="button"
                                data-testid={`drop-menu-create-${t}`}
                                onClick={() =>
                                  handleCreateQuestionOnCanvas(t, {
                                    position: {
                                      x: pendingDropMenu.dropX,
                                      y: pendingDropMenu.dropY,
                                    },
                                    sourceQuestionId:
                                      pendingDropMenu.sourceNodeId,
                                    sourceHandleId:
                                      pendingDropMenu.sourceHandleId,
                                  })
                                }
                                className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl bg-[#FAF6F0] border border-[#2A2623] hover:bg-[#F6D97A] text-left text-[11px] font-semibold text-[#2A2623] transition-colors cursor-pointer"
                              >
                                <span
                                  className="w-2.5 h-2.5 rounded-full border border-[#2A2623] shrink-0"
                                  style={{ backgroundColor: info.badgeBg }}
                                />
                                <span className="truncate">{info.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="space-y-1.5 pt-2 border-t border-[#2A2623]/15">
                        <p className="text-[11px] font-bold text-[#6E655E]">
                          Or connect to an existing step:
                        </p>
                        <div className="max-h-36 overflow-y-auto space-y-1 pr-0.5">
                          {form.questions
                            .filter(
                              (q) => q.id !== pendingDropMenu.sourceNodeId
                            )
                            .map((q) => {
                              const qIdx = form.questions.findIndex(
                                (item) => item.id === q.id
                              );
                              return (
                                <button
                                  key={q.id}
                                  type="button"
                                  data-testid={`drop-menu-connect-${q.id}`}
                                  onClick={() =>
                                    completeFlowConnection(
                                      pendingDropMenu.sourceNodeId,
                                      pendingDropMenu.sourceHandleId,
                                      q.id
                                    )
                                  }
                                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-[#FAF6F0] border border-[#2A2623]/40 hover:border-[#2A2623] hover:bg-[#FFF9EB] text-left text-[11px] font-semibold text-[#2A2623] cursor-pointer"
                                >
                                  <span className="font-mono font-bold text-[#E86D52] shrink-0">
                                    {String(qIdx + 1).padStart(2, '0')}
                                  </span>
                                  <span className="truncate">{q.title}</span>
                                </button>
                              );
                            })}
                          <button
                            type="button"
                            data-testid="drop-menu-connect-completion"
                            onClick={() =>
                              completeFlowConnection(
                                pendingDropMenu.sourceNodeId,
                                pendingDropMenu.sourceHandleId,
                                'completion'
                              )
                            }
                            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-[#C5DFC9]/60 border border-[#2A2623] hover:bg-[#C5DFC9] text-left text-[11px] font-bold text-[#2A2623] cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">
                              Completion Screen (Finish Form)
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* =========================================================
               MODE 2: EXISTING RULE-BASED FLOW EDITOR (PRESERVED)
               ========================================================= */
            <div
              data-testid="rule-flow-editor-container"
              className="bg-[#FFFDF9] border-2 border-[#2A2623] rounded-3xl p-6 shadow-[4px_4px_0px_#2A2623] space-y-3"
            >
              <div
                onClick={() => setSelectedNodeId('welcome')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedNodeId('welcome');
                  }
                }}
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl border-2 max-w-md cursor-pointer transition-all ${
                  selectedNodeId === 'welcome'
                    ? 'bg-[#FFF9EB] border-[#2A2623] shadow-[4px_4px_0px_#2A2623]'
                    : 'bg-[#FAF6F0] border-[#2A2623]'
                }`}
              >
                <Sparkles className="w-4 h-4 text-[#E86D52] shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#2A2623] truncate">
                    Start · {form.welcomeScreen.title}
                  </p>
                  <p className="text-[11px] text-[#6E655E]">
                    {form.welcomeScreen.enabled
                      ? 'Respondents begin here before Question 01'
                      : 'Welcome screen hidden — starts directly at Question 01'}
                  </p>
                </div>
              </div>
              <div
                className="pl-7 flex items-center gap-2 text-xs text-[#6E655E]"
                aria-hidden="true"
              >
                <div className="w-0.5 h-5 bg-[#2A2623]" />
              </div>
              {form.questions.map((q, idx) => {
                const isSelected = selectedQuestion?.id === q.id;
                const isOnSimulatedPath = activeSequenceSet.has(q.id);
                const meta = QUESTION_TYPE_META[q.type];
                const rules = q.logicRules || [];

                return (
                  <React.Fragment key={q.id}>
                    <div
                      onClick={() => setSelectedNodeId(q.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedNodeId(q.id);
                        }
                      }}
                      className={`rounded-2xl border-2 p-4 transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#FFF9EB] border-[#2A2623] shadow-[4px_4px_0px_#2A2623]'
                          : isOnSimulatedPath
                            ? 'bg-[#FFFDF9] border-[#2A2623] shadow-[2px_2px_0px_#2A2623]'
                            : 'bg-[#FAF6F0] border-[#2A2623]/40 opacity-65'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="px-2 py-0.5 rounded-lg border-2 border-[#2A2623] font-mono text-xs font-bold text-[#2A2623] shrink-0 tabular-nums"
                            style={{ backgroundColor: meta.badgeBg }}
                          >
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                          <div className="min-w-0">
                            <h3 className="font-display text-base font-bold text-[#2A2623] truncate">
                              {q.title}
                            </h3>
                            <p className="text-xs text-[#6E655E]">
                              {meta.label}
                              {isOnSimulatedPath
                                ? ' · Active on simulated path'
                                : ' · Skipped in current simulation'}
                            </p>
                          </div>
                        </div>

                        <PaperButton
                          variant={isSelected ? 'coral' : 'ivory'}
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedNodeId(q.id);
                          }}
                        >
                          <GitBranch className="w-3.5 h-3.5" />
                          <span>
                            {rules.length === 0
                              ? 'Add Branch'
                              : `${rules.length} ${rules.length === 1 ? 'Rule' : 'Rules'}`}
                          </span>
                        </PaperButton>
                      </div>
                      <div className="mt-3 pt-3 border-t border-[#2A2623]/15 space-y-1.5">
                        {rules.map((rule) => (
                          <div
                            key={rule.id}
                            className="flex flex-wrap items-center gap-1.5 text-xs bg-[#FDECE8] border border-[#2A2623] rounded-xl px-3 py-1.5 font-medium text-[#2A2623]"
                          >
                            <CornerDownRight className="w-3.5 h-3.5 text-[#E86D52] shrink-0" />
                            <span>
                              If answer{' '}
                              <strong>{OPERATOR_LABELS[rule.operator]}</strong>{' '}
                              {rule.operator !== 'is_answered' && (
                                <strong className="underline decoration-[#E86D52]">
                                  “{rule.value || '…'}”
                                </strong>
                              )}
                            </span>
                            <ArrowRight className="w-3.5 h-3.5 text-[#2A2623] shrink-0" />
                            <span className="font-bold">
                              Jump to {getTargetLabel(rule.targetId, idx)}
                            </span>
                          </div>
                        ))}
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#6E655E] px-2 py-1">
                          <ArrowRight className="w-3.5 h-3.5 text-[#2A2623] shrink-0" />
                          <span>
                            {rules.length > 0
                              ? 'Otherwise (default path):'
                              : 'Default path:'}{' '}
                            <strong className="text-[#2A2623]">
                              {getTargetLabel(q.defaultNextId, idx)}
                            </strong>
                          </span>
                        </div>
                      </div>
                    </div>
                    <div
                      className="pl-7 flex items-center gap-2"
                      aria-hidden="true"
                    >
                      <div className="w-0.5 h-5 bg-[#2A2623]" />
                    </div>
                  </React.Fragment>
                );
              })}
              <div
                onClick={() => setSelectedNodeId('completion')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedNodeId('completion');
                  }
                }}
                className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 max-w-md cursor-pointer transition-all ${
                  selectedNodeId === 'completion'
                    ? 'bg-[#C5DFC9] border-[#2A2623] shadow-[4px_4px_0px_#E86D52]'
                    : 'bg-[#C5DFC9] border-[#2A2623] shadow-[2px_2px_0px_#2A2623]'
                }`}
              >
                <CheckCircle2 className="w-5 h-5 text-[#2A2623] shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#2A2623] truncate">
                    Completion Screen · {form.completionScreen.title}
                  </p>
                  <p className="text-[11px] text-[#2A2623]/80">
                    Ends the form and confirms submission
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>
        <aside
          aria-label="Branching rule editor"
          data-testid="canvas-inspector-drawer"
          className="lg:col-span-5 xl:col-span-4 bg-[#FFFDF9] border-2 border-[#2A2623] rounded-2xl p-4 shadow-[3px_3px_0px_#2A2623] space-y-4 lg:sticky lg:top-28 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto"
        >
          <div className="border-b border-[#2A2623]/15 pb-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-[#E86D52] flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>
                  {selectedNodeId === 'welcome'
                    ? 'Opening Screen'
                    : selectedNodeId === 'completion'
                      ? 'Ending Screen'
                      : `Question ${String(selectedQuestionIndex + 1).padStart(2, '0')}`}
                </span>
              </span>
              {selectedQuestion && (
                <span className="text-xs text-[#6E655E]">
                  {QUESTION_TYPE_META[selectedQuestion.type].label}
                </span>
              )}
              {onOpenBuilder && <button type="button" onClick={onOpenBuilder} className="text-xs font-semibold underline underline-offset-4">Edit in Build</button>}
            </div>
            <div>
              <label
                htmlFor="inspector-flow-question-select"
                className="sr-only"
              >
                Select question to configure branching
              </label>
              <select
                id="inspector-flow-question-select"
                value={
                  selectedNodeId === 'welcome' ||
                  selectedNodeId === 'completion'
                    ? selectedNodeId
                    : selectedQuestion?.id || ''
                }
                onChange={(e) => {
                  setSelectedNodeId(e.target.value);
                  setHighlightedRuleId(null);
                }}
                className="w-full px-3 py-2 font-display text-sm font-bold text-[#2A2623] bg-[#FAF6F0] border-2 border-[#2A2623] rounded-xl focus:outline-none cursor-pointer"
              >
                <option value="welcome">
                  Start · {form.welcomeScreen.title || 'Welcome Screen'}
                </option>
                {form.questions.map((qItem, idx) => (
                  <option key={qItem.id} value={qItem.id}>
                    {String(idx + 1).padStart(2, '0')} · {qItem.title}
                  </option>
                ))}
                <option value="completion">
                  End · {form.completionScreen.title || 'Completion Screen'}
                </option>
              </select>
            </div>
          </div>

          {/* =========================================================
             WELCOME SCREEN INSPECTOR (when Welcome node is clicked on canvas)
             ========================================================= */}
          {selectedNodeId === 'welcome' && (
            <div className="space-y-4">
              <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#FAF6F0] border-2 border-[#2A2623] cursor-pointer">
                <div>
                  <p className="text-xs font-bold text-[#2A2623]">
                    Show Welcome Screen
                  </p>
                  <p className="text-[11px] text-[#6E655E]">
                    Greet respondents before Question 1
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={form.welcomeScreen.enabled}
                  onChange={(e) =>
                    onUpdateForm((prev) => ({
                      ...prev,
                      updatedAt: new Date().toISOString(),
                      welcomeScreen: {
                        ...prev.welcomeScreen,
                        enabled: e.target.checked,
                      },
                    }))
                  }
                  className="w-4 h-4 accent-[#E86D52]"
                />
              </label>

              <div>
                <label
                  htmlFor="canvas-welcome-title"
                  className="block text-xs font-bold text-[#2A2623] mb-1"
                >
                  Welcome Headline
                </label>
                <input
                  id="canvas-welcome-title"
                  type="text"
                  value={form.welcomeScreen.title}
                  onChange={(e) =>
                    onUpdateForm(
                      (prev) => ({
                        ...prev,
                        updatedAt: new Date().toISOString(),
                        welcomeScreen: {
                          ...prev.welcomeScreen,
                          title: e.target.value,
                        },
                      }),
                      {
                        label: 'Edit welcome title',
                        coalesceKey: 'welcome-title',
                      }
                    )
                  }
                  className="w-full px-3 py-2 text-sm font-semibold bg-[#FAF6F0] border-2 border-[#2A2623] rounded-xl focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="canvas-welcome-desc"
                  className="block text-xs font-bold text-[#2A2623] mb-1"
                >
                  Intro Description
                </label>
                <textarea
                  id="canvas-welcome-desc"
                  rows={3}
                  value={form.welcomeScreen.description}
                  onChange={(e) =>
                    onUpdateForm(
                      (prev) => ({
                        ...prev,
                        updatedAt: new Date().toISOString(),
                        welcomeScreen: {
                          ...prev.welcomeScreen,
                          description: e.target.value,
                        },
                      }),
                      {
                        label: 'Edit welcome description',
                        coalesceKey: 'welcome-desc',
                      }
                    )
                  }
                  className="w-full px-3 py-2 text-xs bg-[#FAF6F0] border-2 border-[#2A2623] rounded-xl focus:outline-none resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="canvas-welcome-btn"
                    className="block text-xs font-bold text-[#2A2623] mb-1"
                  >
                    Button Label
                  </label>
                  <input
                    id="canvas-welcome-btn"
                    type="text"
                    value={form.welcomeScreen.buttonText}
                    onChange={(e) =>
                      onUpdateForm(
                        (prev) => ({
                          ...prev,
                          updatedAt: new Date().toISOString(),
                          welcomeScreen: {
                            ...prev.welcomeScreen,
                            buttonText: e.target.value,
                          },
                        }),
                        {
                          label: 'Edit welcome button',
                          coalesceKey: 'welcome-btn',
                        }
                      )
                    }
                    className="w-full px-3 py-2 text-xs font-semibold bg-[#FAF6F0] border-2 border-[#2A2623] rounded-xl focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="canvas-welcome-time"
                    className="block text-xs font-bold text-[#2A2623] mb-1"
                  >
                    Time Estimate
                  </label>
                  <input
                    id="canvas-welcome-time"
                    type="text"
                    value={form.welcomeScreen.timeEstimate}
                    onChange={(e) =>
                      onUpdateForm(
                        (prev) => ({
                          ...prev,
                          updatedAt: new Date().toISOString(),
                          welcomeScreen: {
                            ...prev.welcomeScreen,
                            timeEstimate: e.target.value,
                          },
                        }),
                        {
                          label: 'Edit time estimate',
                          coalesceKey: 'welcome-time',
                        }
                      )
                    }
                    className="w-full px-3 py-2 text-xs font-semibold bg-[#FAF6F0] border-2 border-[#2A2623] rounded-xl focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* =========================================================
             COMPLETION SCREEN INSPECTOR (when Completion node is clicked on canvas)
             ========================================================= */}
          {selectedNodeId === 'completion' && (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="canvas-comp-title"
                  className="block text-xs font-bold text-[#2A2623] mb-1"
                >
                  Thank-You Headline
                </label>
                <input
                  id="canvas-comp-title"
                  type="text"
                  value={form.completionScreen.title}
                  onChange={(e) =>
                    onUpdateForm(
                      (prev) => ({
                        ...prev,
                        updatedAt: new Date().toISOString(),
                        completionScreen: {
                          ...prev.completionScreen,
                          title: e.target.value,
                        },
                      }),
                      {
                        label: 'Edit completion title',
                        coalesceKey: 'comp-title',
                      }
                    )
                  }
                  className="w-full px-3 py-2 text-sm font-semibold bg-[#FAF6F0] border-2 border-[#2A2623] rounded-xl focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="canvas-comp-desc"
                  className="block text-xs font-bold text-[#2A2623] mb-1"
                >
                  Closing Note
                </label>
                <textarea
                  id="canvas-comp-desc"
                  rows={3}
                  value={form.completionScreen.description}
                  onChange={(e) =>
                    onUpdateForm(
                      (prev) => ({
                        ...prev,
                        updatedAt: new Date().toISOString(),
                        completionScreen: {
                          ...prev.completionScreen,
                          description: e.target.value,
                        },
                      }),
                      {
                        label: 'Edit completion description',
                        coalesceKey: 'comp-desc',
                      }
                    )
                  }
                  className="w-full px-3 py-2 text-xs bg-[#FAF6F0] border-2 border-[#2A2623] rounded-xl focus:outline-none resize-none"
                />
              </div>

              <div>
                <label
                  htmlFor="canvas-comp-btn"
                  className="block text-xs font-bold text-[#2A2623] mb-1"
                >
                  Restart Button Label
                </label>
                <input
                  id="canvas-comp-btn"
                  type="text"
                  value={form.completionScreen.buttonText}
                  onChange={(e) =>
                    onUpdateForm(
                      (prev) => ({
                        ...prev,
                        updatedAt: new Date().toISOString(),
                        completionScreen: {
                          ...prev.completionScreen,
                          buttonText: e.target.value,
                        },
                      }),
                      {
                        label: 'Edit completion button',
                        coalesceKey: 'comp-btn',
                      }
                    )
                  }
                  className="w-full px-3 py-2 text-xs font-semibold bg-[#FAF6F0] border-2 border-[#2A2623] rounded-xl focus:outline-none"
                />
              </div>

              <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#FAF6F0] border-2 border-[#2A2623] cursor-pointer">
                <div>
                  <p className="text-xs font-bold text-[#2A2623]">
                    Show Answer Receipt
                  </p>
                  <p className="text-[11px] text-[#6E655E]">
                    Display a stamped summary of submitted answers
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={form.completionScreen.showAnswerReceipt}
                  onChange={(e) =>
                    onUpdateForm(
                      (prev) => ({
                        ...prev,
                        updatedAt: new Date().toISOString(),
                        completionScreen: {
                          ...prev.completionScreen,
                          showAnswerReceipt: e.target.checked,
                        },
                      }),
                      { label: 'Toggle answer receipt' }
                    )
                  }
                  className="w-4 h-4 accent-[#E86D52]"
                />
              </label>
            </div>
          )}

          {/* =========================================================
             QUESTION CONTENT & BRANCHING INSPECTOR (when a Question node is selected)
             ========================================================= */}
          {selectedQuestion &&
            selectedNodeId !== 'welcome' &&
            selectedNodeId !== 'completion' && (
              <>
                <div className="rounded-2xl border-2 border-[#2A2623] bg-[#FAF6F0] overflow-hidden">
                  <button
                    type="button"
                    data-testid="toggle-question-content-editor"
                    onClick={() => setIsQuestionContentExpanded((v) => !v)}
                    className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-bold text-[#2A2623] hover:bg-[#EFE9DE]/60 cursor-pointer"
                  >
                    <span>Question Content & Options</span>
                    {isQuestionContentExpanded ? (
                      <ChevronUp className="w-4 h-4 text-[#6E655E]" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-[#6E655E]" />
                    )}
                  </button>

                  {isQuestionContentExpanded && (
                    <div className="p-3.5 pt-2 border-t border-[#2A2623]/15 space-y-3 bg-[#FFFDF9]">
                      <div>
                        <label
                          htmlFor="canvas-inspector-q-title"
                          className="block text-[11px] font-bold text-[#6E655E] mb-1"
                        >
                          Question Prompt
                        </label>
                        <input
                          id="canvas-inspector-q-title"
                          data-testid="canvas-inspector-q-title"
                          type="text"
                          value={selectedQuestion.title}
                          onChange={(e) =>
                            handleUpdateQuestion(selectedQuestion.id, {
                              title: e.target.value,
                            })
                          }
                          className="w-full px-3 py-1.5 text-xs font-semibold bg-[#FAF6F0] border-2 border-[#2A2623] rounded-xl focus:outline-none"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label
                            htmlFor="canvas-inspector-q-type"
                            className="block text-[11px] font-bold text-[#6E655E] mb-1"
                          >
                            Question Type
                          </label>
                          <select
                            id="canvas-inspector-q-type"
                            data-testid="canvas-inspector-q-type"
                            value={selectedQuestion.type}
                            onChange={(e) =>
                              handleUpdateQuestion(selectedQuestion.id, {
                                type: e.target.value as QuestionType,
                              })
                            }
                            className="w-full px-2.5 py-1.5 text-xs font-semibold bg-[#FAF6F0] border-2 border-[#2A2623] rounded-xl focus:outline-none cursor-pointer"
                          >
                            {ALL_QUESTION_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {QUESTION_TYPE_META[t].label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-end">
                          <label className="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-[#FAF6F0] border-2 border-[#2A2623] cursor-pointer">
                            <span className="text-xs font-bold text-[#2A2623]">
                              Required
                            </span>
                            <input
                              type="checkbox"
                              data-testid="canvas-inspector-q-required"
                              checked={selectedQuestion.required}
                              onChange={(e) =>
                                handleUpdateQuestion(selectedQuestion.id, {
                                  required: e.target.checked,
                                })
                              }
                              className="w-4 h-4 accent-[#E86D52]"
                            />
                          </label>
                        </div>
                      </div>
                      <div>
                        <label
                          htmlFor="canvas-inspector-q-desc"
                          className="block text-[11px] font-bold text-[#6E655E] mb-1"
                        >
                          Description / Helper Note
                        </label>
                        <textarea
                          id="canvas-inspector-q-desc"
                          data-testid="canvas-inspector-q-desc"
                          rows={2}
                          value={selectedQuestion.description}
                          onChange={(e) =>
                            handleUpdateQuestion(selectedQuestion.id, {
                              description: e.target.value,
                            })
                          }
                          placeholder="Optional guidance for respondents..."
                          className="w-full px-3 py-1.5 text-xs bg-[#FAF6F0] border-2 border-[#2A2623] rounded-xl focus:outline-none resize-none"
                        />
                      </div>
                      {(selectedQuestion.type === 'short_text' ||
                        selectedQuestion.type === 'long_text' ||
                        selectedQuestion.type === 'email' ||
                        selectedQuestion.type === 'number') && (
                        <div>
                          <label
                            htmlFor="canvas-inspector-q-placeholder"
                            className="block text-[11px] font-bold text-[#6E655E] mb-1"
                          >
                            Input Placeholder
                          </label>
                          <input
                            id="canvas-inspector-q-placeholder"
                            type="text"
                            value={selectedQuestion.placeholder || ''}
                            onChange={(e) =>
                              handleUpdateQuestion(selectedQuestion.id, {
                                placeholder: e.target.value,
                              })
                            }
                            className="w-full px-3 py-1.5 text-xs bg-[#FAF6F0] border-2 border-[#2A2623] rounded-xl focus:outline-none"
                          />
                        </div>
                      )}
                      {selectedQuestion.type === 'rating' && (
                        <div>
                          <span className="block text-[11px] font-bold text-[#6E655E] mb-1">
                            Rating Scale Maximum
                          </span>
                          <div className="grid grid-cols-2 gap-2">
                            {[5, 10].map((scale) => (
                              <button
                                key={scale}
                                type="button"
                                onClick={() =>
                                  handleUpdateQuestion(selectedQuestion.id, {
                                    maxRating: scale,
                                  })
                                }
                                className={`py-1.5 px-2.5 rounded-xl border-2 border-[#2A2623] text-xs font-bold cursor-pointer ${
                                  (selectedQuestion.maxRating || 5) === scale
                                    ? 'bg-[#F6D97A] text-[#2A2623] shadow-[2px_2px_0px_#2A2623]'
                                    : 'bg-[#FAF6F0] text-[#6E655E]'
                                }`}
                              >
                                1 to {scale} Stars
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {(selectedQuestion.type === 'single_choice' ||
                        selectedQuestion.type === 'multiple_choice' ||
                        selectedQuestion.type === 'dropdown') && (
                        <div className="space-y-2 pt-1 border-t border-[#2A2623]/15">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-[#2A2623]">
                              Choices ({(selectedQuestion.choices || []).length}
                              )
                            </span>
                            <button
                              type="button"
                              data-testid="canvas-inspector-add-choice"
                              onClick={() => {
                                const current = selectedQuestion.choices || [];
                                const nextChoices = [
                                  ...current,
                                  {
                                    id: generateId('opt'),
                                    label: `Option ${current.length + 1}`,
                                  },
                                ];
                                const synced = updateQuestionChoicesAndSyncRules(
                                  selectedQuestion,
                                  nextChoices
                                );
                                handleUpdateQuestion(
                                  selectedQuestion.id,
                                  {
                                    choices: synced.choices,
                                    logicRules: synced.logicRules,
                                  },
                                  { label: 'Add choice' }
                                );
                              }}
                              className="inline-flex items-center gap-1 text-xs font-bold text-[#D4573B] hover:underline cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Add Choice</span>
                            </button>
                          </div>

                          <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                            {(selectedQuestion.choices || []).map(
                              (choice, cIdx) => {
                                const totalChoices = (
                                  selectedQuestion.choices || []
                                ).length;
                                return (
                                  <div
                                    key={choice.id}
                                    className="flex items-center gap-1"
                                  >
                                    <span className="font-mono text-[11px] font-bold text-[#6E655E] w-4 text-center shrink-0">
                                      {String.fromCharCode(65 + cIdx)}
                                    </span>
                                    <input
                                      type="text"
                                      aria-label={`Choice ${cIdx + 1}`}
                                      value={choice.label}
                                      onChange={(e) => {
                                        const updated = (
                                          selectedQuestion.choices || []
                                        ).map((item, i) =>
                                          i === cIdx
                                            ? { ...item, label: e.target.value }
                                            : item
                                        );
                                        const synced =
                                          updateQuestionChoicesAndSyncRules(
                                            selectedQuestion,
                                            updated
                                          );
                                        handleUpdateQuestion(
                                          selectedQuestion.id,
                                          {
                                            choices: synced.choices,
                                            logicRules: synced.logicRules,
                                          },
                                          {
                                            label: 'Edit choice label',
                                            coalesceKey: `choice-label-${choice.id}`,
                                          }
                                        );
                                      }}
                                      className="flex-1 min-w-0 px-2 py-1 text-xs font-medium bg-[#FAF6F0] border border-[#2A2623] rounded-lg focus:outline-none"
                                    />
                                    <button
                                      type="button"
                                      disabled={cIdx === 0}
                                      onClick={() =>
                                        handleReorderChoice(
                                          selectedQuestion,
                                          cIdx,
                                          cIdx - 1
                                        )
                                      }
                                      aria-label={`Move choice ${cIdx + 1} up`}
                                      className="p-1 rounded text-[#6E655E] hover:text-[#2A2623] disabled:opacity-30 cursor-pointer"
                                    >
                                      <ArrowUp className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={cIdx === totalChoices - 1}
                                      onClick={() =>
                                        handleReorderChoice(
                                          selectedQuestion,
                                          cIdx,
                                          cIdx + 1
                                        )
                                      }
                                      aria-label={`Move choice ${cIdx + 1} down`}
                                      className="p-1 rounded text-[#6E655E] hover:text-[#2A2623] disabled:opacity-30 cursor-pointer"
                                    >
                                      <ArrowDown className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={totalChoices <= 1}
                                      onClick={() => {
                                        const filtered = (
                                          selectedQuestion.choices || []
                                        ).filter((_, i) => i !== cIdx);
                                        const synced =
                                          updateQuestionChoicesAndSyncRules(
                                            selectedQuestion,
                                            filtered
                                          );
                                        handleUpdateQuestion(
                                          selectedQuestion.id,
                                          {
                                            choices: synced.choices,
                                            logicRules: synced.logicRules,
                                          },
                                          { label: 'Remove choice' }
                                        );
                                      }}
                                      aria-label={`Remove choice ${choice.label}`}
                                      className="p-1 rounded text-[#6E655E] hover:text-[#D4573B] disabled:opacity-30 cursor-pointer"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                );
                              }
                            )}
                          </div>
                        </div>
                      )}
                      <div className="pt-2 border-t border-[#2A2623]/15 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={selectedQuestionIndex <= 0}
                            onClick={() =>
                              handleMoveQuestion(selectedQuestionIndex, -1)
                            }
                            title="Move earlier in question sequence"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#FAF6F0] border border-[#2A2623] text-[11px] font-bold text-[#2A2623] hover:bg-[#EFE9DE] disabled:opacity-35 cursor-pointer"
                          >
                            <ArrowUp className="w-3 h-3" />
                            <span>Up</span>
                          </button>
                          <button
                            type="button"
                            disabled={
                              selectedQuestionIndex >= form.questions.length - 1
                            }
                            onClick={() =>
                              handleMoveQuestion(selectedQuestionIndex, 1)
                            }
                            title="Move later in question sequence"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#FAF6F0] border border-[#2A2623] text-[11px] font-bold text-[#2A2623] hover:bg-[#EFE9DE] disabled:opacity-35 cursor-pointer"
                          >
                            <ArrowDown className="w-3 h-3" />
                            <span>Down</span>
                          </button>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              handleDuplicateQuestion(
                                selectedQuestion,
                                selectedQuestionIndex
                              )
                            }
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#FAF6F0] border border-[#2A2623] text-[11px] font-bold text-[#2A2623] hover:bg-[#EFE9DE] cursor-pointer"
                          >
                            <Copy className="w-3 h-3" />
                            <span>Duplicate</span>
                          </button>
                          <button
                            type="button"
                            disabled={form.questions.length <= 1}
                            onClick={() =>
                              handleDeleteQuestion(selectedQuestion.id)
                            }
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#FDECE8] border border-[#2A2623] text-[11px] font-bold text-[#D4573B] hover:bg-[#f9d6ce] disabled:opacity-35 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#2A2623]">
                      Conditional Branch Rules (
                      {selectedQuestion.logicRules.length})
                    </span>
                    <PaperButton
                      variant="coral"
                      size="sm"
                      onClick={() => handleAddRule(selectedQuestion)}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Rule</span>
                    </PaperButton>
                  </div>

                  {selectedQuestion.logicRules.length === 0 ? (
                    <div className="p-4 rounded-2xl bg-[#FAF6F0] border-2 border-dashed border-[#2A2623]/30 text-center space-y-2">
                      <p className="text-xs font-semibold text-[#2A2623]">
                        No conditional branches on this question yet.
                      </p>
                      <p className="text-[11px] text-[#6E655E]">
                        Click <strong>Add Rule</strong> above, or click/drag{' '}
                        <strong className="text-[#D4573B]">+ Add branch</strong>{' '}
                        on the Visual Canvas to route respondents or create the
                        next question.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedQuestion.logicRules.map((rule, rIdx) => {
                        const isRuleHighlighted = highlightedRuleId === rule.id;
                        return (
                          <div
                            key={rule.id}
                            className={`p-3.5 rounded-2xl border-2 space-y-3 transition-colors ${
                              isRuleHighlighted
                                ? 'bg-[#FFF9EB] border-[#E86D52]'
                                : 'bg-[#FAF6F0] border-[#2A2623]'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-[#2A2623]">
                                Condition #{rIdx + 1}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  handleDeleteRule(selectedQuestion.id, rule.id)
                                }
                                aria-label={`Delete condition ${rIdx + 1}`}
                                className="p-1 rounded-lg text-[#6E655E] hover:text-[#D4573B] hover:bg-[#FDECE8] cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <div>
                              <label
                                htmlFor={`rule-op-${rule.id}`}
                                className="block text-[11px] font-bold text-[#6E655E] mb-1"
                              >
                                If the answer…
                              </label>
                              <select
                                id={`rule-op-${rule.id}`}
                                value={rule.operator}
                                onChange={(e) =>
                                  handleUpdateRule(
                                    selectedQuestion.id,
                                    rule.id,
                                    {
                                      operator: e.target.value as LogicOperator,
                                    }
                                  )
                                }
                                className="w-full px-3 py-2 text-xs font-semibold bg-[#FFFDF9] border-2 border-[#2A2623] rounded-xl focus:outline-none cursor-pointer"
                              >
                                {(
                                  Object.keys(
                                    OPERATOR_LABELS
                                  ) as LogicOperator[]
                                ).map((op) => (
                                  <option key={op} value={op}>
                                    {OPERATOR_LABELS[op]}
                                  </option>
                                ))}
                              </select>
                            </div>
                            {rule.operator !== 'is_answered' && (
                              <div>
                                <label
                                  htmlFor={`rule-val-${rule.id}`}
                                  className="block text-[11px] font-bold text-[#6E655E] mb-1"
                                >
                                  Target Value
                                </label>
                                {selectedQuestion.type === 'yes_no' ? (
                                  <select
                                    id={`rule-val-${rule.id}`}
                                    value={rule.value}
                                    onChange={(e) =>
                                      handleUpdateRule(
                                        selectedQuestion.id,
                                        rule.id,
                                        {
                                          value: e.target.value,
                                        }
                                      )
                                    }
                                    className="w-full px-3 py-2 text-xs font-semibold bg-[#FFFDF9] border-2 border-[#2A2623] rounded-xl focus:outline-none cursor-pointer"
                                  >
                                    <option value="Yes">Yes</option>
                                    <option value="No">No</option>
                                  </select>
                                ) : selectedQuestion.choices &&
                                  selectedQuestion.choices.length > 0 &&
                                  (rule.operator === 'equals' ||
                                    rule.operator === 'not_equals') ? (
                                  <select
                                    id={`rule-val-${rule.id}`}
                                    value={rule.value}
                                    onChange={(e) =>
                                      handleUpdateRule(
                                        selectedQuestion.id,
                                        rule.id,
                                        {
                                          value: e.target.value,
                                        }
                                      )
                                    }
                                    className="w-full px-3 py-2 text-xs font-semibold bg-[#FFFDF9] border-2 border-[#2A2623] rounded-xl focus:outline-none cursor-pointer"
                                  >
                                    {selectedQuestion.choices.map((c) => (
                                      <option key={c.id} value={c.label}>
                                        {c.label}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    id={`rule-val-${rule.id}`}
                                    type="text"
                                    value={rule.value}
                                    onChange={(e) =>
                                      handleUpdateRule(
                                        selectedQuestion.id,
                                        rule.id,
                                        {
                                          value: e.target.value,
                                        },
                                        `rule-val-${rule.id}`
                                      )
                                    }
                                    placeholder="Enter comparison value..."
                                    className="w-full px-3 py-2 text-xs font-semibold bg-[#FFFDF9] border-2 border-[#2A2623] rounded-xl focus:outline-none"
                                  />
                                )}
                              </div>
                            )}
                            <div>
                              <label
                                htmlFor={`rule-target-${rule.id}`}
                                className="block text-[11px] font-bold text-[#6E655E] mb-1"
                              >
                                Then jump to…
                              </label>
                              <select
                                id={`rule-target-${rule.id}`}
                                value={rule.targetId}
                                onChange={(e) =>
                                  handleUpdateRule(
                                    selectedQuestion.id,
                                    rule.id,
                                    {
                                      targetId: e.target.value,
                                    }
                                  )
                                }
                                className="w-full px-3 py-2 text-xs font-bold bg-[#F6D97A] border-2 border-[#2A2623] rounded-xl focus:outline-none cursor-pointer"
                              >
                                {form.questions.map((qOpt, qOptIdx) => (
                                  <option
                                    key={qOpt.id}
                                    value={qOpt.id}
                                    disabled={qOpt.id === selectedQuestion.id}
                                  >
                                    {String(qOptIdx + 1).padStart(2, '0')} ·{' '}
                                    {qOpt.title}
                                  </option>
                                ))}
                                <option value="completion">
                                  Completion Screen (Finish Form)
                                </option>
                              </select>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="pt-3 border-t border-[#2A2623]/15 space-y-2">
                  <label
                    htmlFor="default-next-select"
                    className="block text-xs font-bold text-[#2A2623]"
                  >
                    Otherwise (Default Path)
                  </label>
                  <p className="text-[11px] text-[#6E655E]">
                    Where respondents go when none of the conditions above
                    match:
                  </p>
                  <select
                    id="default-next-select"
                    value={selectedQuestion.defaultNextId || 'next'}
                    onChange={(e) =>
                      handleUpdateDefaultNext(
                        selectedQuestion.id,
                        e.target.value
                      )
                    }
                    className="w-full px-3 py-2 text-xs font-semibold bg-[#FAF6F0] border-2 border-[#2A2623] rounded-xl focus:outline-none cursor-pointer"
                  >
                    <option value="next">
                      Next question in sequence (Default)
                    </option>
                    {form.questions.map((qOpt, qOptIdx) => (
                      <option
                        key={qOpt.id}
                        value={qOpt.id}
                        disabled={qOpt.id === selectedQuestion.id}
                      >
                        Jump to {String(qOptIdx + 1).padStart(2, '0')} ·{' '}
                        {qOpt.title}
                      </option>
                    ))}
                    <option value="completion">
                      Jump to Completion Screen (Finish Form)
                    </option>
                  </select>
                </div>
              </>
            )}
        </aside>
      </div>
    </div>
  );
}
