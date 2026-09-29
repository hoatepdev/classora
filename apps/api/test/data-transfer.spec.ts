import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { TenantRole } from '../src/generated/prisma/enums.js';
import { hasPermission, PERMISSIONS } from '../src/authorization/permissions.js';
import { IMPORT_CATALOG, IMPORT_TYPES, importTypeDefinition } from '../src/data-transfer/data-transfer.catalog.js';
import { IMPORT_MAX_COLUMNS, IMPORT_MAX_FILE_BYTES, IMPORT_MAX_ROWS, parseImportCsv, suggestMapping } from '../src/data-transfer/data-transfer.parser.js';
import { toCsv } from '../src/csv.js';

function csv(value: string) {
  return Buffer.from(value, 'utf-8');
}

describe('data transfer permissions', () => {
  it('grants bulk import/export only to import-authorized roles', () => {
    for (const role of [TenantRole.OWNER, TenantRole.CENTER_ADMIN, TenantRole.ACADEMIC_MANAGER]) {
      expect(hasPermission(role, PERMISSIONS.DATA_IMPORT)).toBe(true);
      expect(hasPermission(role, PERMISSIONS.DATA_EXPORT)).toBe(true);
    }
    for (const role of [TenantRole.ACCOUNTANT, TenantRole.SALE, TenantRole.STAFF, TenantRole.TEACHER]) {
      expect(hasPermission(role, PERMISSIONS.DATA_IMPORT)).toBe(false);
      expect(hasPermission(role, PERMISSIONS.DATA_EXPORT)).toBe(false);
    }
  });
});

describe('import catalog', () => {
  it('defines all six types with required identity and permission composition', () => {
    expect([...IMPORT_TYPES]).toEqual(['STUDENTS', 'TEACHERS', 'COURSES', 'COURSE_LEVELS', 'CLASSES', 'ENROLLMENTS']);
    expect(importTypeDefinition('STUDENTS').writePermission).toBe('student.write');
    expect(importTypeDefinition('ENROLLMENTS').writePermission).toBe('enrollment.write');
    expect(() => importTypeDefinition('INVOICES')).toThrow(BadRequestException);
    for (const type of IMPORT_TYPES) {
      const definition = IMPORT_CATALOG[type];
      expect(definition.identityFields.length).toBeGreaterThan(0);
      expect(definition.fields.some((field) => field.required && field.key === definition.identityFields[0])).toBe(true);
    }
  });

  it('restricts enrollment import statuses to initial lifecycle states', () => {
    const status = IMPORT_CATALOG.ENROLLMENTS.fields.find((field) => field.key === 'status')!;
    expect(status.allowedValues).toEqual(['PENDING', 'TRIAL', 'ACTIVE']);
  });

  it('renders header-only templates with the safe CSV writer', () => {
    const template = toCsv(importTypeDefinition('STUDENTS').fields.map((field) => field.key), []);
    expect(template.startsWith('﻿')).toBe(true);
    expect(template).toContain('code,fullName,phone,email');
    expect(template.split('\r\n')).toHaveLength(2);
  });
});

describe('import CSV parser', () => {
  it('parses BOM, CRLF, quoted commas, escaped quotes and multiline fields', () => {
    const parsed = parseImportCsv(csv('﻿code,fullName,note\r\nST001,"Nguyễn Văn A, Jr.","line\nbreak"\r\nST002,"say ""hi""",""\r\n'));
    expect(parsed.headers).toEqual(['code', 'fullName', 'note']);
    expect(parsed.rows).toEqual([['ST001', 'Nguyễn Văn A, Jr.', 'line\nbreak'], ['ST002', 'say "hi"', '']]);
  });

  it('ignores fully empty records but keeps rows with some empty fields', () => {
    const parsed = parseImportCsv(csv('code,name\n\nST1,\n'));
    expect(parsed.rows).toEqual([['ST1', '']]);
  });

  it('rejects malformed UTF-8', () => {
    expect(() => parseImportCsv(Buffer.concat([csv('code\n'), Buffer.from([0xff, 0xfe, 0x00])]))).toThrow(BadRequestException);
  });

  it('rejects empty, duplicate and ragged headers/rows', () => {
    expect(() => parseImportCsv(csv(''))).toThrow(BadRequestException);
    expect(() => parseImportCsv(csv('code,code\nA,B\n'))).toThrow(BadRequestException);
    expect(() => parseImportCsv(csv('code,\nA,B\n'))).toThrow(BadRequestException);
    expect(() => parseImportCsv(csv('code,name\nonly-one-column\n'))).toThrow(BadRequestException);
  });

  it('enforces file, row and column bounds before any domain work', () => {
    expect(() => parseImportCsv(csv('code\nA\n'.repeat(IMPORT_MAX_ROWS + 1)))).toThrow(BadRequestException);
    expect(parseImportCsv(csv(`code\n${'A\n'.repeat(IMPORT_MAX_ROWS)}`)).rows).toHaveLength(IMPORT_MAX_ROWS);
    expect(() => parseImportCsv(Buffer.concat([csv('code\nA\n'), Buffer.alloc(IMPORT_MAX_FILE_BYTES)]))).toThrow(BadRequestException);
    expect(() => parseImportCsv(csv(`${Array.from({ length: IMPORT_MAX_COLUMNS + 1 }, (_, i) => `c${i}`).join(',')}\n${Array.from({ length: IMPORT_MAX_COLUMNS + 1 }, () => 'x').join(',')}\n`))).toThrow(BadRequestException);
  });

  it('suggests exact and case-insensitive header mappings and ignores unknown columns', () => {
    const suggestion = suggestMapping(['CODE', 'Họ và tên', 'extra'], ['code', 'fullName']);
    expect(suggestion).toEqual({ CODE: 'code', 'Họ và tên': null, extra: null });
    expect(suggestMapping(['code', 'fullName'], ['code', 'fullName'])).toEqual({ code: 'code', fullName: 'fullName' });
  });
});
