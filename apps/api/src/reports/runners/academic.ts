import type { Pool } from 'pg';
import type { ReportBreakdown, ReportColumn, ReportContext, ReportResult, ReportRow } from '../report-filters.js';
import { pageParams, rate, round2, serialize } from '../report-filters.js';
import { CSV_ROW_CAP } from '../report-csv.js';

const OPERATIONAL = `('PENDING','TRIAL','ACTIVE','PAUSED')`;
const ATTENDED_STATUSES = `('PRESENT','LATE','ONLINE','MAKEUP')`;
const ABSENT_STATUSES = `('ABSENT_EXCUSED','ABSENT_UNEXCUSED')`;

// class-scoped NULL-or filter block; params: branch, course, level, class
const classFilters = `
  AND ($n1::text IS NULL OR c.branch_id=$n1)
  AND ($n2::text IS NULL OR c.course_id=$n2)
  AND ($n3::text IS NULL OR c.course_level_id=$n3)
  AND ($n4::text IS NULL OR c.id=$n4)`;

function withClassFilters(start: number, filters: { branchId?: string; courseId?: string; courseLevelId?: string; classId?: string }) {
  return {
    sql: classFilters.replaceAll('$n1', `$${start}`).replaceAll('$n2', `$${start + 1}`).replaceAll('$n3', `$${start + 2}`).replaceAll('$n4', `$${start + 3}`),
    values: [filters.branchId ?? null, filters.courseId ?? null, filters.courseLevelId ?? null, filters.classId ?? null],
  };
}

const attendanceRate = (attended: number, absent: number) => rate(attended, attended + absent);

// Latest event to_status strictly before the boundary — reconstructs historical
// enrollment status without using today's status as historical truth.
const statusAtSql = (param: string) => `COALESCE((SELECT ev.to_status FROM enrollment_events ev
  WHERE ev.tenant_id=e.tenant_id AND ev.enrollment_id=e.id AND ev.occurred_at < ${param}::timestamptz
  ORDER BY ev.occurred_at DESC, ev.id DESC LIMIT 1), e.status)`;

export async function studentsEnrollmentsReport(ctx: ReportContext): Promise<ReportResult> {
  const { pool, tenantId, scope } = ctx;
  const f = scope.filters;
  const cf = withClassFilters(5, f);
  const enrollmentFrom = `
    FROM enrollments e
    JOIN students s ON s.tenant_id=e.tenant_id AND s.id=e.student_id
    JOIN classes c ON c.tenant_id=e.tenant_id AND c.id=e.class_id
    LEFT JOIN courses co ON co.tenant_id=c.tenant_id AND co.id=c.course_id
    LEFT JOIN course_levels cl ON cl.tenant_id=c.tenant_id AND cl.id=c.course_level_id
    LEFT JOIN branches b ON b.tenant_id=c.tenant_id AND b.id=c.branch_id
    WHERE e.tenant_id=$1 AND e.enrolled_at >= $2::timestamptz AND e.enrolled_at < $3::timestamptz
      AND ($4::text IS NULL OR e.student_id=$4)
      ${cf.sql}`;
  const enrollmentValues = [tenantId, scope.fromTs, scope.toTs, f.studentId ?? null, ...cf.values];

  const { limit, offset } = pageParams(ctx);
  const hasClassScope = Boolean(f.branchId || f.courseId || f.courseLevelId || f.classId);
  const [newStudents, events, statusCounts, detail] = await Promise.all([
    pool.query<{ count: number }>(
      // With class-scope filters, count only students tied to matching classes
      // so the summary reflects the same scope as the detail rows.
      `SELECT COUNT(*)::int AS count FROM students s WHERE s.tenant_id=$1 AND s.created_at >= $2::timestamptz AND s.created_at < $3::timestamptz AND ($4::text IS NULL OR s.id=$4)${
        hasClassScope
          ? ` AND EXISTS (SELECT 1 FROM enrollments e JOIN classes c ON c.tenant_id=e.tenant_id AND c.id=e.class_id
             WHERE e.tenant_id=s.tenant_id AND e.student_id=s.id AND ($5::text IS NULL OR c.branch_id=$5)
               AND ($6::text IS NULL OR c.course_id=$6) AND ($7::text IS NULL OR c.course_level_id=$7) AND ($8::text IS NULL OR e.class_id=$8))`
          : ''
      }`,
      [tenantId, scope.fromTs, scope.toTs, f.studentId ?? null, ...(hasClassScope ? cf.values : [])],
    ),
    pool.query<{ type: string; count: number }>(
      `SELECT ev.type, COUNT(*)::int AS count FROM enrollment_events ev
       JOIN enrollments e ON e.tenant_id=ev.tenant_id AND e.id=ev.enrollment_id
       JOIN classes c ON c.tenant_id=e.tenant_id AND c.id=e.class_id
       WHERE ev.tenant_id=$1 AND ev.occurred_at >= $2::timestamptz AND ev.occurred_at < $3::timestamptz
         AND ($4::text IS NULL OR e.student_id=$4) ${cf.sql}
       GROUP BY ev.type ORDER BY ev.type`,
      [tenantId, scope.fromTs, scope.toTs, f.studentId ?? null, ...cf.values],
    ),
    pool.query<{ status: string; count: number }>(
      `SELECT ${statusAtSql('$9')} AS status, COUNT(*)::int AS count ${enrollmentFrom} GROUP BY 1 ORDER BY 1`,
      [...enrollmentValues, scope.toTs],
    ),
    pool.query(`
      SELECT t.* FROM (
        SELECT s.id AS "studentId", s.full_name AS "student", c.id AS "classId", c.name AS "class",
               co.name AS "course", cl.name AS "level", b.name AS "branch", ${statusAtSql('$9')} AS "status",
               e.enrolled_at AS "enrolledAt", e.started_at AS "startedAt", e.ended_at AS "endedAt",
               e.expected_end_date::text AS "expectedEndDate"
        ${enrollmentFrom}
      ) t
      WHERE ($10::text IS NULL OR t."status"=$10)
      ORDER BY t."enrolledAt" DESC, t."studentId" DESC
      LIMIT $11 OFFSET $12`,
      [...enrollmentValues, scope.toTs, f.status ?? null, limit, offset]),
  ]);

  const rows = detail.rows.map((row) => serialize(row as Record<string, unknown>)) as ReportRow[];
  const statusCountsMap = Object.fromEntries(statusCounts.rows.map((row) => [row.status, row.count]));
  const total = f.status ? Number(statusCountsMap[f.status] ?? 0) : Object.values(statusCountsMap).reduce((sum, count) => sum + Number(count), 0);
  const columns: ReportColumn[] = [
    { key: 'student', label: 'Học viên' },
    { key: 'class', label: 'Lớp học' },
    { key: 'course', label: 'Khóa học' },
    { key: 'level', label: 'Cấp độ' },
    { key: 'branch', label: 'Chi nhánh' },
    { key: 'status', label: 'Trạng thái' },
    { key: 'enrolledAt', label: 'Ngày ghi danh' },
    { key: 'startedAt', label: 'Ngày bắt đầu' },
    { key: 'endedAt', label: 'Ngày kết thúc' },
    { key: 'expectedEndDate', label: 'Dự kiến kết thúc' },
  ];
  return {
    summary: {
      newStudents: newStudents.rows[0]?.count ?? 0,
      enrollmentsInPeriod: total,
      events: Object.fromEntries(events.rows.map((row) => [row.type, row.count])),
      statusAtEnd: statusCountsMap,
    },
    columns,
    rows,
    paginated: true,
    total,
  };
}

const attendanceColumns: ReportColumn[] = [
  { key: 'sessionDate', label: 'Ngày học' },
  { key: 'className', label: 'Lớp học' },
  { key: 'student', label: 'Học viên' },
  { key: 'teacher', label: 'Giáo viên' },
  { key: 'status', label: 'Trạng thái' },
];

export async function attendanceReport(ctx: ReportContext): Promise<ReportResult> {
  const { pool, tenantId, scope } = ctx;
  const f = scope.filters;
  const base = `
    FROM attendance_records r
    JOIN attendance_sheets sh ON sh.tenant_id=r.tenant_id AND sh.session_id=r.session_id AND sh.status='LOCKED'
    JOIN attendance_sessions a ON a.tenant_id=r.tenant_id AND a.id=r.session_id
    JOIN classes c ON c.tenant_id=a.tenant_id AND c.id=a.class_id
    JOIN students s2 ON s2.tenant_id=r.tenant_id AND s2.id=r.student_id
    LEFT JOIN teachers t ON t.tenant_id=a.tenant_id AND t.id=a.teacher_id
    LEFT JOIN branches b ON b.tenant_id=a.tenant_id AND b.id=a.branch_id
    WHERE r.tenant_id=$1 AND a.session_date >= $2::date AND a.session_date <= $3::date AND r.status <> 'UNMARKED'
      AND ($4::text IS NULL OR a.branch_id=$4)
      AND ($5::text IS NULL OR c.course_id=$5)
      AND ($6::text IS NULL OR c.course_level_id=$6)
      AND ($7::text IS NULL OR a.class_id=$7)
      AND ($8::text IS NULL OR a.teacher_id=$8)
      AND ($9::text IS NULL OR r.student_id=$9)
      AND ($10::text IS NULL OR r.status=$10)`;
  const values = [tenantId, scope.from, scope.to, f.branchId ?? null, f.courseId ?? null, f.courseLevelId ?? null, f.classId ?? null, f.teacherId ?? null, f.studentId ?? null, f.status ?? null];
  const counts = `COUNT(*) FILTER (WHERE r.status IN ${ATTENDED_STATUSES})::int AS attended,
       COUNT(*) FILTER (WHERE r.status IN ${ABSENT_STATUSES})::int AS absent,
       COUNT(*) FILTER (WHERE r.status='LATE')::int AS late`;

  const { limit, offset } = pageParams(ctx);
  const [summary, byClass, byStudent, byTeacher, byBranch, count, detail] = await Promise.all([
    pool.query(`SELECT COUNT(DISTINCT a.id)::int AS "sessionsFinalized", COUNT(*)::int AS records, ${counts} ${base}`, values),
    pool.query(`SELECT c.id AS "id", c.name AS "name", ${counts} ${base} GROUP BY c.id, c.name ORDER BY c.name`, values),
    pool.query(`SELECT s2.id AS "id", s2.full_name AS "name", ${counts} ${base}
                GROUP BY s2.id, s2.full_name ORDER BY s2.full_name`, values),
    pool.query(`SELECT t.id AS "id", t.name AS "name", ${counts} ${base}
                AND t.id IS NOT NULL GROUP BY t.id, t.name ORDER BY t.name`, values),
    pool.query(`SELECT b.id AS "id", b.name AS "name", ${counts} ${base}
                AND b.id IS NOT NULL GROUP BY b.id, b.name ORDER BY b.name`, values),
    pool.query(`SELECT COUNT(*)::int AS count ${base}`, values),
    pool.query(`
      SELECT a.session_date::text AS "sessionDate", c.name AS "className", s2.full_name AS "student",
             t.name AS "teacher", r.status AS "status"
      ${base}
      ORDER BY a.session_date DESC, a.start_time DESC, s2.full_name, r.id
      LIMIT $11 OFFSET $12`,
      [...values, limit, offset]),
  ]);

  const s = summary.rows[0] ?? { sessionsFinalized: 0, records: 0, attended: 0, absent: 0, late: 0 };
  const breakdownColumns: ReportColumn[] = [
    { key: 'name', label: 'Tên' },
    { key: 'attended', label: 'Đi học' },
    { key: 'absent', label: 'Vắng' },
    { key: 'total', label: 'Tổng' },
    { key: 'rate', label: 'Tỷ lệ (%)' },
  ];
  const toBreakdown = (name: string, rows: { id: string; name: string; attended: number; absent: number }[]): ReportBreakdown => ({
    name,
    columns: breakdownColumns,
    rows: rows.map((row) => ({ id: row.id, name: row.name, attended: row.attended, absent: row.absent, total: row.attended + row.absent, rate: attendanceRate(row.attended, row.absent) })),
  });

  const detailRows = detail.rows.map((row) => serialize(row as Record<string, unknown>)) as ReportRow[];
  return {
    summary: {
      sessionsFinalized: s.sessionsFinalized,
      records: s.records,
      attended: s.attended,
      absent: s.absent,
      late: s.late,
      attendanceRate: attendanceRate(s.attended, s.absent),
    },
    breakdowns: [toBreakdown('Theo lớp học', byClass.rows), toBreakdown('Theo học viên', byStudent.rows), toBreakdown('Theo giáo viên', byTeacher.rows), toBreakdown('Theo chi nhánh', byBranch.rows)],
    columns: attendanceColumns,
    rows: detailRows,
    paginated: true,
    total: Number(count.rows[0]?.count ?? 0),
  };
}

export async function classUtilizationReport(ctx: ReportContext): Promise<ReportResult> {
  const { pool, tenantId, scope } = ctx;
  const f = scope.filters;
  const cf = withClassFilters(2, f);
  const bounded = ctx.mode === 'export';
  const result = await pool.query(`
    SELECT c.id AS "classId", c.name AS "class", c.status AS "status", c.capacity AS "capacity",
           co.name AS "course", cl.name AS "level", b.name AS "branch",
           (SELECT COUNT(*)::int FROM enrollments e WHERE e.tenant_id=c.tenant_id AND e.class_id=c.id AND e.status IN ${OPERATIONAL}) AS "operational",
           (SELECT COUNT(*) FILTER (WHERE a.status='SCHEDULED')::int FROM attendance_sessions a WHERE a.tenant_id=c.tenant_id AND a.class_id=c.id AND a.session_date >= $6::date AND a.session_date <= $7::date) AS "scheduledSessions",
           (SELECT COUNT(*) FILTER (WHERE a.status='COMPLETED')::int FROM attendance_sessions a WHERE a.tenant_id=c.tenant_id AND a.class_id=c.id AND a.session_date >= $6::date AND a.session_date <= $7::date) AS "completedSessions",
           (SELECT COUNT(*) FILTER (WHERE a.status='CANCELLED')::int FROM attendance_sessions a WHERE a.tenant_id=c.tenant_id AND a.class_id=c.id AND a.session_date >= $6::date AND a.session_date <= $7::date) AS "cancelledSessions",
           (SELECT COUNT(*) FILTER (WHERE a.status='RESCHEDULED')::int FROM attendance_sessions a WHERE a.tenant_id=c.tenant_id AND a.class_id=c.id AND a.session_date >= $6::date AND a.session_date <= $7::date) AS "rescheduledSessions"
    FROM classes c
    LEFT JOIN courses co ON co.tenant_id=c.tenant_id AND co.id=c.course_id
    LEFT JOIN course_levels cl ON cl.tenant_id=c.tenant_id AND cl.id=c.course_level_id
    LEFT JOIN branches b ON b.tenant_id=c.tenant_id AND b.id=c.branch_id
    WHERE c.tenant_id=$1 ${cf.sql}
    ORDER BY c.name, c.id${bounded ? ' LIMIT $8' : ''}`,
    [tenantId, ...cf.values, scope.from, scope.to, ...(bounded ? [CSV_ROW_CAP + 1] : [])]);

  const rows: ReportRow[] = result.rows.map((row) => {
    const capacity = row.capacity == null ? null : Number(row.capacity);
    const operational = Number(row.operational);
    return {
      classId: row.classId,
      class: row.class,
      status: row.status,
      course: row.course,
      level: row.level,
      branch: row.branch,
      capacity,
      operational,
      // capacity=null is unlimited: N/A, never a fake 0%.
      occupancyPct: capacity == null ? null : round2((operational * 100) / capacity),
      scheduledSessions: Number(row.scheduledSessions),
      completedSessions: Number(row.completedSessions),
      cancelledSessions: Number(row.cancelledSessions),
      rescheduledSessions: Number(row.rescheduledSessions),
    };
  });
  const withCapacity = rows.filter((row) => row.capacity != null);
  return {
    summary: {
      classes: rows.length,
      operationalEnrollments: rows.reduce((sum, row) => sum + Number(row.operational), 0),
      avgOccupancyPct: withCapacity.length === 0 ? null : round2(withCapacity.reduce((sum, row) => sum + Number(row.occupancyPct), 0) / withCapacity.length),
      completedSessions: rows.reduce((sum, row) => sum + Number(row.completedSessions), 0),
      cancelledSessions: rows.reduce((sum, row) => sum + Number(row.cancelledSessions), 0),
    },
    columns: [
      { key: 'class', label: 'Lớp học' },
      { key: 'course', label: 'Khóa học' },
      { key: 'level', label: 'Cấp độ' },
      { key: 'branch', label: 'Chi nhánh' },
      { key: 'capacity', label: 'Sức chứa' },
      { key: 'operational', label: 'Đang học' },
      { key: 'occupancyPct', label: 'Tỷ lệ lấp đầy (%)' },
      { key: 'scheduledSessions', label: 'Buổi dự kiến' },
      { key: 'completedSessions', label: 'Buổi hoàn thành' },
      { key: 'cancelledSessions', label: 'Buổi hủy' },
      { key: 'rescheduledSessions', label: 'Buổi đổi lịch' },
    ],
    rows,
    paginated: false,
  };
}

export async function teacherWorkloadReport(ctx: ReportContext): Promise<ReportResult> {
  const { pool, tenantId, scope } = ctx;
  const f = scope.filters;
  const result = await pool.query(`
    SELECT t.id AS "teacherId", t.name AS "teacher",
           COUNT(*) FILTER (WHERE a.status='COMPLETED')::int AS "completedSessions",
           COUNT(*) FILTER (WHERE a.status='CANCELLED')::int AS "cancelledSessions",
           COALESCE(SUM(EXTRACT(EPOCH FROM (a.end_time - a.start_time)) / 60) FILTER (WHERE a.status='COMPLETED'), 0)::int AS "minutes",
           COUNT(DISTINCT a.class_id) FILTER (WHERE a.status='COMPLETED')::int AS "classesTaught"
    FROM attendance_sessions a
    JOIN teachers t ON t.tenant_id=a.tenant_id AND t.id=a.teacher_id
    JOIN classes c ON c.tenant_id=a.tenant_id AND c.id=a.class_id
    WHERE a.tenant_id=$1 AND a.session_date >= $2::date AND a.session_date <= $3::date
      AND ($4::text IS NULL OR a.teacher_id=$4)
      AND ($5::text IS NULL OR c.branch_id=$5)
      AND ($6::text IS NULL OR c.course_id=$6)
      AND ($7::text IS NULL OR a.class_id=$7)
    GROUP BY t.id, t.name
    ORDER BY "minutes" DESC, t.name${ctx.mode === 'export' ? ' LIMIT $8' : ''}`,
    [tenantId, scope.from, scope.to, f.teacherId ?? null, f.branchId ?? null, f.courseId ?? null, f.classId ?? null, ...(ctx.mode === 'export' ? [CSV_ROW_CAP + 1] : [])]);

  const rows: ReportRow[] = result.rows.map((row) => ({
    teacherId: row.teacherId,
    teacher: row.teacher,
    completedSessions: Number(row.completedSessions),
    teachingMinutes: Number(row.minutes),
    teachingHours: round2(Number(row.minutes) / 60),
    classesTaught: Number(row.classesTaught),
    cancelledSessions: Number(row.cancelledSessions),
  }));
  return {
    summary: {
      teachers: rows.length,
      completedSessions: rows.reduce((sum, row) => sum + Number(row.completedSessions), 0),
      teachingMinutes: rows.reduce((sum, row) => sum + Number(row.teachingMinutes), 0),
      cancelledSessions: rows.reduce((sum, row) => sum + Number(row.cancelledSessions), 0),
    },
    columns: [
      { key: 'teacher', label: 'Giáo viên' },
      { key: 'completedSessions', label: 'Buổi đã dạy' },
      { key: 'teachingMinutes', label: 'Phút dạy' },
      { key: 'teachingHours', label: 'Giờ dạy' },
      { key: 'classesTaught', label: 'Số lớp' },
      { key: 'cancelledSessions', label: 'Buổi hủy' },
    ],
    rows,
    paginated: false,
  };
}

export async function progressReport(ctx: ReportContext): Promise<ReportResult> {
  const { pool, tenantId, scope } = ctx;
  const f = scope.filters;
  const cf = withClassFilters(3, f);
  const result = await pool.query(`
    WITH scoped AS (
      SELECT DISTINCT ON (e.student_id,e.class_id) e.tenant_id,e.student_id,e.class_id,e.status
      FROM enrollments e
      JOIN classes c ON c.tenant_id=e.tenant_id AND c.id=e.class_id
      WHERE e.tenant_id=$1 AND ($2::text IS NULL OR e.student_id=$2)
        AND e.status <> 'CANCELLED' ${cf.sql}
      ORDER BY e.student_id,e.class_id,e.updated_at DESC,e.id DESC
    )
    SELECT s.id AS "studentId", s.full_name AS "student", c.id AS "classId", c.name AS "class", b.name AS "branch", e.status AS "enrollmentStatus",
           (SELECT COUNT(*)::int FROM assessment_results r JOIN assessments a2 ON a2.tenant_id=r.tenant_id AND a2.id=r.assessment_id
             WHERE r.tenant_id=e.tenant_id AND r.student_id=e.student_id AND a2.class_id=e.class_id AND a2.status='PUBLISHED' AND r.status='GRADED'
               AND a2.assessment_date >= $7::date AND a2.assessment_date <= $8::date) AS "gradedCount",
           (SELECT COUNT(*)::int FROM assessment_results r JOIN assessments a2 ON a2.tenant_id=r.tenant_id AND a2.id=r.assessment_id
             WHERE r.tenant_id=e.tenant_id AND r.student_id=e.student_id AND a2.class_id=e.class_id AND a2.status='PUBLISHED' AND r.status='EXEMPT'
               AND a2.assessment_date >= $7::date AND a2.assessment_date <= $8::date) AS "exemptCount",
           (SELECT AVG(r.score / a2.max_score * 100) FROM assessment_results r JOIN assessments a2 ON a2.tenant_id=r.tenant_id AND a2.id=r.assessment_id
             WHERE r.tenant_id=e.tenant_id AND r.student_id=e.student_id AND a2.class_id=e.class_id AND a2.status='PUBLISHED' AND r.status='GRADED'
               AND a2.assessment_date >= $7::date AND a2.assessment_date <= $8::date) AS "averageRaw",
           (SELECT COUNT(*) FILTER (WHERE r2.status IN ${ATTENDED_STATUSES})::int FROM attendance_records r2
             JOIN attendance_sheets sh2 ON sh2.tenant_id=r2.tenant_id AND sh2.session_id=r2.session_id AND sh2.status='LOCKED'
             JOIN attendance_sessions a3 ON a3.tenant_id=r2.tenant_id AND a3.id=r2.session_id
             WHERE r2.tenant_id=e.tenant_id AND r2.student_id=e.student_id AND a3.class_id=e.class_id
               AND a3.session_date >= $7::date AND a3.session_date <= $8::date AND r2.status <> 'UNMARKED') AS "attendedCount",
           (SELECT COUNT(*) FILTER (WHERE r2.status IN ${ABSENT_STATUSES})::int FROM attendance_records r2
             JOIN attendance_sheets sh2 ON sh2.tenant_id=r2.tenant_id AND sh2.session_id=r2.session_id AND sh2.status='LOCKED'
             JOIN attendance_sessions a3 ON a3.tenant_id=r2.tenant_id AND a3.id=r2.session_id
             WHERE r2.tenant_id=e.tenant_id AND r2.student_id=e.student_id AND a3.class_id=e.class_id
               AND a3.session_date >= $7::date AND a3.session_date <= $8::date AND r2.status <> 'UNMARKED') AS "absentCount",
           (SELECT COUNT(*)::int FROM progress_reports pr WHERE pr.tenant_id=e.tenant_id AND pr.student_id=e.student_id AND pr.class_id=e.class_id
             AND pr.status='PUBLISHED' AND pr.published_at >= $9::timestamptz AND pr.published_at < $10::timestamptz) AS "publishedReports"
    FROM scoped e
    JOIN students s ON s.tenant_id=e.tenant_id AND s.id=e.student_id
    JOIN classes c ON c.tenant_id=e.tenant_id AND c.id=e.class_id
    LEFT JOIN branches b ON b.tenant_id=c.tenant_id AND b.id=c.branch_id
    ORDER BY s.full_name,c.name,e.student_id,e.class_id${ctx.mode === 'export' ? ' LIMIT $11' : ''}`,
    [tenantId, f.studentId ?? null, ...cf.values, scope.from, scope.to, scope.fromTs, scope.toTs, ...(ctx.mode === 'export' ? [CSV_ROW_CAP + 1] : [])]);

  const rows: ReportRow[] = result.rows.map((row) => ({
    studentId: row.studentId,
    student: row.student,
    classId: row.classId,
    class: row.class,
    branch: row.branch,
    enrollmentStatus: row.enrollmentStatus,
    gradedCount: Number(row.gradedCount),
    exemptCount: Number(row.exemptCount),
    average: row.averageRaw == null ? null : round2(Number(row.averageRaw)),
    attendanceRate: attendanceRate(Number(row.attendedCount), Number(row.absentCount)),
    publishedReports: Number(row.publishedReports),
  }));
  const graded = rows.filter((row) => Number(row.gradedCount) > 0);
  return {
    summary: {
      students: rows.length,
      gradedAssessments: rows.reduce((sum, row) => sum + Number(row.gradedCount), 0),
      avgScore: graded.length === 0 ? null : round2(graded.reduce((sum, row) => sum + Number(row.average ?? 0), 0) / graded.length),
      publishedReports: rows.reduce((sum, row) => sum + Number(row.publishedReports), 0),
    },
    columns: [
      { key: 'student', label: 'Học viên' },
      { key: 'class', label: 'Lớp học' },
      { key: 'branch', label: 'Chi nhánh' },
      { key: 'gradedCount', label: 'Bài đã chấm' },
      { key: 'average', label: 'Điểm trung bình (%)' },
      { key: 'exemptCount', label: 'Miễn đánh giá' },
      { key: 'attendanceRate', label: 'Tỷ lệ chuyên cần (%)' },
      { key: 'publishedReports', label: 'Phát hành báo cáo' },
    ],
    rows,
    paginated: false,
  };
}

export async function reenrollmentReport(ctx: ReportContext): Promise<ReportResult> {
  const { pool, tenantId, scope } = ctx;
  const f = scope.filters;
  const cf = withClassFilters(5, f);
  const cohort = `
    FROM (SELECT DISTINCT ON (tenant_id,enrollment_id) * FROM enrollment_events
          WHERE type='COMPLETED' ORDER BY tenant_id,enrollment_id,occurred_at,id) ev
    JOIN enrollments src ON src.tenant_id=ev.tenant_id AND src.id=ev.enrollment_id
    JOIN students s ON s.tenant_id=src.tenant_id AND s.id=src.student_id
    JOIN classes c ON c.tenant_id=src.tenant_id AND c.id=src.class_id
    WHERE ev.tenant_id=$1 AND ev.type='COMPLETED' AND ev.occurred_at >= $2::timestamptz AND ev.occurred_at < $3::timestamptz
      AND ($4::text IS NULL OR src.student_id=$4) ${cf.sql}`;
  const cohortValues = [tenantId, scope.fromTs, scope.toTs, f.studentId ?? null, ...cf.values];

  const { limit, offset } = pageParams(ctx);
  const [summary, detail] = await Promise.all([
    pool.query<{ total: number; reenrolled: number }>(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM enrollment_events ev2
                JOIN enrollments d ON d.tenant_id=ev2.tenant_id AND d.id=ev2.enrollment_id
                WHERE ev2.tenant_id=$1 AND ev2.type='REENROLLED' AND d.source_enrollment_id=src.id
                  AND ev2.occurred_at >= ev.occurred_at AND ev2.occurred_at < $3::timestamptz))::int AS reenrolled
       ${cohort}`,
      cohortValues,
    ),
    pool.query(`
      SELECT s.full_name AS "student", s.id AS "studentId", c.name AS "class", src.id AS "enrollmentId",
             ev.occurred_at AS "completedAt",
             (SELECT ev2.occurred_at FROM enrollment_events ev2
              JOIN enrollments d ON d.tenant_id=ev2.tenant_id AND d.id=ev2.enrollment_id
              JOIN classes c2 ON c2.tenant_id=d.tenant_id AND c2.id=d.class_id
              WHERE ev2.tenant_id=$1 AND ev2.type='REENROLLED' AND d.source_enrollment_id=src.id
                AND ev2.occurred_at >= ev.occurred_at AND ev2.occurred_at < $3::timestamptz
              ORDER BY ev2.occurred_at ASC LIMIT 1) AS "reenrolledAt",
             (SELECT c2.name FROM enrollment_events ev2
              JOIN enrollments d ON d.tenant_id=ev2.tenant_id AND d.id=ev2.enrollment_id
              JOIN classes c2 ON c2.tenant_id=d.tenant_id AND c2.id=d.class_id
              WHERE ev2.tenant_id=$1 AND ev2.type='REENROLLED' AND d.source_enrollment_id=src.id
                AND ev2.occurred_at >= ev.occurred_at AND ev2.occurred_at < $3::timestamptz
              ORDER BY ev2.occurred_at ASC LIMIT 1) AS "reenrolledClass"
      ${cohort}
      ORDER BY ev.occurred_at DESC, src.id DESC
      LIMIT $9 OFFSET $10`,
      [...cohortValues, limit, offset]),
  ]);

  const total = Number(summary.rows[0]?.total ?? 0);
  const reenrolled = Number(summary.rows[0]?.reenrolled ?? 0);
  const rows = detail.rows.map((row) => serialize(row as Record<string, unknown>)) as ReportRow[];
  return {
    summary: {
      cohortSize: total,
      reEnrolled: reenrolled,
      // null (not 0) when the cohort is empty.
      reEnrollmentRate: total === 0 ? null : round2((reenrolled * 100) / total),
    },
    columns: [
      { key: 'student', label: 'Học viên' },
      { key: 'class', label: 'Lớp hoàn thành' },
      { key: 'completedAt', label: 'Ngày hoàn thành' },
      { key: 'reenrolledAt', label: 'Ngày ghi danh lại' },
      { key: 'reenrolledClass', label: 'Lớp ghi danh lại' },
    ],
    rows,
    paginated: true,
    total,
  };
}
