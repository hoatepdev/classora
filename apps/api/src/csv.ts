import { BadRequestException } from '@nestjs/common';

export const CSV_ROW_CAP = 50_000;

// Spreadsheet formula injection: a cell whose first character can start a
// formula must never reach Excel/Sheets unescaped (OWASP CSV injection).
const dangerousPrefix = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  let text = value == null ? '' : String(value);
  if (dangerousPrefix.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

// UTF-8 BOM for Vietnamese Excel compatibility, CRLF per RFC 4180.
export function toCsv(headers: string[], rows: unknown[][]): string {
  const body = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  return `﻿${body}\r\n`;
}

export function assertExportBounds(rowCount: number) {
  if (rowCount > CSV_ROW_CAP) throw new BadRequestException(`Kết xuất vượt quá ${CSV_ROW_CAP} dòng; hãy thu hẹp bộ lọc hoặc khoảng thời gian`);
}
