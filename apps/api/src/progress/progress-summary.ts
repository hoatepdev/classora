import type { QueryResultRow } from 'pg';
import { attendanceSummary } from '../attendance/attendance-summary.js';

type Queryable = { query: <T extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };
type SummaryScope = { classId?: string; periodStart?: string; periodEnd?: string };

// Staff, report snapshots and Portal all call this function. Attendance uses
// LOCAL-07's locked-record formula; assessment averages only include
// PUBLISHED + GRADED results and are normalized in PostgreSQL NUMERIC math.
export async function studentProgressSummary(
  pool: Queryable,
  tenantId: string,
  studentId: string,
  scope: SummaryScope = {},
) {
  const values: unknown[] = [tenantId, studentId];
  const attendanceFilters: string[] = [];
  const assessmentFilters: string[] = [];
  if (scope.classId) {
    values.push(scope.classId);
    attendanceFilters.push(`a.class_id=$${values.length}`);
    assessmentFilters.push(`a.class_id=$${values.length}`);
  }
  if (scope.periodStart) {
    values.push(scope.periodStart);
    attendanceFilters.push(`a.session_date >= $${values.length}::date`);
    assessmentFilters.push(`a.assessment_date >= $${values.length}::date`);
  }
  if (scope.periodEnd) {
    values.push(scope.periodEnd);
    attendanceFilters.push(`a.session_date <= $${values.length}::date`);
    assessmentFilters.push(`a.assessment_date <= $${values.length}::date`);
  }
  const attendanceWhere = attendanceFilters.length ? ` AND ${attendanceFilters.join(' AND ')}` : '';
  const assessmentWhere = assessmentFilters.length ? ` AND ${assessmentFilters.join(' AND ')}` : '';
  const [attendanceRows, assessmentRows] = await Promise.all([
    pool.query<{ status: string }>(
      `SELECT r.status FROM attendance_records r
       JOIN attendance_sheets sh ON sh.tenant_id=r.tenant_id AND sh.session_id=r.session_id AND sh.status='LOCKED'
       JOIN attendance_sessions a ON a.tenant_id=r.tenant_id AND a.id=r.session_id
       WHERE r.tenant_id=$1 AND r.student_id=$2${attendanceWhere}`,
      values,
    ),
    pool.query<{ gradedCount: number; exemptCount: number; average: string | null }>(
      `SELECT
         COUNT(r.id) FILTER (WHERE r.status='GRADED')::int AS "gradedCount",
         COUNT(r.id) FILTER (WHERE r.status='EXEMPT')::int AS "exemptCount",
         AVG(CASE WHEN r.status='GRADED' THEN r.score / a.max_score * 100 END)::text AS average
       FROM assessment_results r
       JOIN assessments a ON a.tenant_id=r.tenant_id AND a.id=r.assessment_id AND a.status='PUBLISHED'
       WHERE r.tenant_id=$1 AND r.student_id=$2${assessmentWhere}`,
      values,
    ),
  ]);
  const attendance = attendanceSummary(attendanceRows.rows.map((row) => row.status));
  const assessment = assessmentRows.rows[0];
  const average = assessment.average === null ? null : Math.round(Number(assessment.average) * 100) / 100;
  return {
    attendance,
    attendanceRate: attendance.percentage,
    completedSessions: attendance.total,
    totalOperationalSessions: attendance.total,
    assessment: {
      gradedCount: assessment.gradedCount,
      exemptCount: assessment.exemptCount,
      averagePercentage: average,
    },
    assessmentAverage: average,
    gradedAssessmentCount: assessment.gradedCount,
  };
}
