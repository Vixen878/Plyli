export type ViewportCategory = 'mobile' | 'tablet' | 'desktop' | 'unknown';

export type AttributionStrategy =
  | 'session_entry'
  | 'first_touch'
  | 'last_touch';

export const UTM_PARAMETER_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
] as const;

export type UtmParameterKey = (typeof UTM_PARAMETER_KEYS)[number];

export interface UtmAttribution {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
}

export interface SessionAttribution {
  utm: UtmAttribution;
  referrerOrigin: string | null;
  isDirectOrUnknown: boolean;
  capturedAt: string;
  strategy: AttributionStrategy;
}

export const MAX_UTM_VALUE_LENGTH = 128;
export const MAX_REFERRER_ORIGIN_LENGTH = 255;

export function createEmptyUtmAttribution(): UtmAttribution {
  return {
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_content: null,
    utm_term: null,
  };
}

/**
 * Normalizes and sanitizes a raw UTM parameter value:
 * - Strips ASCII control characters and HTML angle brackets (<, >)
 * - Collapses internal whitespace runs to a single space and trims
 * - Bounds length to MAX_UTM_VALUE_LENGTH (128 chars)
 * - Returns null if empty so missing values are never fabricated
 */
export function normalizeAttributionValue(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .replace(/[\u0000-\u001F\u007F<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  return cleaned.slice(0, MAX_UTM_VALUE_LENGTH);
}

/**
 * Normalizes a UTM value into a canonical grouping key while preserving
 * display labels separately.
 */
export function canonicalAttributionKey(value: string | null | undefined): string {
  if (!value) return '__unknown__';
  const norm = normalizeAttributionValue(value);
  return norm ? norm.toLowerCase() : '__unknown__';
}

/**
 * Parses the five standard UTM parameters (utm_source, utm_medium, utm_campaign,
 * utm_content, utm_term) case-insensitively from a URL string, query string,
 * URLSearchParams instance, or key-value record.
 *
 * Normalization policy:
 * 1. Parameter names are matched case-insensitively (e.g., UTM_SOURCE -> utm_source).
 * 2. If multiple case variants exist in the same query string, the first non-empty value wins.
 * 3. Parameter values preserve their supplied casing (after trimming, stripping control/HTML angle chars,
 *    and clamping to 128 characters).
 * 4. Missing or blank parameters are represented as null (never guessed or invented).
 */
export function parseUtmParameters(
  input:
    | string
    | URLSearchParams
    | Record<string, string | string[] | null | undefined>
    | null
    | undefined
): UtmAttribution {
  const result = createEmptyUtmAttribution();
  if (!input) return result;

  const entries: Array<[string, string]> = [];

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return result;

    let queryPart = trimmed;
    const hashIdx = queryPart.indexOf('#');
    if (hashIdx !== -1) {
      queryPart = queryPart.slice(0, hashIdx);
    }

    if (
      queryPart.includes('://') ||
      queryPart.startsWith('http:') ||
      queryPart.startsWith('https:')
    ) {
      try {
        const parsedUrl = new URL(queryPart);
        parsedUrl.searchParams.forEach((val, key) => {
          entries.push([key, val]);
        });
      } catch {
        const qIdx = queryPart.indexOf('?');
        queryPart = qIdx !== -1 ? queryPart.slice(qIdx + 1) : '';
        if (queryPart) {
          const sp = new URLSearchParams(queryPart);
          sp.forEach((val, key) => {
            entries.push([key, val]);
          });
        }
      }
    } else {
      const qIdx = queryPart.indexOf('?');
      if (qIdx !== -1) {
        queryPart = queryPart.slice(qIdx + 1);
      } else if (
        !queryPart.includes('=') &&
        (queryPart.startsWith('/') || queryPart.includes('/'))
      ) {
        queryPart = '';
      }
      if (queryPart) {
        try {
          const sp = new URLSearchParams(queryPart);
          sp.forEach((val, key) => {
            entries.push([key, val]);
          });
        } catch {
          // Malformed query string falls back safely to empty UTM attribution
        }
      }
    }
  } else if (input instanceof URLSearchParams) {
    input.forEach((val, key) => {
      entries.push([key, val]);
    });
  } else if (typeof input === 'object') {
    for (const [k, v] of Object.entries(input)) {
      if (typeof v === 'string') {
        entries.push([k, v]);
      } else if (Array.isArray(v)) {
        for (const item of v) {
          if (typeof item === 'string') {
            entries.push([k, item]);
          }
        }
      }
    }
  }

  const keyLookup = new Map<string, UtmParameterKey>(
    UTM_PARAMETER_KEYS.map((k) => [k, k])
  );

  for (const [rawKey, rawVal] of entries) {
    const canonicalKey = keyLookup.get(rawKey.trim().toLowerCase());
    if (!canonicalKey) continue;
    if (result[canonicalKey] !== null) continue;
    const cleanVal = normalizeAttributionValue(rawVal);
    if (cleanVal !== null) {
      result[canonicalKey] = cleanVal;
    }
  }

  return result;
}

/**
 * Safely extracts only the referring origin (protocol + host) from a raw referrer URL string.
 * - Rejects non-http/https schemes (such as javascript:, data:, file:, about:)
 * - Never stores pathnames, query parameters, or fragments that could leak sensitive tokens
 * - Treats same-origin referrers as null (internal navigation) when currentOrigin is supplied
 */
export function extractSafeReferrerOrigin(
  rawReferrer?: string | null,
  currentOrigin?: string | null
): string | null {
  if (!rawReferrer || typeof rawReferrer !== 'string') return null;
  const trimmed = rawReferrer.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    const origin = parsed.origin.slice(0, MAX_REFERRER_ORIGIN_LENGTH);
    if (!origin || origin === 'null') return null;

    if (currentOrigin && typeof currentOrigin === 'string' && currentOrigin.trim()) {
      try {
        const currentParsed = new URL(currentOrigin.trim());
        if (currentParsed.origin.toLowerCase() === origin.toLowerCase()) {
          return null;
        }
      } catch {
        if (currentOrigin.trim().toLowerCase() === origin.toLowerCase()) {
          return null;
        }
      }
    }

    return origin;
  } catch {
    return null;
  }
}

export function hasAnyUtmParameter(utm: UtmAttribution | null | undefined): boolean {
  if (!utm) return false;
  return Boolean(
    utm.utm_source ||
      utm.utm_medium ||
      utm.utm_campaign ||
      utm.utm_content ||
      utm.utm_term
  );
}

/**
 * Captures session-entry attribution once when a form session begins.
 * Never fabricates platform names (e.g., Instagram, Telegram) when parameters or referrers are absent.
 */
export function captureSessionAttribution(options: {
  urlOrSearch?:
    | string
    | URLSearchParams
    | Record<string, string | string[] | null | undefined>
    | null;
  rawReferrer?: string | null;
  currentOrigin?: string | null;
  capturedAt?: string;
  strategy?: AttributionStrategy;
}): SessionAttribution {
  const utm = parseUtmParameters(options.urlOrSearch);
  const referrerOrigin = extractSafeReferrerOrigin(
    options.rawReferrer,
    options.currentOrigin
  );
  const isDirectOrUnknown = !hasAnyUtmParameter(utm) && !referrerOrigin;

  return {
    utm,
    referrerOrigin,
    isDirectOrUnknown,
    capturedAt: options.capturedAt || new Date().toISOString(),
    strategy: options.strategy || 'session_entry',
  };
}

/**
 * Sanitizes an untrusted SessionAttribution object (e.g. from JSON backup import).
 */
export function sanitizeSessionAttribution(
  raw: unknown
): SessionAttribution | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;
  const rawUtm =
    obj.utm && typeof obj.utm === 'object' && !Array.isArray(obj.utm)
      ? (obj.utm as Record<string, unknown>)
      : {};

  const utm: UtmAttribution = {
    utm_source: normalizeAttributionValue(rawUtm.utm_source),
    utm_medium: normalizeAttributionValue(rawUtm.utm_medium),
    utm_campaign: normalizeAttributionValue(rawUtm.utm_campaign),
    utm_content: normalizeAttributionValue(rawUtm.utm_content),
    utm_term: normalizeAttributionValue(rawUtm.utm_term),
  };

  const referrerOrigin =
    typeof obj.referrerOrigin === 'string'
      ? extractSafeReferrerOrigin(obj.referrerOrigin)
      : null;

  const isDirectOrUnknown = !hasAnyUtmParameter(utm) && !referrerOrigin;
  const strategy: AttributionStrategy =
    obj.strategy === 'first_touch' || obj.strategy === 'last_touch'
      ? obj.strategy
      : 'session_entry';

  return {
    utm,
    referrerOrigin,
    isDirectOrUnknown,
    capturedAt:
      typeof obj.capturedAt === 'string' && obj.capturedAt.trim()
        ? obj.capturedAt
        : new Date().toISOString(),
    strategy,
  };
}

/**
 * Classifies a numeric viewport width into a privacy-safe category.
 */
export function classifyViewportWidth(width?: number | null): ViewportCategory {
  if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) {
    return 'unknown';
  }
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

export interface CampaignUrlInput {
  baseUrl: string;
  formId?: string;
  includePreviewParam?: boolean;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
}

export interface CampaignUrlResult {
  valid: boolean;
  url: string;
  isLocalTestUrl: boolean;
  errors: Partial<Record<UtmParameterKey | 'baseUrl', string>>;
  warnings: string[];
  normalizedUtm: UtmAttribution;
}

/**
 * Determines whether a URL points to a browser-local or preview development environment
 * rather than a publicly hosted form service.
 */
export function isDevelopmentOrLocalUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host.endsWith('.local') ||
      host.includes('.run.app')
    ) {
      return true;
    }
    if (parsed.searchParams.get('preview') === '1') {
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

/**
 * Validates and builds a properly URL-encoded campaign link using the supplied base URL
 * and the five standard UTM parameters.
 */
export function buildCampaignUrl(input: CampaignUrlInput): CampaignUrlResult {
  const errors: Partial<Record<UtmParameterKey | 'baseUrl', string>> = {};
  const warnings: string[] = [];

  const normalizedUtm: UtmAttribution = {
    utm_source: normalizeAttributionValue(input.utm_source),
    utm_medium: normalizeAttributionValue(input.utm_medium),
    utm_campaign: normalizeAttributionValue(input.utm_campaign),
    utm_content: normalizeAttributionValue(input.utm_content),
    utm_term: normalizeAttributionValue(input.utm_term),
  };

  for (const key of UTM_PARAMETER_KEYS) {
    const rawVal = input[key];
    if (typeof rawVal === 'string' && rawVal.trim().length > MAX_UTM_VALUE_LENGTH) {
      errors[key] = `Must be ${MAX_UTM_VALUE_LENGTH} characters or fewer.`;
    }
  }

  let parsedBase: URL;
  try {
    parsedBase = new URL(input.baseUrl.trim());
    if (parsedBase.protocol !== 'http:' && parsedBase.protocol !== 'https:') {
      errors.baseUrl = 'Base URL must use http:// or https://.';
      return {
        valid: false,
        url: '',
        isLocalTestUrl: true,
        errors,
        warnings,
        normalizedUtm,
      };
    }
  } catch {
    errors.baseUrl = 'Please provide a valid base URL.';
    return {
      valid: false,
      url: '',
      isLocalTestUrl: true,
      errors,
      warnings,
      normalizedUtm,
    };
  }

  const hasAnyParam = hasAnyUtmParameter(normalizedUtm);
  if (hasAnyParam && !normalizedUtm.utm_source) {
    warnings.push(
      'Adding utm_source (e.g. "newsletter") is recommended so traffic attribution is grouped clearly.'
    );
  }
  if (normalizedUtm.utm_source && !normalizedUtm.utm_medium) {
    warnings.push(
      'Adding utm_medium (e.g. "email" or "social") helps distinguish channel types.'
    );
  }

  if (Object.keys(errors).length > 0) {
    return {
      valid: false,
      url: '',
      isLocalTestUrl: isDevelopmentOrLocalUrl(parsedBase.toString()),
      errors,
      warnings,
      normalizedUtm,
    };
  }

  // Remove any existing UTM parameters regardless of casing before setting normalized ones
  const existingKeys = Array.from(parsedBase.searchParams.keys());
  for (const k of existingKeys) {
    if (UTM_PARAMETER_KEYS.includes(k.toLowerCase() as UtmParameterKey)) {
      parsedBase.searchParams.delete(k);
    }
  }

  if (input.formId) {
    parsedBase.searchParams.set('formId', input.formId);
  }
  if (input.includePreviewParam) {
    parsedBase.searchParams.set('preview', '1');
  }

  for (const key of UTM_PARAMETER_KEYS) {
    const val = normalizedUtm[key];
    if (val) {
      parsedBase.searchParams.set(key, val);
    }
  }

  const finalUrl = parsedBase.toString();
  return {
    valid: true,
    url: finalUrl,
    isLocalTestUrl: isDevelopmentOrLocalUrl(finalUrl),
    errors,
    warnings,
    normalizedUtm,
  };
}
