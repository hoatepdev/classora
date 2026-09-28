import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { assertExportBounds, CSV_ROW_CAP, csvCell, reportCsv, toCsv } from '../src/reports/report-csv.js';

 describe('report CSV', () => {
  it('writes UTF-8 BOM, CRLF rows and RFC 4180 quoting', () => {
    const csv = toCsv(['Tên', 'Ghi chú'], [['Nguyễn Văn A', 'a,b'], ['"quoted"', 'line\nbreak']]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toBe('﻿Tên,Ghi chú\r\nNguyễn Văn A,"a,b"\r\n"""quoted""","line\nbreak"\r\n');
    expect(csv.replaceAll('\r\n', '')).not.toContain('\r');
  });

  it.each(['=SUM(1+1)', '+1+1', '-2+3', '@cmd', '\tformula'])('neutralizes spreadsheet formula prefix %s', (value) => {
    expect(csvCell(value)).toBe(`'${value}`);
  });

  it('neutralizes and quotes a carriage-return formula prefix', () => {
    expect(csvCell('\rformula')).toBe('"\'\rformula"');
  });

  it('preserves exact integer money strings', () => {
    expect(toCsv(['Số tiền'], [['900719925474099312345']])).toContain('900719925474099312345');
  });

  it('exports summary and breakdowns even when a report has no detail table', () => {
    const csv = reportCsv({
      summary: { grossBilledVnd: '1000000' },
      breakdowns: [{ name: 'Theo tháng', columns: [{ key: 'month', label: 'Tháng' }], rows: [{ month: '2026-09' }] }],
      columns: [], rows: [],
    });
    expect(csv).toContain('Tổng lập hóa đơn (VND),1000000');
    expect(csv).toContain('Theo tháng\r\nTháng\r\n2026-09');
  });

  it('rejects exports over the centralized row cap', () => {
    expect(() => assertExportBounds(CSV_ROW_CAP)).not.toThrow();
    expect(() => assertExportBounds(CSV_ROW_CAP + 1)).toThrow(BadRequestException);
  });
});
