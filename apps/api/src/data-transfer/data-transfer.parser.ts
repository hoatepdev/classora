import { BadRequestException } from '@nestjs/common';
import { parse } from 'csv-parse/sync';

export const IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 5_000;
export const IMPORT_MAX_COLUMNS = 100;

export type ParsedCsv = { headers: string[]; rows: string[][] };

// Bounded, memory-only CSV parsing for import uploads. Rejects malformed
// UTF-8/CSV, empty or duplicate headers, ragged rows, and limit overruns
// before any domain or staging work happens.
export function parseImportCsv(buffer: Buffer): ParsedCsv {
  if (buffer.byteLength === 0) throw new BadRequestException('Tệp CSV trống');
  if (buffer.byteLength > IMPORT_MAX_FILE_BYTES) {
    throw new BadRequestException(`Tệp vượt quá giới hạn ${IMPORT_MAX_FILE_BYTES / (1024 * 1024)} MiB`);
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new BadRequestException('Tệp phải được mã hóa UTF-8');
  }
  let records: string[][];
  try {
    records = parse(text, { bom: true, skip_empty_lines: true });
  } catch (error) {
    throw new BadRequestException(`CSV không hợp lệ: ${error instanceof Error ? error.message : 'không đọc được'}`);
  }
  const headerRecord = records.shift();
  if (!headerRecord || !headerRecord.length) throw new BadRequestException('CSV thiếu dòng tiêu đề');
  if (headerRecord.length > IMPORT_MAX_COLUMNS) {
    throw new BadRequestException(`CSV vượt quá ${IMPORT_MAX_COLUMNS} cột`);
  }
  const headers = headerRecord.map((header) => header.trim());
  if (headers.some((header) => header === '')) throw new BadRequestException('Tiêu đề cột không được để trống');
  const seen = new Set<string>();
  for (const header of headers.map((header) => header.toLowerCase())) {
    if (seen.has(header)) throw new BadRequestException(`Tiêu đề cột bị trùng: ${header}`);
    seen.add(header);
  }
  const rows = records.filter((row) => row.some((cell) => cell.trim() !== ''));
  if (rows.length > IMPORT_MAX_ROWS) {
    throw new BadRequestException(`CSV vượt quá ${IMPORT_MAX_ROWS.toLocaleString('vi-VN')} dòng dữ liệu`);
  }
  return { headers, rows };
}

export function suggestMapping(headers: string[], knownFields: readonly string[]): Record<string, string | null> {
  const byLower = new Map(knownFields.map((field) => [field.toLowerCase(), field]));
  return Object.fromEntries(headers.map((header) => [header, byLower.get(header.toLowerCase()) ?? null]));
}
