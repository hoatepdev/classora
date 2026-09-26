import { ConflictException, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { ledgerCreditSql, ledgerPaidSql } from '../billing/billing-ledger.js';
import type { SafeContext } from './communication.renderer.js';

export const COMMUNICATION_EVENT_TYPES = [
  'SESSION_REMINDER',
  'SCHEDULE_CHANGED',
  'ATTENDANCE_ABSENCE',
  'TUITION_DUE',
  'TUITION_OVERDUE',
  'PAYMENT_RECEIVED',
  'TRIAL_REMINDER',
  'ENROLLMENT_EXPIRING',
] as const;

export type CommunicationEventType = (typeof COMMUNICATION_EVENT_TYPES)[number];
export type CommunicationTiming = 'IMMEDIATE' | 'TIME_BASED';
export type CommunicationChannel = 'IN_APP' | 'EMAIL';
export type CommunicationRecipientType = 'STUDENT' | 'GUARDIAN' | 'LEAD' | 'MEMBERSHIP';

export type Recipient = {
  type: CommunicationRecipientType;
  id: string | null;
  name: string;
  email: string | null;
};

// One plan per resolved recipient. Contexts are flat string maps built here
// from allowlisted columns; domain objects never reach the renderer.
export type MessagePlan = {
  recipient: Recipient;
  context: SafeContext;
  relatedEntityType: string;
  relatedEntityId: string;
  dedupeScope?: string;
};

export type TemplateContent = { subject: string | null; body: string };

export type VariableSpec = { name: string; required: boolean };

export type EventDefinition = {
  eventType: CommunicationEventType;
  timing: CommunicationTiming;
  slug: string;
  variables: readonly VariableSpec[];
  defaults: Readonly<Record<CommunicationChannel, TemplateContent>>;
  buildPlans(client: PoolClient, tenantId: string, sourceEntityId: string, dedupeScope?: string): Promise<MessagePlan[]>;
};

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const communicationDedupeKey = (input: {
  slug: string;
  sourceEntityId: string;
  scope?: string;
  recipient: Recipient;
  channel: CommunicationChannel;
}) =>
  [
    input.slug,
    input.sourceEntityId,
    input.scope ?? 'default',
    input.channel === 'EMAIL' && input.recipient.email ? `mail:${normalizeEmail(input.recipient.email)}` : `${input.recipient.type}:${input.recipient.id ?? '-'}`,
    input.channel,
  ].join(':');

const formatVnd = (value: string) => `${new Intl.NumberFormat('vi-VN').format(BigInt(value))} ₫`;

const formatDate = (value: string | Date | null | undefined) => {
  if (value === null || value === undefined || value === '') return '';
  const iso = typeof value === 'string' ? value : value.toISOString();
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

const formatTime = (value: string | null | undefined) => (value ? value.slice(0, 5) : '');

const PAYMENT_METHODS: Record<string, string> = {
  CASH: 'Tiền mặt',
  BANK_TRANSFER: 'Chuyển khoản',
  CARD: 'Thẻ',
  OTHER: 'Khác',
};

const withRecipientName = (context: SafeContext, recipient: Recipient): SafeContext => ({
  ...context,
  guardianName: recipient.name || context.studentName || 'Quý phụ huynh',
});

type GuardianLink = { guardianId: string; guardianName: string; guardianEmail: string | null; isPrimary: boolean; isBilling: boolean };

async function guardiansForStudent(client: PoolClient, tenantId: string, studentId: string): Promise<GuardianLink[]> {
  const rows = await client.query<GuardianLink>(
    `SELECT g.id AS "guardianId", g.full_name AS "guardianName", g.email AS "guardianEmail",
            sg.is_primary_contact AS "isPrimary", sg.is_billing_contact AS "isBilling"
     FROM student_guardians sg JOIN guardians g ON g.tenant_id = sg.tenant_id AND g.id = sg.guardian_id
     WHERE sg.tenant_id = $1 AND sg.student_id = $2
     ORDER BY sg.is_primary_contact DESC, g.full_name, g.id`,
    [tenantId, studentId],
  );
  return rows.rows;
}

// Billing rule: billing-contact guardians, else the primary guardian, else the
// student's own contact. Financial details never go to unrelated guardians.
function billingRecipients(guardians: GuardianLink[], student: { id: string; fullName: string; email: string | null }): Recipient[] {
  const billing = guardians.filter((g) => g.isBilling);
  const chosen = billing.length > 0 ? billing : guardians.filter((g) => g.isPrimary);
  if (chosen.length > 0) return chosen.map((g) => ({ type: 'GUARDIAN', id: g.guardianId, name: g.guardianName, email: g.guardianEmail }));
  // Student fallback stays a recipient without an email: EMAIL is skipped by the
  // missing-destination rule while IN_APP still lands on the student entity.
  return [{ type: 'STUDENT', id: student.id, name: student.fullName, email: student.email }];
}

// Academic rule: the primary guardian, else the student's own contact.
function academicRecipients(guardians: GuardianLink[], student: { id: string; fullName: string; email: string | null }): Recipient[] {
  const primary = guardians.filter((g) => g.isPrimary);
  if (primary.length > 0) return primary.map((g) => ({ type: 'GUARDIAN', id: g.guardianId, name: g.guardianName, email: g.guardianEmail }));
  return [{ type: 'STUDENT', id: student.id, name: student.fullName, email: student.email }];
}

type RosterStudent = { studentId: string; studentName: string; studentEmail: string | null };

// Session-level recipient resolution: one plan per primary guardian across the
// roster, with studentName joining every covered child so a shared mailbox gets
// one accurate message; students without a guardian fall back to their contact.
async function sessionRosterPlans(
  client: PoolClient,
  tenantId: string,
  sessionId: string,
  context: SafeContext,
  relatedEntityType: string,
  dedupeScope?: string,
): Promise<MessagePlan[]> {
  const roster = await client.query<RosterStudent>(
    `SELECT s.id AS "studentId", s.full_name AS "studentName", s.email AS "studentEmail"
     FROM attendance_records r JOIN students s ON s.tenant_id = r.tenant_id AND s.id = r.student_id
     WHERE r.tenant_id = $1 AND r.session_id = $2
     ORDER BY s.full_name, s.id`,
    [tenantId, sessionId],
  );
  const plans: MessagePlan[] = [];
  const guardianStudents = new Map<string, { guardian: GuardianLink; students: string[] }>();
  const rosterGuardians = roster.rows.length
    ? await client.query<GuardianLink & { studentId: string }>(
        `SELECT sg.student_id AS "studentId", g.id AS "guardianId", g.full_name AS "guardianName", g.email AS "guardianEmail",
                sg.is_primary_contact AS "isPrimary", sg.is_billing_contact AS "isBilling"
         FROM student_guardians sg JOIN guardians g ON g.tenant_id = sg.tenant_id AND g.id = sg.guardian_id
         WHERE sg.tenant_id = $1 AND sg.student_id = ANY($2) AND sg.is_primary_contact
         ORDER BY g.full_name, g.id`,
        [tenantId, roster.rows.map((row) => row.studentId)],
      )
    : { rows: [] as (GuardianLink & { studentId: string })[] };
  const studentsWithGuardian = new Set(rosterGuardians.rows.map((row) => row.studentId));
  for (const row of rosterGuardians.rows) {
    const entry = guardianStudents.get(row.guardianId) ?? { guardian: row, students: [] };
    entry.students.push(roster.rows.find((student) => student.studentId === row.studentId)!.studentName);
    guardianStudents.set(row.guardianId, entry);
  }
  for (const student of roster.rows) {
    if (!studentsWithGuardian.has(student.studentId)) {
      plans.push({
        recipient: { type: 'STUDENT', id: student.studentId, name: student.studentName, email: student.studentEmail },
        context: withRecipientName({ ...context, studentName: student.studentName }, { type: 'STUDENT', id: student.studentId, name: student.studentName, email: student.studentEmail }),
        relatedEntityType,
        relatedEntityId: sessionId,
        dedupeScope,
      });
    }
  }
  // Guardians sharing one mailbox get the union of their roster children in
  // every context, so the single surviving EMAIL (deduped by destination)
  // names everyone instead of just the first guardian's students.
  const mailboxStudents = new Map<string, string[]>();
  for (const { guardian, students } of guardianStudents.values()) {
    if (!guardian.guardianEmail) continue;
    const key = normalizeEmail(guardian.guardianEmail);
    mailboxStudents.set(key, [...(mailboxStudents.get(key) ?? []), ...students]);
  }
  for (const { guardian, students } of guardianStudents.values()) {
    const recipient: Recipient = { type: 'GUARDIAN', id: guardian.guardianId, name: guardian.guardianName, email: guardian.guardianEmail };
    const names = (guardian.guardianEmail ? mailboxStudents.get(normalizeEmail(guardian.guardianEmail)) : undefined) ?? students;
    plans.push({
      recipient,
      context: withRecipientName({ ...context, studentName: names.join(', ') }, recipient),
      relatedEntityType,
      relatedEntityId: sessionId,
      dedupeScope,
    });
  }
  return plans;
}

async function singleStudentPlans(
  client: PoolClient,
  tenantId: string,
  student: { id: string; fullName: string; email: string | null },
  context: SafeContext,
  relatedEntityType: string,
  relatedEntityId: string,
  recipientMode: 'BILLING' | 'ACADEMIC',
  dedupeScope?: string,
): Promise<MessagePlan[]> {
  const guardians = await guardiansForStudent(client, tenantId, student.id);
  const recipients = recipientMode === 'BILLING' ? billingRecipients(guardians, student) : academicRecipients(guardians, student);
  return recipients.map((recipient) => ({
    recipient,
    context: withRecipientName(context, recipient),
    relatedEntityType,
    relatedEntityId,
    dedupeScope,
  }));
}

export const COMMUNICATION_EVENTS: Readonly<Record<CommunicationEventType, EventDefinition>> = {
  PAYMENT_RECEIVED: {
    eventType: 'PAYMENT_RECEIVED',
    timing: 'IMMEDIATE',
    slug: 'payment.received',
    variables: [
      { name: 'studentName', required: true },
      { name: 'guardianName', required: true },
      { name: 'invoiceNumber', required: false },
      { name: 'amountVnd', required: true },
      { name: 'receivedDate', required: true },
      { name: 'paymentMethod', required: true },
    ],
    defaults: {
      IN_APP: {
        subject: null,
        body: 'Đã nhận thanh toán {{amountVnd}} cho học phí của {{studentName}}.',
      },
      EMAIL: {
        subject: 'Xác nhận thanh toán hóa đơn {{invoiceNumber}}',
        body: [
          'Chào {{guardianName}},',
          '',
          'Trung tâm đã nhận thanh toán {{amountVnd}} cho {{studentName}} vào ngày {{receivedDate}} (hình thức: {{paymentMethod}}).',
          '',
          'Cảm ơn quý phụ huynh.',
        ].join('\n'),
      },
    },
    async buildPlans(client, tenantId, sourceEntityId) {
      const result = await client.query<{
        studentId: string; studentName: string; studentEmail: string | null; amountVnd: string; method: string; receivedAt: Date;
        invoiceNumber: string | null;
      }>(
        `SELECT p.student_id AS "studentId", s.full_name AS "studentName", s.email AS "studentEmail", p.amount_vnd::text AS "amountVnd",
                p.method, p.received_at AS "receivedAt", i.invoice_number AS "invoiceNumber"
         FROM payments p
         JOIN students s ON s.tenant_id = p.tenant_id AND s.id = p.student_id
         LEFT JOIN invoices i ON i.tenant_id = p.tenant_id AND i.id = p.invoice_id
         WHERE p.tenant_id = $1 AND p.id = $2`,
        [tenantId, sourceEntityId],
      );
      const payment = result.rows[0];
      if (!payment) throw new NotFoundException('Payment not found');
      return singleStudentPlans(client, tenantId, { id: payment.studentId, fullName: payment.studentName, email: payment.studentEmail }, {
        studentName: payment.studentName,
        invoiceNumber: payment.invoiceNumber ?? '',
        amountVnd: formatVnd(payment.amountVnd),
        receivedDate: formatDate(payment.receivedAt),
        paymentMethod: PAYMENT_METHODS[payment.method] ?? payment.method,
      }, 'Payment', sourceEntityId, 'BILLING');
    },
  },

  ATTENDANCE_ABSENCE: {
    eventType: 'ATTENDANCE_ABSENCE',
    timing: 'IMMEDIATE',
    slug: 'attendance.absence',
    variables: [
      { name: 'studentName', required: true },
      { name: 'guardianName', required: true },
      { name: 'className', required: true },
      { name: 'sessionDate', required: true },
      { name: 'absenceKind', required: true },
    ],
    defaults: {
      IN_APP: {
        subject: null,
        body: '{{studentName}} vắng mặt ở lớp {{className}} ngày {{sessionDate}} ({{absenceKind}}).',
      },
      EMAIL: {
        subject: 'Thông báo vắng mặt {{sessionDate}} - {{className}}',
        body: [
          'Chào {{guardianName}},',
          '',
          'Chúng tôi xin thông báo {{studentName}} đã vắng học buổi {{className}} ngày {{sessionDate}} ({{absenceKind}}).',
          '',
          'Vui lòng liên hệ trung tâm nếu cần bổ sung thông tin.',
        ].join('\n'),
      },
    },
    async buildPlans(client, tenantId, sourceEntityId) {
      const result = await client.query<{
        recordId: string; status: string; studentId: string; studentName: string; studentEmail: string | null;
        className: string; sessionDate: string;
      }>(
        `SELECT r.id AS "recordId", r.status, s.id AS "studentId", s.full_name AS "studentName", s.email AS "studentEmail",
                c.name AS "className", a.session_date::text AS "sessionDate"
         FROM attendance_records r
         JOIN attendance_sessions a ON a.tenant_id = r.tenant_id AND a.id = r.session_id
         JOIN classes c ON c.tenant_id = a.tenant_id AND c.id = a.class_id
         JOIN students s ON s.tenant_id = r.tenant_id AND s.id = r.student_id
         WHERE r.tenant_id = $1 AND r.session_id = $2 AND r.status IN ('ABSENT_EXCUSED', 'ABSENT_UNEXCUSED')
         ORDER BY r.id`,
        [tenantId, sourceEntityId],
      );
      const plans: MessagePlan[] = [];
      for (const record of result.rows) {
        const studentPlans = await singleStudentPlans(client, tenantId, { id: record.studentId, fullName: record.studentName, email: record.studentEmail }, {
          studentName: record.studentName,
          className: record.className,
          sessionDate: formatDate(record.sessionDate),
          absenceKind: record.status === 'ABSENT_EXCUSED' ? 'có phép' : 'không phép',
        }, 'AttendanceRecord', record.recordId, 'ACADEMIC', record.recordId);
        plans.push(...studentPlans);
      }
      return plans;
    },
  },

  SCHEDULE_CHANGED: {
    eventType: 'SCHEDULE_CHANGED',
    timing: 'IMMEDIATE',
    slug: 'schedule.changed',
    variables: [
      { name: 'studentName', required: true },
      { name: 'guardianName', required: true },
      { name: 'className', required: true },
      { name: 'changeKind', required: true },
      { name: 'originalDate', required: true },
      { name: 'originalStartTime', required: false },
      { name: 'originalEndTime', required: false },
      { name: 'newDate', required: false },
      { name: 'newStartTime', required: false },
      { name: 'newEndTime', required: false },
      { name: 'teacherName', required: false },
      { name: 'roomName', required: false },
      { name: 'reason', required: false },
      { name: 'newScheduleText', required: false },
    ],
    defaults: {
      IN_APP: {
        subject: null,
        body: 'Buổi học lớp {{className}} ngày {{originalDate}} đã {{changeKind}}. {{newScheduleText}}',
      },
      EMAIL: {
        subject: 'Thay đổi lịch học lớp {{className}} - {{originalDate}}',
        body: [
          'Chào {{guardianName}},',
          '',
          'Buổi học lớp {{className}} của {{studentName}} vào {{originalDate}} ({{originalStartTime}} - {{originalEndTime}}) đã {{changeKind}}.',
          '',
          '{{newScheduleText}}',
          '',
          'Vui lòng liên hệ trung tâm nếu cần hỗ trợ.',
        ].join('\n'),
      },
    },
    async buildPlans(client, tenantId, sourceEntityId, dedupeScope) {
      const cancelled = dedupeScope === 'CANCELLED';
      const result = await client.query<{
        sessionId: string; className: string; teacherName: string | null; roomName: string | null;
        sessionDate: string; startTime: string; endTime: string;
        originalDate: string | null; originalStartTime: string | null; originalEndTime: string | null;
        reason: string | null;
      }>(
        `SELECT s.id AS "sessionId", c.name AS "className", t.name AS "teacherName", r.name AS "roomName",
                s.session_date::text AS "sessionDate", s.start_time::text AS "startTime", s.end_time::text AS "endTime",
                o.session_date::text AS "originalDate", o.start_time::text AS "originalStartTime", o.end_time::text AS "originalEndTime",
                COALESCE(s.cancellation_reason, s.reschedule_reason) AS "reason"
         FROM attendance_sessions s
         JOIN classes c ON c.tenant_id = s.tenant_id AND c.id = s.class_id
         LEFT JOIN attendance_sessions o ON o.tenant_id = s.tenant_id AND o.id = s.rescheduled_from_id
         LEFT JOIN teachers t ON t.tenant_id = s.tenant_id AND t.id = s.teacher_id
         LEFT JOIN rooms r ON r.tenant_id = s.tenant_id AND r.id = s.room_id
         WHERE s.tenant_id = $1 AND s.id = $2`,
        [tenantId, sourceEntityId],
      );
      const session = result.rows[0];
      if (!session) throw new NotFoundException('Session not found');
      const originalDate = session.originalDate ?? session.sessionDate;
      const originalStartTime = session.originalStartTime ?? session.startTime;
      const originalEndTime = session.originalEndTime ?? session.endTime;
      const newScheduleText = cancelled
        ? 'Buổi học đã bị hủy và sẽ được trung tâm sắp xếp lại.'
        : `Buổi học mới: ${formatDate(session.sessionDate)} ${formatTime(session.startTime)} - ${formatTime(session.endTime)}${session.roomName ? ` (phòng ${session.roomName})` : ''}.`;
      const context: SafeContext = {
        className: session.className,
        changeKind: cancelled ? 'bị hủy' : 'được dời lịch',
        originalDate: formatDate(originalDate),
        originalStartTime: formatTime(originalStartTime),
        originalEndTime: formatTime(originalEndTime),
        newDate: cancelled ? '' : formatDate(session.sessionDate),
        newStartTime: cancelled ? '' : formatTime(session.startTime),
        newEndTime: cancelled ? '' : formatTime(session.endTime),
        teacherName: session.teacherName ?? '',
        roomName: session.roomName ?? '',
        reason: session.reason ?? '',
        newScheduleText,
      };
      return sessionRosterPlans(client, tenantId, sourceEntityId, context, 'Session', dedupeScope);
    },
  },

  SESSION_REMINDER: {
    eventType: 'SESSION_REMINDER',
    timing: 'TIME_BASED',
    slug: 'session.reminder',
    variables: [
      { name: 'studentName', required: true },
      { name: 'guardianName', required: true },
      { name: 'className', required: true },
      { name: 'sessionDate', required: true },
      { name: 'startTime', required: true },
      { name: 'endTime', required: false },
      { name: 'teacherName', required: false },
      { name: 'roomName', required: false },
      { name: 'roomLine', required: false },
    ],
    defaults: {
      IN_APP: {
        subject: null,
        body: 'Nhắc lịch: lớp {{className}} ngày {{sessionDate}} lúc {{startTime}}.',
      },
      EMAIL: {
        subject: 'Nhắc lịch học lớp {{className}} - {{sessionDate}}',
        body: [
          'Chào {{guardianName}},',
          '',
          'Đây là lời nhắc buổi học sắp tới của {{studentName}}:',
          '',
          'Lớp: {{className}}',
          'Thời gian: {{sessionDate}} {{startTime}} - {{endTime}}',
          '{{roomLine}}',
          'Vui lòng cho học sinh đi học đúng giờ.',
        ].join('\n'),
      },
    },
    async buildPlans(client, tenantId, sourceEntityId, dedupeScope) {
      const result = await client.query<{ status: string; className: string; teacherName: string | null; roomName: string | null; sessionDate: string; startTime: string; endTime: string }>(
        `SELECT s.status, c.name AS "className", t.name AS "teacherName", r.name AS "roomName",
                s.session_date::text AS "sessionDate", s.start_time::text AS "startTime", s.end_time::text AS "endTime"
         FROM attendance_sessions s
         JOIN classes c ON c.tenant_id = s.tenant_id AND c.id = s.class_id
         LEFT JOIN teachers t ON t.tenant_id = s.tenant_id AND t.id = s.teacher_id
         LEFT JOIN rooms r ON r.tenant_id = s.tenant_id AND r.id = s.room_id
         WHERE s.tenant_id = $1 AND s.id = $2`,
        [tenantId, sourceEntityId],
      );
      const session = result.rows[0];
      if (!session) throw new NotFoundException('Session not found');
      if (session.status !== 'SCHEDULED') throw new ConflictException('Only scheduled sessions can receive reminders');
      return sessionRosterPlans(client, tenantId, sourceEntityId, {
        className: session.className,
        sessionDate: formatDate(session.sessionDate),
        startTime: formatTime(session.startTime),
        endTime: formatTime(session.endTime),
        teacherName: session.teacherName ?? '',
        roomName: session.roomName ?? '',
        roomLine: session.roomName ? `Phòng: ${session.roomName}` : '',
      }, 'Session', dedupeScope);
    },
  },

  TUITION_DUE: {
    eventType: 'TUITION_DUE',
    timing: 'TIME_BASED',
    slug: 'tuition.due',
    variables: [
      { name: 'studentName', required: true },
      { name: 'guardianName', required: true },
      { name: 'invoiceNumber', required: true },
      { name: 'amountDueVnd', required: true },
      { name: 'dueDate', required: true },
    ],
    defaults: {
      IN_APP: {
        subject: null,
        body: 'Hóa đơn {{invoiceNumber}} sẽ đến hạn ngày {{dueDate}} ({{amountDueVnd}}).',
      },
      EMAIL: {
        subject: 'Nhắc đến hạn thanh toán hóa đơn {{invoiceNumber}}',
        body: [
          'Chào {{guardianName}},',
          '',
          'Hóa đơn {{invoiceNumber}} của {{studentName}} sẽ đến hạn vào ngày {{dueDate}}.',
          'Số tiền còn phải thanh toán: {{amountDueVnd}}.',
          '',
          'Vui lòng hoàn tất thanh toán trước hạn. Cảm ơn quý phụ huynh.',
        ].join('\n'),
      },
    },
    async buildPlans(client, tenantId, sourceEntityId) {
      return tuitionPlans(client, tenantId, sourceEntityId, 'DUE');
    },
  },

  TUITION_OVERDUE: {
    eventType: 'TUITION_OVERDUE',
    timing: 'TIME_BASED',
    slug: 'tuition.overdue',
    variables: [
      { name: 'studentName', required: true },
      { name: 'guardianName', required: true },
      { name: 'invoiceNumber', required: true },
      { name: 'outstandingVnd', required: true },
      { name: 'dueDate', required: true },
    ],
    defaults: {
      IN_APP: {
        subject: null,
        body: 'Hóa đơn {{invoiceNumber}} đã quá hạn từ ngày {{dueDate}} (còn nợ {{outstandingVnd}}).',
      },
      EMAIL: {
        subject: 'Hóa đơn {{invoiceNumber}} đã quá hạn thanh toán',
        body: [
          'Chào {{guardianName}},',
          '',
          'Hóa đơn {{invoiceNumber}} của {{studentName}} đã quá hạn thanh toán (hạn: {{dueDate}}).',
          'Số tiền còn phải thanh toán: {{outstandingVnd}}.',
          '',
          'Vui lòng liên hệ trung tâm để hoàn tất thanh toán.',
        ].join('\n'),
      },
    },
    async buildPlans(client, tenantId, sourceEntityId) {
      return tuitionPlans(client, tenantId, sourceEntityId, 'OVERDUE');
    },
  },

  TRIAL_REMINDER: {
    eventType: 'TRIAL_REMINDER',
    timing: 'TIME_BASED',
    slug: 'trial.reminder',
    variables: [
      { name: 'studentName', required: true },
      { name: 'guardianName', required: true },
      { name: 'className', required: true },
      { name: 'trialDate', required: true },
      { name: 'trialTime', required: true },
    ],
    defaults: {
      IN_APP: {
        subject: null,
        body: 'Nhắc học thử: lớp {{className}} ngày {{trialDate}} lúc {{trialTime}}.',
      },
      EMAIL: {
        subject: 'Nhắc buổi học thử lớp {{className}} - {{trialDate}}',
        body: [
          'Chào {{guardianName}},',
          '',
          'Đây là lời nhắc buổi học thử của {{studentName}}:',
          '',
          'Lớp: {{className}}',
          'Thời gian: {{trialDate}} {{trialTime}}',
          '',
          'Rất mong được đón tiếp gia đình.',
        ].join('\n'),
      },
    },
    async buildPlans(client, tenantId, sourceEntityId, dedupeScope) {
      const result = await client.query<{
        status: string; sessionStatus: string; sessionDate: string; startTime: string; className: string;
        leadId: string; leadStudentName: string; leadGuardianName: string | null; leadGuardianEmail: string | null; leadStudentEmail: string | null;
        studentId: string | null; studentName: string | null; studentEmail: string | null; guardianId: string | null; guardianName: string | null; guardianEmail: string | null;
      }>(
        `SELECT tb.status, s.status AS "sessionStatus", s.session_date::text AS "sessionDate", s.start_time::text AS "startTime",
                c.name AS "className", l.id AS "leadId", l.student_name AS "leadStudentName",
                l.guardian_name AS "leadGuardianName", l.guardian_email AS "leadGuardianEmail", l.student_email AS "leadStudentEmail",
                st.id AS "studentId", st.full_name AS "studentName", st.email AS "studentEmail",
                g.id AS "guardianId", g.full_name AS "guardianName", g.email AS "guardianEmail"
         FROM trial_bookings tb
         JOIN attendance_sessions s ON s.tenant_id = tb.tenant_id AND s.id = tb.session_id
         JOIN classes c ON c.tenant_id = s.tenant_id AND c.id = s.class_id
         LEFT JOIN leads l ON l.tenant_id = tb.tenant_id AND l.id = tb.lead_id
         LEFT JOIN students st ON st.tenant_id = tb.tenant_id AND st.id = tb.student_id
         LEFT JOIN guardians g ON g.tenant_id = tb.tenant_id AND g.id = tb.guardian_id
         WHERE tb.tenant_id = $1 AND tb.id = $2`,
        [tenantId, sourceEntityId],
      );
      const booking = result.rows[0];
      if (!booking) throw new NotFoundException('Trial booking not found');
      if (booking.status !== 'BOOKED') throw new ConflictException('Only booked trials can receive reminders');
      if (booking.sessionStatus !== 'SCHEDULED' || booking.sessionDate < new Date().toISOString().slice(0, 10)) {
        throw new ConflictException('Trial session is not an upcoming scheduled session');
      }
      const context: SafeContext = {
        studentName: booking.studentName ?? booking.leadStudentName,
        className: booking.className,
        trialDate: formatDate(booking.sessionDate),
        trialTime: formatTime(booking.startTime),
      };
      const recipients: Recipient[] = [];
      if (booking.guardianId) {
        recipients.push({ type: 'GUARDIAN', id: booking.guardianId, name: booking.guardianName ?? '', email: booking.guardianEmail });
      } else if (booking.studentId) {
        recipients.push({ type: 'STUDENT', id: booking.studentId, name: booking.studentName ?? '', email: booking.studentEmail });
      }
      if (recipients.length === 0 && booking.leadId) {
        // Lead contact fallback, only when no materialized contact exists.
        if (booking.leadGuardianEmail) {
          recipients.push({ type: 'LEAD', id: booking.leadId, name: booking.leadGuardianName ?? '', email: booking.leadGuardianEmail });
        } else if (booking.leadStudentEmail) {
          recipients.push({ type: 'LEAD', id: booking.leadId, name: booking.leadStudentName, email: booking.leadStudentEmail });
        }
      }
      return recipients.map((recipient) => ({
        recipient,
        context: withRecipientName(context, recipient),
        relatedEntityType: 'TrialBooking',
        relatedEntityId: sourceEntityId,
        dedupeScope,
      }));
    },
  },

  ENROLLMENT_EXPIRING: {
    eventType: 'ENROLLMENT_EXPIRING',
    timing: 'TIME_BASED',
    slug: 'enrollment.expiring',
    variables: [
      { name: 'studentName', required: true },
      { name: 'guardianName', required: true },
      { name: 'className', required: true },
      { name: 'expectedEndDate', required: true },
    ],
    defaults: {
      IN_APP: {
        subject: null,
        body: 'Lớp {{className}} của {{studentName}} dự kiến kết thúc ngày {{expectedEndDate}}.',
      },
      EMAIL: {
        subject: 'Sắp kết thúc khóa học {{className}}',
        body: [
          'Chào {{guardianName}},',
          '',
          'Khóa học {{className}} của {{studentName}} dự kiến kết thúc vào ngày {{expectedEndDate}}.',
          '',
          'Vui lòng liên hệ trung tâm nếu quý phụ huynh muốn đăng ký tiếp khóa học mới.',
        ].join('\n'),
      },
    },
    // LOCAL-11 dispatch contract. Classora has no automatic enrollment expiry:
    // expectedEndDate on the enrollment is the only trustworthy signal, so the
    // caller (LOCAL-18) decides which enrollments count as "expiring".
    async buildPlans(client, tenantId, sourceEntityId, dedupeScope) {
      const result = await client.query<{ status: string; expectedEndDate: string | null; studentId: string; studentName: string; studentEmail: string | null; className: string }>(
        `SELECT e.status, e.expected_end_date::text AS "expectedEndDate", s.id AS "studentId", s.full_name AS "studentName",
                s.email AS "studentEmail", c.name AS "className"
         FROM enrollments e
         JOIN students s ON s.tenant_id = e.tenant_id AND s.id = e.student_id
         JOIN classes c ON c.tenant_id = e.tenant_id AND c.id = e.class_id
         WHERE e.tenant_id = $1 AND e.id = $2`,
        [tenantId, sourceEntityId],
      );
      const enrollment = result.rows[0];
      if (!enrollment) throw new NotFoundException('Enrollment not found');
      if (enrollment.status !== 'ACTIVE') throw new ConflictException('Only active enrollments are eligible');
      if (!enrollment.expectedEndDate) throw new ConflictException('Enrollment has no expected end date');
      return singleStudentPlans(client, tenantId, { id: enrollment.studentId, fullName: enrollment.studentName, email: enrollment.studentEmail }, {
        studentName: enrollment.studentName,
        className: enrollment.className,
        expectedEndDate: formatDate(enrollment.expectedEndDate),
      }, 'Enrollment', sourceEntityId, 'ACADEMIC', dedupeScope);
    },
  },
};

async function tuitionPlans(client: PoolClient, tenantId: string, invoiceId: string, kind: 'DUE' | 'OVERDUE'): Promise<MessagePlan[]> {
  const result = await client.query<{
    status: string; invoiceNumber: string | null; dueDate: string; totalVnd: string; paidVnd: string; creditVnd: string;
    studentId: string | null; studentName: string | null; studentEmail: string | null;
  }>(
    `SELECT i.status, i.invoice_number AS "invoiceNumber", i.due_date::text AS "dueDate", i.total_vnd::text AS "totalVnd",
            ${ledgerPaidSql} AS "paidVnd", ${ledgerCreditSql} AS "creditVnd",
            s.id AS "studentId", s.full_name AS "studentName", s.email AS "studentEmail"
     FROM invoices i LEFT JOIN students s ON s.tenant_id = i.tenant_id AND s.id = i.student_id
     WHERE i.tenant_id = $1 AND i.id = $2`,
    [tenantId, invoiceId],
  );
  const invoice = result.rows[0];
  if (!invoice) throw new NotFoundException('Invoice not found');
  const outstanding = BigInt(invoice.totalVnd) - BigInt(invoice.creditVnd) - BigInt(invoice.paidVnd);
  if (invoice.status !== 'ISSUED' || outstanding <= 0n) {
    throw new ConflictException(kind === 'OVERDUE' ? 'Invoice is not overdue' : 'Invoice has no outstanding balance');
  }
  const today = new Date().toISOString().slice(0, 10);
  if (kind === 'DUE' && invoice.dueDate < today) throw new ConflictException('Invoice is already overdue');
  if (kind === 'OVERDUE' && invoice.dueDate >= today) throw new ConflictException('Invoice is not overdue');
  if (!invoice.studentId) throw new ConflictException('Invoice has no student');
  const student = { id: invoice.studentId, fullName: invoice.studentName ?? '', email: invoice.studentEmail };
  const context: SafeContext = kind === 'OVERDUE'
    ? { studentName: student.fullName, invoiceNumber: invoice.invoiceNumber ?? '', outstandingVnd: formatVnd(outstanding.toString()), dueDate: formatDate(invoice.dueDate) }
    : { studentName: student.fullName, invoiceNumber: invoice.invoiceNumber ?? '', amountDueVnd: formatVnd(outstanding.toString()), dueDate: formatDate(invoice.dueDate) };
  return singleStudentPlans(client, tenantId, student, context, 'Invoice', invoiceId, 'BILLING');
}

export const EVENT_VARIABLES = (eventType: CommunicationEventType) => COMMUNICATION_EVENTS[eventType].variables;
