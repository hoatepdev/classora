import { describe, expect, it } from 'vitest';
import { formatScore, parseScore, scorePercentage } from '../src/progress/score.js';
describe('exact progress scores',()=>{
  it('parses and formats exact scale-2 decimal strings',()=>{expect(parseScore('0')).toBe(0);expect(parseScore('12.34')).toBe(1234);expect(formatScore(1234)).toBe('12.34');});
  it('rejects invalid precision and syntax',()=>{for(const value of ['1.234','-1','1e2','.5','1000000']) expect(parseScore(value)).toBeNull();});
  it('rounds normalized percentages to two decimals',()=>expect(scorePercentage(2,3)).toBe(66.67));
});
