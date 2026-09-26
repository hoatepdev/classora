import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import {
  COMMUNICATION_EVENTS,
  COMMUNICATION_EVENT_TYPES,
  communicationDedupeKey,
  normalizeEmail,
  type Recipient,
} from '../src/communication/communication.events.js';
import { extractPlaceholders, renderTemplate, validateTemplateContent } from '../src/communication/communication.renderer.js';
import { sanitizeError } from '../src/communication/communication.service.js';

const guardian: Recipient = { type: 'GUARDIAN', id: '01J000000000000000000000G1', name: 'Lan', email: 'Lan@Example.COM ' };

describe('communication template validation and rendering', () => {
  it('rejects placeholders outside the event allowlist', () => {
    const problems = validateTemplateContent({
      channel: 'EMAIL',
      allowedVariables: ['studentName'],
      subject: 'Hi {{studentName}}',
      body: 'Your password is {{internalDatabasePassword}}',
    });
    expect(problems).toContain('Unknown template variable {{internalDatabasePassword}}');
  });

  it('requires a subject for EMAIL templates only', () => {
    expect(validateTemplateContent({ channel: 'EMAIL', allowedVariables: ['studentName'], subject: null, body: 'Xin chào {{studentName}}' }))
      .toContain('Email templates require a subject');
    expect(validateTemplateContent({ channel: 'IN_APP', allowedVariables: ['studentName'], subject: null, body: 'Xin chào {{studentName}}' })).toHaveLength(0);
  });

  it('rejects blank bodies', () => {
    expect(validateTemplateContent({ channel: 'IN_APP', allowedVariables: [], subject: null, body: '   ' })).toContain('Body is required');
  });

  it('renders allowlisted variables and keeps unknown placeholders unresolved', () => {
    const rendered = renderTemplate({
      channel: 'EMAIL',
      requiredVariables: ['studentName'],
      subject: 'Hi {{studentName}}',
      body: 'Lớp {{className}}',
      context: { studentName: 'Minh An', className: 'TOEIC' },
    });
    expect(rendered).toEqual({ subject: 'Hi Minh An', body: 'Lớp TOEIC' });
  });

  it('fails before delivery when required context is missing', () => {
    expect(() => renderTemplate({ channel: 'EMAIL', requiredVariables: ['studentName'], subject: 's', body: 'b', context: {} }))
      .toThrow(BadRequestException);
  });

  it('never leaves unresolved placeholders in rendered output', () => {
    expect(() => renderTemplate({
      channel: 'IN_APP',
      requiredVariables: [],
      subject: null,
      body: 'Hello {{studentName}}',
      context: {},
    })).toThrow(/Unresolved template variable/);
  });

  it('extracts placeholders', () => {
    expect(extractPlaceholders('{{a}} and {{ b }}')).toEqual(['a', 'b']);
  });
});

describe('communication event registry', () => {
  it('defines exactly the LOCAL-11 event vocabulary', () => {
    expect(COMMUNICATION_EVENT_TYPES).toHaveLength(8);
    expect(COMMUNICATION_EVENT_TYPES).toContain('SCHEDULE_CHANGED');
  });

  it('gives every event usable built-in defaults for both channels', () => {
    for (const eventType of COMMUNICATION_EVENT_TYPES) {
      const definition = COMMUNICATION_EVENTS[eventType];
      expect(definition.timing === 'IMMEDIATE' || definition.timing === 'TIME_BASED').toBe(true);
      for (const channel of ['IN_APP', 'EMAIL'] as const) {
        const defaults = definition.defaults[channel];
        expect(defaults.body.trim().length).toBeGreaterThan(0);
        if (channel === 'EMAIL') expect(defaults.subject?.trim().length ?? 0).toBeGreaterThan(0);
        for (const name of extractPlaceholders(`${defaults.subject ?? ''}${defaults.body}`)) {
          expect(definition.variables.map((v) => v.name)).toContain(name);
        }
      }
      expect(new Set(definition.variables.map((v) => v.name)).size).toBe(definition.variables.length);
    }
  });

  it('builds deterministic dedupe keys that separate channel, recipient, and scope', () => {
    const base = { slug: 'payment.received', sourceEntityId: 'P1', recipient: guardian };
    const emailKey = communicationDedupeKey({ ...base, channel: 'EMAIL' });
    expect(emailKey).toBe(communicationDedupeKey({ ...base, channel: 'EMAIL' }));
    expect(emailKey).not.toBe(communicationDedupeKey({ ...base, channel: 'IN_APP' }));
    expect(emailKey).not.toBe(communicationDedupeKey({ ...base, channel: 'EMAIL', scope: '24H' }));
    expect(emailKey).toContain(`mail:${normalizeEmail(guardian.email!)}`);
    const otherGuardian = communicationDedupeKey({ ...base, channel: 'EMAIL', recipient: { ...guardian, email: 'other@example.com' } });
    expect(otherGuardian).not.toBe(emailKey);
  });

  it('normalizes emails for dedupe', () => {
    expect(normalizeEmail(' Lan@Example.COM ')).toBe('lan@example.com');
  });

  it('sanitizes emails out of delivery errors', () => {
    expect(sanitizeError(new Error('SMTP rejected lan@example.com'))).not.toContain('lan@example.com');
    expect(sanitizeError('x'.repeat(600))).toHaveLength(500);
  });
});
