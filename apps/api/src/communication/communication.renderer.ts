import { BadRequestException } from '@nestjs/common';

export type CommunicationChannel = 'IN_APP' | 'EMAIL';

// Safe render contexts are flat string maps built server-side from allowlisted
// columns only. Domain objects must never be passed to the renderer.
export type SafeContext = Record<string, string>;

const PLACEHOLDER = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;

export function extractPlaceholders(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map((match) => match[1]);
}

export function validateTemplateContent(input: {
  channel: CommunicationChannel;
  allowedVariables: readonly string[];
  subject?: string | null;
  body: string;
}): string[] {
  const problems: string[] = [];
  const allowed = new Set(input.allowedVariables);
  for (const field of [input.subject ?? '', input.body]) {
    for (const name of extractPlaceholders(field)) {
      if (!allowed.has(name)) problems.push(`Unknown template variable {{${name}}}`);
    }
  }
  if (!input.body.trim()) problems.push('Body is required');
  if (input.channel === 'EMAIL' && (!input.subject || !input.subject.trim())) {
    problems.push('Email templates require a subject');
  }
  return problems;
}

export function renderTemplate(input: {
  channel: CommunicationChannel;
  requiredVariables: readonly string[];
  subject?: string | null;
  body: string;
  context: SafeContext;
}): { subject: string | null; body: string } {
  const missing = input.requiredVariables.filter((name) => !(name in input.context) || !input.context[name]);
  if (missing.length > 0) {
    throw new BadRequestException(`Missing required template context: ${missing.join(', ')}`);
  }
  const replace = (text: string) =>
    text.replace(PLACEHOLDER, (whole, name: string) => (name in input.context ? input.context[name] : whole));
  const subject = input.subject ? replace(input.subject) : null;
  const body = replace(input.body);
  // A rendered message must never leave unresolved placeholders behind.
  for (const field of [subject ?? '', body]) {
    for (const name of extractPlaceholders(field)) {
      if (!(name in input.context)) throw new BadRequestException(`Unresolved template variable {{${name}}}`);
    }
  }
  return { subject, body };
}
