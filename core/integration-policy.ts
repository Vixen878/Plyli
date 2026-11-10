import { integrationPolicySchema, type IntegrationPolicy } from './contracts';
import type { ExternalHostContext } from './types';

export function parseIntegrationPolicy(value: unknown): IntegrationPolicy { return integrationPolicySchema.parse(value ?? {}); }

export function validateContext(policy: IntegrationPolicy, raw: ExternalHostContext | undefined, trusted: boolean) {
  const errors: Record<string, string> = {};
  const context = raw ?? {};
  if (!trusted && !policy.allowPublicContext && Object.keys(context).length) errors.context = 'Public contextual metadata is disabled.';
  const fields = new Map(policy.contextFields.map((f) => [f.key, f]));
  for (const [key, value] of Object.entries(context)) {
    const field = fields.get(key);
    if (!field) errors[key] = 'Context key is not allowed.';
    else if (typeof value !== field.type) errors[key] = `Expected ${field.type}.`;
  }
  for (const field of policy.contextFields) {
    if (field.required && (context[field.key] === undefined || context[field.key] === '')) errors[field.key] = 'Context value is required.';
  }
  return { valid: !Object.keys(errors).length, errors, context: raw };
}
