import {
  AppearanceTemplateId,
  AppearanceTemplateCategory,
  AppearanceOverrides,
  FormAppearanceConfig,
  FontFamilyToken,
  ButtonShapeToken,
  CornerRadiusToken,
  BackgroundTreatmentToken,
  CardWidthToken,
  ContentAlignmentToken,
  ButtonShadowToken,
  SpacingDensityToken,
} from '@/core/types';
import {
  isValidAppearanceTemplateId,
  sanitizeAppearanceOverrides,
} from '@/core/migrations';

export type InputStyleVariant =
  | 'tactile-box'
  | 'clean-box'
  | 'editorial-underline'
  | 'pop-chunky'
  | 'dark-surface'
  | 'organic-soft'
  | 'airy-pill'
  | 'hud-console'
  | 'cad-spec'
  | 'vamori-industrial'
  | 'veritas-glass'
  | 'tiny-lilac'
  | 'akarii-studio'
  | 'riff-editorial';

export type CardFrameVariant =
  | 'paper-outlined'
  | 'canvas-clean'
  | 'editorial-sheet'
  | 'pop-bold'
  | 'after-dark-panel'
  | 'bloom-organic'
  | 'breeze-airy'
  | 'corporate-structured'
  | 'gaming-hud'
  | 'blueprint-cad'
  | 'terracotta-warm'
  | 'vamori-underground'
  | 'veritas-midnight'
  | 'tiny-lilac-card'
  | 'akarii-prism'
  | 'riff-studio';

export interface ResolvedAppearanceTokens {
  templateId: AppearanceTemplateId;
  templateName: string;
  templateSubtitle: string;
  category: AppearanceTemplateCategory;
  attribution?: string;
  isDark: boolean;
  // Colors
  canvasBackground: string;
  cardBackground: string;
  inputBackground: string;
  textColor: string;
  mutedTextColor: string;
  primaryColor: string;
  primaryTextColor: string;
  borderColor: string;
  selectedOptionBg: string;
  selectedOptionBorder: string;
  selectedOptionText: string;
  errorBg: string;
  errorBorder: string;
  errorText: string;
  // Layout & Shape tokens
  fontFamily: FontFamilyToken;
  headingFontCss: string;
  bodyFontCss: string;
  buttonShape: ButtonShapeToken;
  cornerRadius: CornerRadiusToken;
  backgroundTreatment: BackgroundTreatmentToken;
  cardWidth: CardWidthToken;
  contentAlignment: ContentAlignmentToken;
  buttonShadow: ButtonShadowToken;
  density: SpacingDensityToken;
  // Structural variants
  inputVariant: InputStyleVariant;
  cardVariant: CardFrameVariant;
  showTopRibbon: boolean;
  showIllustratedStamp: boolean;
}

export interface AppearanceTemplateDefinition {
  id: AppearanceTemplateId;
  name: string;
  subtitle: string;
  category: AppearanceTemplateCategory;
  attribution?: string;
  tagline: string;
  description: string;
  bestFor: string;
  defaultTokens: Omit<
    ResolvedAppearanceTokens,
    | 'templateId'
    | 'templateName'
    | 'templateSubtitle'
    | 'category'
    | 'attribution'
    | 'headingFontCss'
    | 'bodyFontCss'
  >;
}

/**
 * Computes a readable contrasting text color (#FFFFFF or #18181B) for any hex background.
 */
export function getContrastingTextColor(hexColor: string): string {
  const clean = (hexColor || '').replace('#', '').trim();
  const normalized =
    clean.length === 3
      ? clean
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : clean.substring(0, 6);
  if (normalized.length !== 6) return '#FFFFFF';
  const r = parseInt(normalized.substring(0, 2), 16) / 255;
  const g = parseInt(normalized.substring(2, 4), 16) / 255;
  const b = parseInt(normalized.substring(4, 6), 16) / 255;
  const toLinear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const luminance =
    0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return luminance > 0.42 ? '#18181B' : '#FFFFFF';
}

export function isColorDark(hexColor: string): boolean {
  return getContrastingTextColor(hexColor) === '#FFFFFF';
}

export function resolveFontFamilyCss(token: FontFamilyToken): {
  headingFontCss: string;
  bodyFontCss: string;
} {
  switch (token) {
    case 'display':
      return {
        headingFontCss: 'var(--font-display), sans-serif',
        bodyFontCss: 'var(--font-sans), sans-serif',
      };
    case 'serif':
      return {
        headingFontCss: 'var(--font-serif), Georgia, serif',
        bodyFontCss: 'var(--font-sans), sans-serif',
      };
    case 'mono':
      return {
        headingFontCss: 'var(--font-mono), monospace',
        bodyFontCss: 'var(--font-mono), monospace',
      };
    case 'sans':
    default:
      return {
        headingFontCss: 'var(--font-sans), sans-serif',
        bodyFontCss: 'var(--font-sans), sans-serif',
      };
  }
}

export const APPEARANCE_TEMPLATES: Record<
  AppearanceTemplateId,
  AppearanceTemplateDefinition
> = {
  // ============================================================================
  // ESSENTIALS COLLECTION (11 Existing Templates — Preserved)
  // ============================================================================
  paper: {
    id: 'paper',
    name: 'Paper',
    subtitle: 'Studio Default',
    category: 'essentials',
    tagline: 'Tactile illustrated paper with charcoal ink outlines',
    description:
      'Warm cream backgrounds, subtle dot grain, dark outlines, coral actions, and tactile offset shadows.',
    bestFor: 'Studio RSVPs, creative projects, maker communities',
    defaultTokens: {
      isDark: false,
      canvasBackground: '#FAF6F0',
      cardBackground: '#FFFDF9',
      inputBackground: '#FFFDF9',
      textColor: '#2A2623',
      mutedTextColor: '#6E655E',
      primaryColor: '#E86D52',
      primaryTextColor: '#FFFFFF',
      borderColor: '#2A2623',
      selectedOptionBg: '#F6D97A',
      selectedOptionBorder: '#2A2623',
      selectedOptionText: '#2A2623',
      errorBg: '#FDECE8',
      errorBorder: '#2A2623',
      errorText: '#2A2623',
      fontFamily: 'display',
      buttonShape: 'rounded',
      cornerRadius: 'xl',
      backgroundTreatment: 'paper-grain',
      cardWidth: 'standard',
      contentAlignment: 'left',
      buttonShadow: 'tactile',
      density: 'comfortable',
      inputVariant: 'tactile-box',
      cardVariant: 'paper-outlined',
      showTopRibbon: true,
      showIllustratedStamp: true,
    },
  },
  canvas: {
    id: 'canvas',
    name: 'Canvas',
    subtitle: 'Neutral Minimal',
    category: 'essentials',
    tagline: 'Universal, timeless neutral foundation',
    description:
      'Clean sans-serif typography, crisp white surfaces, subtle gray borders, and restrained transitions.',
    bestFor: 'Surveys, job applications, contact forms, internal tools',
    defaultTokens: {
      isDark: false,
      canvasBackground: '#F8FAFC',
      cardBackground: '#FFFFFF',
      inputBackground: '#FFFFFF',
      textColor: '#0F172A',
      mutedTextColor: '#64748B',
      primaryColor: '#0F172A',
      primaryTextColor: '#FFFFFF',
      borderColor: '#CBD5E1',
      selectedOptionBg: '#F1F5F9',
      selectedOptionBorder: '#0F172A',
      selectedOptionText: '#0F172A',
      errorBg: '#FEF2F2',
      errorBorder: '#FECACA',
      errorText: '#991B1B',
      fontFamily: 'sans',
      buttonShape: 'rounded',
      cornerRadius: 'md',
      backgroundTreatment: 'solid',
      cardWidth: 'standard',
      contentAlignment: 'left',
      buttonShadow: 'soft',
      density: 'comfortable',
      inputVariant: 'clean-box',
      cardVariant: 'canvas-clean',
      showTopRibbon: false,
      showIllustratedStamp: false,
    },
  },
  editorial: {
    id: 'editorial',
    name: 'Editorial',
    subtitle: 'Literary Serif',
    category: 'essentials',
    tagline: 'Refined serif typography and publication poise',
    description:
      'Oversized Fraunces serif headings, generous whitespace, thin editorial rules, and understated underlined inputs.',
    bestFor: 'Interviews, grant applications, luxury brands, essays',
    defaultTokens: {
      isDark: false,
      canvasBackground: '#FBF9F5',
      cardBackground: '#FBF9F5',
      inputBackground: 'transparent',
      textColor: '#1C1917',
      mutedTextColor: '#78716C',
      primaryColor: '#1C1917',
      primaryTextColor: '#FBF9F5',
      borderColor: '#D6D3D1',
      selectedOptionBg: '#F3EFE6',
      selectedOptionBorder: '#1C1917',
      selectedOptionText: '#1C1917',
      errorBg: '#FEF2F2',
      errorBorder: '#991B1B',
      errorText: '#991B1B',
      fontFamily: 'serif',
      buttonShape: 'sharp',
      cornerRadius: 'sm',
      backgroundTreatment: 'solid',
      cardWidth: 'wide',
      contentAlignment: 'left',
      buttonShadow: 'none',
      density: 'spacious',
      inputVariant: 'editorial-underline',
      cardVariant: 'editorial-sheet',
      showTopRibbon: false,
      showIllustratedStamp: false,
    },
  },
  pop: {
    id: 'pop',
    name: 'Pop',
    subtitle: 'Bold & Kinetic',
    category: 'essentials',
    tagline: 'Bold, high-contrast cards and energetic color',
    description:
      'Vibrant contrasting palette, strong display headings, thick ink borders, and expressive pill buttons.',
    bestFor: 'Quizzes, creator communities, festival registrations',
    defaultTokens: {
      isDark: false,
      canvasBackground: '#FFF3C4',
      cardBackground: '#FFFFFF',
      inputBackground: '#FFFFFF',
      textColor: '#18181B',
      mutedTextColor: '#52525B',
      primaryColor: '#FF3B6B',
      primaryTextColor: '#FFFFFF',
      borderColor: '#18181B',
      selectedOptionBg: '#FFE66D',
      selectedOptionBorder: '#18181B',
      selectedOptionText: '#18181B',
      errorBg: '#FFE4E6',
      errorBorder: '#18181B',
      errorText: '#9F1239',
      fontFamily: 'display',
      buttonShape: 'pill',
      cornerRadius: 'xl',
      backgroundTreatment: 'subtle-grid',
      cardWidth: 'standard',
      contentAlignment: 'left',
      buttonShadow: 'tactile',
      density: 'comfortable',
      inputVariant: 'pop-chunky',
      cardVariant: 'pop-bold',
      showTopRibbon: true,
      showIllustratedStamp: true,
    },
  },
  'after-dark': {
    id: 'after-dark',
    name: 'After Dark',
    subtitle: 'Obsidian Slate',
    category: 'essentials',
    tagline: 'Atmospheric midnight slate with soft lavender accents',
    description:
      'Deep obsidian surfaces, high-contrast readable typography, dark input wells, and refined indigo highlights.',
    bestFor: 'Developer beta access, evening events, media screenings',
    defaultTokens: {
      isDark: true,
      canvasBackground: '#0B0F17',
      cardBackground: '#131B2E',
      inputBackground: '#0D1322',
      textColor: '#F8FAFC',
      mutedTextColor: '#94A3B8',
      primaryColor: '#818CF8',
      primaryTextColor: '#0B0F17',
      borderColor: '#293552',
      selectedOptionBg: '#1E2946',
      selectedOptionBorder: '#818CF8',
      selectedOptionText: '#F8FAFC',
      errorBg: '#3B1824',
      errorBorder: '#F43F5E',
      errorText: '#FDA4AF',
      fontFamily: 'sans',
      buttonShape: 'rounded',
      cornerRadius: 'lg',
      backgroundTreatment: 'soft-gradient',
      cardWidth: 'standard',
      contentAlignment: 'left',
      buttonShadow: 'soft',
      density: 'comfortable',
      inputVariant: 'dark-surface',
      cardVariant: 'after-dark-panel',
      showTopRibbon: false,
      showIllustratedStamp: false,
    },
  },
  bloom: {
    id: 'bloom',
    name: 'Bloom',
    subtitle: 'Botanical Linen',
    category: 'essentials',
    tagline: 'Organic botanical greens and calm warm surfaces',
    description:
      'Botanical forest accents, soft linen surfaces, relaxed serif headings, and gentle organic curves.',
    bestFor: 'Wellness retreats, weddings, workshops, community gatherings',
    defaultTokens: {
      isDark: false,
      canvasBackground: '#F2F5EF',
      cardBackground: '#FCFDFB',
      inputBackground: '#F5F8F2',
      textColor: '#233B2E',
      mutedTextColor: '#5C7466',
      primaryColor: '#3A6B50',
      primaryTextColor: '#FFFFFF',
      borderColor: '#C5D6BE',
      selectedOptionBg: '#E3EFE0',
      selectedOptionBorder: '#3A6B50',
      selectedOptionText: '#1B3125',
      errorBg: '#FDECE8',
      errorBorder: '#D4573B',
      errorText: '#7C2D12',
      fontFamily: 'serif',
      buttonShape: 'pill',
      cornerRadius: 'xl',
      backgroundTreatment: 'soft-gradient',
      cardWidth: 'standard',
      contentAlignment: 'left',
      buttonShadow: 'soft',
      density: 'spacious',
      inputVariant: 'organic-soft',
      cardVariant: 'bloom-organic',
      showTopRibbon: false,
      showIllustratedStamp: false,
    },
  },
  breeze: {
    id: 'breeze',
    name: 'Breeze',
    subtitle: 'Airy Daylight',
    category: 'essentials',
    tagline: 'Light, airy sky tones with pill-shaped controls',
    description:
      'Pale sky-blue canvas, crisp white cards, ocean-blue pill buttons, and welcoming rounded inputs.',
    bestFor: 'Customer onboarding, everyday registration, product feedback',
    defaultTokens: {
      isDark: false,
      canvasBackground: '#EFF6FF',
      cardBackground: '#FFFFFF',
      inputBackground: '#F8FAFC',
      textColor: '#0F172A',
      mutedTextColor: '#475569',
      primaryColor: '#0284C7',
      primaryTextColor: '#FFFFFF',
      borderColor: '#BFDBFE',
      selectedOptionBg: '#E0F2FE',
      selectedOptionBorder: '#0284C7',
      selectedOptionText: '#0C4A6E',
      errorBg: '#FEF2F2',
      errorBorder: '#FCA5A5',
      errorText: '#991B1B',
      fontFamily: 'sans',
      buttonShape: 'pill',
      cornerRadius: 'xl',
      backgroundTreatment: 'soft-gradient',
      cardWidth: 'standard',
      contentAlignment: 'left',
      buttonShadow: 'soft',
      density: 'comfortable',
      inputVariant: 'airy-pill',
      cardVariant: 'breeze-airy',
      showTopRibbon: false,
      showIllustratedStamp: false,
    },
  },
  corporate: {
    id: 'corporate',
    name: 'Corporate',
    subtitle: 'Executive Suite',
    category: 'essentials',
    tagline: 'Executive navy and structured enterprise clarity',
    description:
      'Authoritative navy accents, cool slate background, structured rectangular cards, and crisp enterprise typography.',
    bestFor: 'B2B procurement, vendor intake, executive briefings, HR compliance',
    defaultTokens: {
      isDark: false,
      canvasBackground: '#F1F5F9',
      cardBackground: '#FFFFFF',
      inputBackground: '#F8FAFC',
      textColor: '#0F172A',
      mutedTextColor: '#475569',
      primaryColor: '#0F3D75',
      primaryTextColor: '#FFFFFF',
      borderColor: '#CBD5E1',
      selectedOptionBg: '#E2E8F0',
      selectedOptionBorder: '#0F3D75',
      selectedOptionText: '#0F172A',
      errorBg: '#FEF2F2',
      errorBorder: '#DC2626',
      errorText: '#991B1B',
      fontFamily: 'sans',
      buttonShape: 'rounded',
      cornerRadius: 'sm',
      backgroundTreatment: 'subtle-grid',
      cardWidth: 'standard',
      contentAlignment: 'left',
      buttonShadow: 'soft',
      density: 'compact',
      inputVariant: 'clean-box',
      cardVariant: 'corporate-structured',
      showTopRibbon: true,
      showIllustratedStamp: false,
    },
  },
  gaming: {
    id: 'gaming',
    name: 'Gaming',
    subtitle: 'Cyber HUD',
    category: 'essentials',
    tagline: 'Cyber arcade HUD with electric neon cyan telemetry',
    description:
      'Deep midnight arcade chassis, monospace HUD headings, sharp chamfered controls, and high-contrast neon accents.',
    bestFor: 'Esports tournaments, playtest feedback, guild recruitment, hardware drops',
    defaultTokens: {
      isDark: true,
      canvasBackground: '#090A12',
      cardBackground: '#111424',
      inputBackground: '#0B0D18',
      textColor: '#F0F6FC',
      mutedTextColor: '#8B9BB4',
      primaryColor: '#00F5D4',
      primaryTextColor: '#090A12',
      borderColor: '#2B3566',
      selectedOptionBg: '#162238',
      selectedOptionBorder: '#00F5D4',
      selectedOptionText: '#00F5D4',
      errorBg: '#3B1222',
      errorBorder: '#FF2A85',
      errorText: '#FF85B3',
      fontFamily: 'mono',
      buttonShape: 'sharp',
      cornerRadius: 'sm',
      backgroundTreatment: 'subtle-grid',
      cardWidth: 'standard',
      contentAlignment: 'left',
      buttonShadow: 'tactile',
      density: 'comfortable',
      inputVariant: 'hud-console',
      cardVariant: 'gaming-hud',
      showTopRibbon: true,
      showIllustratedStamp: false,
    },
  },
  blueprint: {
    id: 'blueprint',
    name: 'Blueprint',
    subtitle: 'CAD Spec',
    category: 'essentials',
    tagline: 'Architectural cyanotype and precision CAD specification',
    description:
      'Drafting-table cyanotype blues, crisp technical grid lines, monospace engineering labels, and sharp ruled frames.',
    bestFor: 'Engineering specs, architecture RFPs, hardware diagnostics, lab logs',
    defaultTokens: {
      isDark: true,
      canvasBackground: '#0E2A47',
      cardBackground: '#13365C',
      inputBackground: '#0B2138',
      textColor: '#F0F7FF',
      mutedTextColor: '#93C5FD',
      primaryColor: '#38BDF8',
      primaryTextColor: '#0B2138',
      borderColor: '#3B76B2',
      selectedOptionBg: '#1A497A',
      selectedOptionBorder: '#38BDF8',
      selectedOptionText: '#F0F7FF',
      errorBg: '#451A25',
      errorBorder: '#FB7185',
      errorText: '#FECDD3',
      fontFamily: 'mono',
      buttonShape: 'sharp',
      cornerRadius: 'sm',
      backgroundTreatment: 'subtle-grid',
      cardWidth: 'wide',
      contentAlignment: 'left',
      buttonShadow: 'tactile',
      density: 'compact',
      inputVariant: 'cad-spec',
      cardVariant: 'blueprint-cad',
      showTopRibbon: false,
      showIllustratedStamp: false,
    },
  },
  terracotta: {
    id: 'terracotta',
    name: 'Terracotta',
    subtitle: 'Warm Atelier',
    category: 'essentials',
    tagline: 'Sun-baked clay, warm travertine, and artisanal serif poise',
    description:
      'Mediterranean sand canvas, warm travertine cards, burnt sienna accents, and expressive Fraunces serif headings.',
    bestFor: 'Culinary pop-ups, hospitality, design studios, artisan markets',
    defaultTokens: {
      isDark: false,
      canvasBackground: '#F6ECE3',
      cardBackground: '#FFFBF7',
      inputBackground: '#FAF3EC',
      textColor: '#2C1E18',
      mutedTextColor: '#755B4E',
      primaryColor: '#C84B31',
      primaryTextColor: '#FFFFFF',
      borderColor: '#D5B8A3',
      selectedOptionBg: '#F4DFD0',
      selectedOptionBorder: '#C84B31',
      selectedOptionText: '#2C1E18',
      errorBg: '#FDECE8',
      errorBorder: '#B91C1C',
      errorText: '#7F1D1D',
      fontFamily: 'serif',
      buttonShape: 'pill',
      cornerRadius: 'lg',
      backgroundTreatment: 'paper-grain',
      cardWidth: 'standard',
      contentAlignment: 'left',
      buttonShadow: 'soft',
      density: 'spacious',
      inputVariant: 'organic-soft',
      cardVariant: 'terracotta-warm',
      showTopRibbon: true,
      showIllustratedStamp: true,
    },
  },

  // ============================================================================
  // CREATOR'S COLLECTION (5 Special Product Tribute Themes)
  // ============================================================================
  vamori: {
    id: 'vamori',
    name: 'Vamori',
    subtitle: 'Underground',
    category: 'creators-collection',
    attribution:
      "Part of the Creator's Collection — inspired by the visual identity of Vamori.",
    tagline: 'Underground event poster with industrial graphite & acid lime',
    description:
      'Near-black industrial canvas, graphite ticket framing, barcode & registration motifs, and high-voltage #D6FF00 acid-lime states.',
    bestFor: 'Music events, underground club RSVPs, ticket drops, cultural collectives',
    defaultTokens: {
      isDark: true,
      canvasBackground: '#0B0B0B',
      cardBackground: '#1A1A1A',
      inputBackground: '#0B0B0B',
      textColor: '#F7F6F2',
      mutedTextColor: '#A8A8A8',
      primaryColor: '#D6FF00',
      primaryTextColor: '#0B0B0B',
      borderColor: '#303030',
      selectedOptionBg: '#161A05',
      selectedOptionBorder: '#D6FF00',
      selectedOptionText: '#F7F6F2',
      errorBg: '#291111',
      errorBorder: '#FF4D4D',
      errorText: '#FCA5A5',
      fontFamily: 'display',
      buttonShape: 'sharp',
      cornerRadius: 'sm',
      backgroundTreatment: 'subtle-grid',
      cardWidth: 'standard',
      contentAlignment: 'left',
      buttonShadow: 'tactile',
      density: 'comfortable',
      inputVariant: 'vamori-industrial',
      cardVariant: 'vamori-underground',
      showTopRibbon: true,
      showIllustratedStamp: false,
    },
  },
  veritas: {
    id: 'veritas',
    name: 'Veritas',
    subtitle: 'Midnight',
    category: 'creators-collection',
    attribution:
      "Part of the Creator's Collection — inspired by the visual identity of Veritas.",
    tagline: 'Futuristic verification dark UI with indigo, violet & rose lighting',
    description:
      'Deep #030303 midnight surfaces, soft ambient indigo/violet/rose light blooms, luminous borders, and refined verification controls.',
    bestFor: 'Receipt verification, security onboarding, fintech intake, trust portals',
    defaultTokens: {
      isDark: true,
      canvasBackground: '#030303',
      cardBackground: '#0C0D14',
      inputBackground: '#121420',
      textColor: '#FFFFFF',
      mutedTextColor: '#A1A1AA',
      primaryColor: '#6366F1',
      primaryTextColor: '#FFFFFF',
      borderColor: '#26283B',
      selectedOptionBg: '#15172B',
      selectedOptionBorder: '#8B5CF6',
      selectedOptionText: '#FFFFFF',
      errorBg: '#2A121B',
      errorBorder: '#FB7185',
      errorText: '#FDA4AF',
      fontFamily: 'sans',
      buttonShape: 'rounded',
      cornerRadius: 'lg',
      backgroundTreatment: 'soft-gradient',
      cardWidth: 'standard',
      contentAlignment: 'left',
      buttonShadow: 'soft',
      density: 'spacious',
      inputVariant: 'veritas-glass',
      cardVariant: 'veritas-midnight',
      showTopRibbon: false,
      showIllustratedStamp: false,
    },
  },
  'tiny-et': {
    id: 'tiny-et',
    name: 'tiny.et',
    subtitle: 'Lilac',
    category: 'creators-collection',
    attribution:
      "Part of the Creator's Collection — inspired by the visual identity of tiny.et.",
    tagline: 'Friendly lilac-lavender simplicity with soft pastel pink highlights',
    description:
      'Welcoming lavender-white surfaces, clean white cards, purple selection outlines, pill controls, and barely-perceptible radial dots.',
    bestFor: 'Creator bio links, quick polls, newsletter signups, community links',
    defaultTokens: {
      isDark: false,
      canvasBackground: '#F8F6FB',
      cardBackground: '#FFFFFF',
      inputBackground: '#FAF8FC',
      textColor: '#2B2338',
      mutedTextColor: '#6E6380',
      primaryColor: '#8673A1',
      primaryTextColor: '#FAF8FC',
      borderColor: '#D5CCE2',
      selectedOptionBg: '#EFEAF7',
      selectedOptionBorder: '#8673A1',
      selectedOptionText: '#2B2338',
      errorBg: '#FDF2F8',
      errorBorder: '#DB2777',
      errorText: '#9D174D',
      fontFamily: 'sans',
      buttonShape: 'pill',
      cornerRadius: 'xl',
      backgroundTreatment: 'paper-grain',
      cardWidth: 'standard',
      contentAlignment: 'left',
      buttonShadow: 'soft',
      density: 'comfortable',
      inputVariant: 'tiny-lilac',
      cardVariant: 'tiny-lilac-card',
      showTopRibbon: false,
      showIllustratedStamp: false,
    },
  },
  akarii: {
    id: 'akarii',
    name: 'Akarii',
    subtitle: 'Prism',
    category: 'creators-collection',
    attribution:
      "Part of the Creator's Collection — inspired by the visual identity of Akarii.",
    tagline: 'Dark creative imaging studio with mint actions & prismatic spectrum light',
    description:
      'Sophisticated dark charcoal studio panels, geometric display headings, mint primary controls, and prismatic spectral reflections.',
    bestFor: 'Creative direction briefs, AI art showcases, visual design critiques',
    defaultTokens: {
      isDark: true,
      canvasBackground: '#121212',
      cardBackground: '#18181A',
      inputBackground: '#202023',
      textColor: '#EAEEF3',
      mutedTextColor: '#9CA3AF',
      primaryColor: '#10B981',
      primaryTextColor: '#06130E',
      borderColor: '#2E2E33',
      selectedOptionBg: '#10241D',
      selectedOptionBorder: '#34D399',
      selectedOptionText: '#ECFDF5',
      errorBg: '#2D1420',
      errorBorder: '#EC4899',
      errorText: '#F9A8D4',
      fontFamily: 'display',
      buttonShape: 'rounded',
      cornerRadius: 'lg',
      backgroundTreatment: 'soft-gradient',
      cardWidth: 'standard',
      contentAlignment: 'left',
      buttonShadow: 'soft',
      density: 'comfortable',
      inputVariant: 'akarii-studio',
      cardVariant: 'akarii-prism',
      showTopRibbon: false,
      showIllustratedStamp: false,
    },
  },
  riff: {
    id: 'riff',
    name: 'Riff',
    subtitle: 'Studio',
    category: 'creators-collection',
    attribution:
      "Part of the Creator's Collection — inspired by the visual identity of Riff.",
    tagline: 'Warm ivory editorial gallery with charcoal ink, olive & terracotta',
    description:
      'Refined #FAF9F6 ivory surfaces, #282824 charcoal typography, muted #8A9B76 olive selection borders, and #A74728 terracotta highlights.',
    bestFor: 'Motion studio briefs, film & gallery curation, creative residencies',
    defaultTokens: {
      isDark: false,
      canvasBackground: '#F1F0E9',
      cardBackground: '#FFFEFA',
      inputBackground: '#FAF9F6',
      textColor: '#282824',
      mutedTextColor: '#6A6C62',
      primaryColor: '#A74728',
      primaryTextColor: '#FFFEFA',
      borderColor: '#DEDFD6',
      selectedOptionBg: '#F6F1E6',
      selectedOptionBorder: '#8A9B76',
      selectedOptionText: '#282824',
      errorBg: '#FDF2EF',
      errorBorder: '#A74728',
      errorText: '#7C2D12',
      fontFamily: 'sans',
      buttonShape: 'rounded',
      cornerRadius: 'md',
      backgroundTreatment: 'solid',
      cardWidth: 'wide',
      contentAlignment: 'left',
      buttonShadow: 'none',
      density: 'spacious',
      inputVariant: 'riff-editorial',
      cardVariant: 'riff-studio',
      showTopRibbon: false,
      showIllustratedStamp: false,
    },
  },
};

export const APPEARANCE_TEMPLATE_LIST: AppearanceTemplateDefinition[] = [
  // 11 Essentials
  APPEARANCE_TEMPLATES.paper,
  APPEARANCE_TEMPLATES.canvas,
  APPEARANCE_TEMPLATES.editorial,
  APPEARANCE_TEMPLATES.pop,
  APPEARANCE_TEMPLATES['after-dark'],
  APPEARANCE_TEMPLATES.bloom,
  APPEARANCE_TEMPLATES.breeze,
  APPEARANCE_TEMPLATES.corporate,
  APPEARANCE_TEMPLATES.gaming,
  APPEARANCE_TEMPLATES.blueprint,
  APPEARANCE_TEMPLATES.terracotta,
  // 5 Creator's Collection
  APPEARANCE_TEMPLATES.vamori,
  APPEARANCE_TEMPLATES.veritas,
  APPEARANCE_TEMPLATES['tiny-et'],
  APPEARANCE_TEMPLATES.akarii,
  APPEARANCE_TEMPLATES.riff,
];

export const ESSENTIAL_TEMPLATE_LIST: AppearanceTemplateDefinition[] =
  APPEARANCE_TEMPLATE_LIST.filter((t) => t.category === 'essentials');

export const CREATORS_COLLECTION_TEMPLATE_LIST: AppearanceTemplateDefinition[] =
  APPEARANCE_TEMPLATE_LIST.filter((t) => t.category === 'creators-collection');

const LEGACY_PAPER_ACCENT_HEX: Record<string, string> = {
  coral: '#E86D52',
  yellow: '#E0B43A',
  blue: '#4A90B8',
  pink: '#D97B88',
  sage: '#588B64',
};

/**
 * Resolves a form's final appearance tokens by starting with the selected
 * template's defaults (falling back to 'paper' if missing or invalid) and
 * layering any sanitized user overrides on top.
 */
export function resolveFormAppearance(
  appearanceConfig?: FormAppearanceConfig | null,
  legacyAccentTheme?: string
): ResolvedAppearanceTokens {
  const templateId: AppearanceTemplateId =
    appearanceConfig && isValidAppearanceTemplateId(appearanceConfig.templateId)
      ? appearanceConfig.templateId
      : 'paper';

  const templateDef =
    APPEARANCE_TEMPLATES[templateId] || APPEARANCE_TEMPLATES.paper;
  const base = templateDef.defaultTokens;
  const overrides: AppearanceOverrides = sanitizeAppearanceOverrides(
    appearanceConfig?.overrides
  );

  // For Paper template without an explicit primaryColor override, respect legacyAccentTheme if present
  let primaryColor = overrides.primaryColor || base.primaryColor;
  if (
    templateId === 'paper' &&
    !overrides.primaryColor &&
    legacyAccentTheme &&
    LEGACY_PAPER_ACCENT_HEX[legacyAccentTheme] &&
    legacyAccentTheme !== 'coral'
  ) {
    primaryColor = LEGACY_PAPER_ACCENT_HEX[legacyAccentTheme];
  }

  const canvasBackground = overrides.backgroundColor || base.canvasBackground;
  const isDarkCanvas = isColorDark(canvasBackground);
  const textColor =
    overrides.textColor ||
    (overrides.backgroundColor
      ? isDarkCanvas
        ? '#F8FAFC'
        : '#18181B'
      : base.textColor);

  const cardBackground = overrides.backgroundColor
    ? isDarkCanvas
      ? '#161F33'
      : '#FFFFFF'
    : base.cardBackground;

  const inputBackground = overrides.backgroundColor
    ? isDarkCanvas
      ? '#0F1626'
      : '#FFFFFF'
    : base.inputBackground;

  const mutedTextColor = isColorDark(cardBackground)
    ? base.isDark
      ? base.mutedTextColor
      : '#94A3B8'
    : base.isDark
    ? '#64748B'
    : base.mutedTextColor;
  const primaryTextColor = getContrastingTextColor(primaryColor);

  const fontFamily = overrides.fontFamily || base.fontFamily;
  const { headingFontCss, bodyFontCss } = resolveFontFamilyCss(fontFamily);

  // Preserve Riff's signature muted olive (#8A9B76) selection border unless user explicitly overrides primaryColor on non-paper/non-pop/non-riff templates
  const selectedOptionBorder =
    overrides.primaryColor &&
    templateId !== 'paper' &&
    templateId !== 'pop' &&
    templateId !== 'riff'
      ? primaryColor
      : base.selectedOptionBorder;

  return {
    ...base,
    templateId: templateDef.id,
    templateName: templateDef.name,
    templateSubtitle: templateDef.subtitle,
    category: templateDef.category,
    attribution: templateDef.attribution,
    isDark: isColorDark(cardBackground),
    canvasBackground,
    cardBackground,
    inputBackground,
    textColor,
    mutedTextColor,
    primaryColor,
    primaryTextColor,
    selectedOptionBorder,
    fontFamily,
    headingFontCss,
    bodyFontCss,
    buttonShape: overrides.buttonShape || base.buttonShape,
    cornerRadius: overrides.cornerRadius || base.cornerRadius,
    backgroundTreatment:
      overrides.backgroundTreatment || base.backgroundTreatment,
    cardWidth: overrides.cardWidth || base.cardWidth,
    contentAlignment: overrides.contentAlignment || base.contentAlignment,
    buttonShadow: overrides.buttonShadow || base.buttonShadow,
    density: overrides.density || base.density,
  };
}

export function getBackgroundTreatmentStyle(
  tokens: ResolvedAppearanceTokens
): React.CSSProperties {
  const base: React.CSSProperties = {
    backgroundColor: tokens.canvasBackground,
    backgroundImage: 'none',
    color: tokens.textColor,
    fontFamily: tokens.bodyFontCss,
  };

  if (tokens.backgroundTreatment === 'paper-grain') {
    const dotColor =
      tokens.templateId === 'tiny-et'
        ? 'rgba(134, 115, 161, 0.14)'
        : tokens.isDark
        ? 'rgba(255,255,255,0.07)'
        : 'rgba(42, 38, 35, 0.06)';
    return {
      ...base,
      backgroundImage: `radial-gradient(${dotColor} 1px, transparent 0)`,
      backgroundSize: tokens.templateId === 'tiny-et' ? '18px 18px' : '22px 22px',
    };
  }

  if (tokens.backgroundTreatment === 'subtle-grid') {
    const lineColor =
      tokens.templateId === 'blueprint'
        ? 'rgba(147, 197, 253, 0.14)'
        : tokens.templateId === 'gaming'
        ? 'rgba(0, 245, 212, 0.08)'
        : tokens.templateId === 'vamori'
        ? 'rgba(255, 255, 255, 0.045)'
        : tokens.isDark
        ? 'rgba(255,255,255,0.05)'
        : 'rgba(15, 23, 42, 0.055)';
    return {
      ...base,
      backgroundImage: `linear-gradient(to right, ${lineColor} 1px, transparent 1px), linear-gradient(to bottom, ${lineColor} 1px, transparent 1px)`,
      backgroundSize: tokens.templateId === 'vamori' ? '36px 36px' : '28px 28px',
    };
  }

  if (tokens.backgroundTreatment === 'soft-gradient') {
    if (tokens.templateId === 'veritas') {
      return {
        ...base,
        backgroundImage: [
          'radial-gradient(circle at 15% 15%, rgba(99, 102, 241, 0.16) 0%, transparent 50%)',
          'radial-gradient(circle at 85% 80%, rgba(251, 113, 133, 0.12) 0%, transparent 50%)',
          'radial-gradient(circle at 50% 45%, rgba(139, 92, 246, 0.10) 0%, transparent 60%)',
        ].join(', '),
      };
    }
    if (tokens.templateId === 'akarii') {
      return {
        ...base,
        backgroundImage: [
          'radial-gradient(circle at 20% 0%, rgba(139, 92, 246, 0.12) 0%, transparent 45%)',
          'radial-gradient(circle at 80% 10%, rgba(34, 211, 238, 0.10) 0%, transparent 45%)',
          `radial-gradient(circle at 50% 100%, ${tokens.primaryColor}16 0%, transparent 55%)`,
        ].join(', '),
      };
    }
    return {
      ...base,
      backgroundImage: tokens.isDark
        ? `radial-gradient(circle at 50% 0%, ${tokens.primaryColor}22 0%, transparent 65%)`
        : `radial-gradient(circle at 50% 0%, ${tokens.primaryColor}18 0%, transparent 65%)`,
    };
  }

  return base;
}

export function getCornerRadiusClass(radius: CornerRadiusToken): string {
  switch (radius) {
    case 'sm':
      return 'rounded-md';
    case 'md':
      return 'rounded-xl';
    case 'lg':
      return 'rounded-2xl';
    case 'xl':
    default:
      return 'rounded-3xl';
  }
}

export function getButtonRadiusClass(shape: ButtonShapeToken): string {
  switch (shape) {
    case 'pill':
      return 'rounded-full';
    case 'sharp':
      return 'rounded-none';
    case 'rounded':
    default:
      return 'rounded-xl';
  }
}
