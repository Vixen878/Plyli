// Generated from Plyli core/types.ts; run pnpm sdk:sync in Plyli.
import type { SessionAttribution, ViewportCategory } from './attribution.js';
import type { AnalyticsEvent, AnalyticsSessionSource } from './analytics.js';

export const CURRENT_SCHEMA_VERSION = 2;

export type QuestionType =
  | 'short_text'
  | 'long_text'
  | 'email'
  | 'single_choice'
  | 'multiple_choice'
  | 'dropdown'
  | 'yes_no'
  | 'rating'
  | 'number'
  | 'date';

export type LogicOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'greater_than'
  | 'less_than'
  | 'is_answered';

export type PresentationMode = 'conversational' | 'classic' | 'multi_step';

export type AppearanceTemplateId =
  | 'paper'
  | 'canvas'
  | 'editorial'
  | 'pop'
  | 'after-dark'
  | 'bloom'
  | 'breeze'
  | 'corporate'
  | 'gaming'
  | 'blueprint'
  | 'terracotta'
  | 'vamori'
  | 'veritas'
  | 'tiny-et'
  | 'akarii'
  | 'riff';

export type AppearanceTemplateCategory = 'essentials' | 'creators-collection';

export type FontFamilyToken = 'display' | 'sans' | 'serif' | 'mono';
export type ButtonShapeToken = 'rounded' | 'pill' | 'sharp';
export type CornerRadiusToken = 'sm' | 'md' | 'lg' | 'xl';
export type BackgroundTreatmentToken =
  | 'solid'
  | 'paper-grain'
  | 'subtle-grid'
  | 'soft-gradient';
export type CardWidthToken = 'compact' | 'standard' | 'wide';
export type ContentAlignmentToken = 'left' | 'center';
export type ButtonShadowToken = 'tactile' | 'soft' | 'none';
export type SpacingDensityToken = 'compact' | 'comfortable' | 'spacious';

export interface AppearanceOverrides {
  primaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
  fontFamily?: FontFamilyToken;
  buttonShape?: ButtonShapeToken;
  cornerRadius?: CornerRadiusToken;
  backgroundTreatment?: BackgroundTreatmentToken;
  cardWidth?: CardWidthToken;
  contentAlignment?: ContentAlignmentToken;
  buttonShadow?: ButtonShadowToken;
  density?: SpacingDensityToken;
}

export interface FormAppearanceConfig {
  schemaVersion?: number;
  templateId: AppearanceTemplateId;
  overrides: AppearanceOverrides;
}

export interface ChoiceOption {
  id: string;
  label: string;
}

export interface LogicRule {
  id: string;
  operator: LogicOperator;
  value: string; // Can match either choice ID or choice label
  targetId: string; // Question ID or 'completion'
}

export interface FormQuestion {
  id: string;
  type: QuestionType;
  title: string;
  description: string;
  required: boolean;
  defaultValue?: string | number | string[];
  placeholder?: string;
  choices?: ChoiceOption[];
  maxRating?: number;
  minNumber?: number;
  maxNumber?: number;
  minLength?: number;
  maxLength?: number;
  minChoices?: number;
  maxChoices?: number;
  logicRules: LogicRule[];
  defaultNextId?: string; // Question ID, 'next' (sequential), or 'completion'
}

export interface WelcomeScreenConfig {
  enabled: boolean;
  title: string;
  description: string;
  buttonText: string;
  timeEstimate: string;
  accentColor: 'coral' | 'blue' | 'yellow' | 'pink' | 'sage';
}

export interface CompletionScreenConfig {
  id?: string;
  title: string;
  description: string;
  buttonText: string;
  showAnswerReceipt: boolean;
}

export interface FormMetadata {
  createdBy?: string;
  tags?: string[];
  category?: string;
}

export interface FlowNodePosition {
  x: number;
  y: number;
}

export interface FlowCanvasLayout {
  positions: Record<string, FlowNodePosition>;
  zoom?: number;
  pan?: { x: number; y: number };
}

export interface FormSchema {
  id: string;
  schemaVersion: number;
  revision: number;
  title: string;
  description: string;
  accentTheme: 'coral' | 'blue' | 'yellow' | 'pink' | 'sage';
  presentationMode?: PresentationMode;
  appearance?: FormAppearanceConfig;
  questionOrder?: string[];
  flowCanvasLayout?: FlowCanvasLayout;
  metadata?: FormMetadata;
  createdAt: string;
  updatedAt: string;
  welcomeScreen: WelcomeScreenConfig;
  questions: FormQuestion[];
  completionScreen: CompletionScreenConfig;
}

export interface FormRevisionSnapshot {
  formId: string;
  revision: number;
  savedAt: string;
  title: string;
  questions: FormQuestion[];
  completionScreen: CompletionScreenConfig;
}

export type AnswerValue = string | string[] | number | null | undefined;

export type ExternalHostContext = Record<string, string | number | boolean>;

export interface NormalizedAnswerEntry {
  questionId: string;
  value: AnswerValue;
  choiceIds?: string[];
  displayValue: string;
}

export interface FormResponseRecord {
  id: string;
  formId: string;
  formRevision: number;
  submittedAt: string;
  durationSeconds: number;
  answers: Record<string, AnswerValue>;
  normalizedAnswers?: Record<string, NormalizedAnswerEntry>;
  visitedQuestionIds: string[];
  externalContext?: ExternalHostContext;
  attribution?: SessionAttribution;
  viewport?: ViewportCategory;
  sessionId?: string;
  sessionSource?: AnalyticsSessionSource;
}

export interface WorkspaceBackupPayload {
  schemaVersion: number;
  exportedAt: string;
  app: 'plyli';
  forms: FormSchema[];
  responses: FormResponseRecord[];
  revisions?: FormRevisionSnapshot[];
  analyticsEvents?: AnalyticsEvent[];
}

export function generateId(prefix = 'id'): string {
  const randomPart = Math.random().toString(36).substring(2, 9);
  const timePart = Date.now().toString(36).slice(-4);
  return `${prefix}_${randomPart}${timePart}`;
}

export const QUESTION_TYPE_META: Record<
  QuestionType,
  { label: string; shortLabel: string; badgeBg: string; description: string }
> = {
  short_text: {
    label: 'Short Text',
    shortLabel: 'Text',
    badgeBg: '#B8D8EB',
    description: 'Single-line response for names, titles, or quick notes',
  },
  long_text: {
    label: 'Long Text',
    shortLabel: 'Paragraph',
    badgeBg: '#B8D8EB',
    description: 'Multi-line text area for detailed thoughts and stories',
  },
  email: {
    label: 'Email Address',
    shortLabel: 'Email',
    badgeBg: '#F6D97A',
    description: 'Validated email input for staying in touch',
  },
  single_choice: {
    label: 'Single Choice',
    shortLabel: 'Choice',
    badgeBg: '#F5C4CB',
    description: 'Pick exactly one option from a tactile card list',
  },
  multiple_choice: {
    label: 'Multiple Choice',
    shortLabel: 'Multi-Select',
    badgeBg: '#F5C4CB',
    description: 'Choose one or more options with checkboxes',
  },
  dropdown: {
    label: 'Dropdown Select',
    shortLabel: 'Dropdown',
    badgeBg: '#F6D97A',
    description: 'Compact menu list for longer option sets',
  },
  yes_no: {
    label: 'Yes or No',
    shortLabel: 'Yes / No',
    badgeBg: '#C5DFC9',
    description: 'Binary decision ideal for quick branching logic',
  },
  rating: {
    label: 'Rating Scale',
    shortLabel: 'Rating',
    badgeBg: '#F6D97A',
    description: 'Numbered tactile tiles from 1 up to 5 or 10',
  },
  number: {
    label: 'Number Input',
    shortLabel: 'Number',
    badgeBg: '#C5DFC9',
    description: 'Numeric value with optional minimum and maximum bounds',
  },
  date: {
    label: 'Date Picker',
    shortLabel: 'Date',
    badgeBg: '#B8D8EB',
    description: 'Calendar date selection for schedules or milestones',
  },
};

export function createDefaultQuestion(
  type: QuestionType,
  index = 1
): FormQuestion {
  const base: FormQuestion = {
    id: generateId('q'),
    type,
    title: `Untitled ${QUESTION_TYPE_META[type].label.toLowerCase()} question`,
    description: '',
    required: false,
    logicRules: [],
    defaultNextId: 'next',
  };

  switch (type) {
    case 'short_text':
      return {
        ...base,
        title:
          index === 1 ? 'What should we call you?' : 'Share a quick note with us',
        placeholder: 'Type your answer here...',
      };
    case 'long_text':
      return {
        ...base,
        title: 'Tell us a little more about what you have in mind',
        description: 'Feel free to include as much detail as you like.',
        placeholder: 'Write your thoughts here...',
      };
    case 'email':
      return {
        ...base,
        title: 'Where can we send your confirmation?',
        description: 'We only use this to follow up on your submission.',
        placeholder: 'you@studio.com',
      };
    case 'single_choice':
      return {
        ...base,
        title: 'Which option describes you best?',
        choices: [
          { id: generateId('opt'), label: 'Design & Creative' },
          { id: generateId('opt'), label: 'Product & Engineering' },
          { id: generateId('opt'), label: 'Operations & Strategy' },
        ],
      };
    case 'multiple_choice':
      return {
        ...base,
        title: 'Which topics are you most curious about?',
        description: 'Choose as many as you like.',
        choices: [
          { id: generateId('opt'), label: 'Interactive Workshops' },
          { id: generateId('opt'), label: 'Design Systems' },
          { id: generateId('opt'), label: 'Local-First Tools' },
          { id: generateId('opt'), label: 'Community Critiques' },
        ],
      };
    case 'dropdown':
      return {
        ...base,
        title: 'Where are you joining us from?',
        choices: [
          { id: generateId('opt'), label: 'North America' },
          { id: generateId('opt'), label: 'Europe & UK' },
          { id: generateId('opt'), label: 'Asia Pacific' },
          { id: generateId('opt'), label: 'Latin America' },
          { id: generateId('opt'), label: 'Middle East & Africa' },
        ],
      };
    case 'yes_no':
      return {
        ...base,
        title: 'Would you like to join the hands-on session?',
        choices: [
          { id: 'yes', label: 'Yes' },
          { id: 'no', label: 'No' },
        ],
      };
    case 'rating':
      return {
        ...base,
        title: 'How enjoyable was this experience overall?',
        description: '1 means needs work, 5 means loved every bit.',
        maxRating: 5,
      };
    case 'number':
      return {
        ...base,
        title: 'How many guests are in your party?',
        placeholder: '1',
        minNumber: 1,
        maxNumber: 20,
      };
    case 'date':
      return {
        ...base,
        title: 'Which date works best for your visit?',
      };
  }
}
