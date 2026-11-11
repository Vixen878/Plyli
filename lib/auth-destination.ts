import { MAX_UTM_VALUE_LENGTH, UTM_PARAMETER_KEYS } from '@/core/attribution';

export function authDestination(value: unknown) {
  if (typeof value !== 'string') return '/dashboard';
  if (value === '/account') return value;
  const match = /^(\/f\/[a-zA-Z0-9_-]{1,191})(?:\?([^#\r\n]*))?$/.exec(value);
  if (!match || match[0] !== value) return '/dashboard';
  const [, path, query] = match;
  const input = new URLSearchParams(query);
  const campaign = new URLSearchParams();
  for (const [key, term] of input) {
    const field = UTM_PARAMETER_KEYS.find((candidate) => candidate === key.toLowerCase());
    if (!field) return '/dashboard';
    if (!campaign.has(field)) campaign.set(field, term.slice(0, MAX_UTM_VALUE_LENGTH));
  }
  return campaign.size ? `${path}?${campaign}` : path;
}
