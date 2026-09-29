import { plainToInstance, type ClassConstructor } from "class-transformer";
import { validateSync } from "class-validator";
import type { PoolClient } from "pg";
import { CreateClassDto } from "../classes/dto/create-class.dto.js";
import { CreateCourseLevelDto } from "../courses/dto/create-course-level.dto.js";
import { CreateCourseDto } from "../courses/dto/create-course.dto.js";
import { CreateEnrollmentDto } from "../enrollments/dto/create-enrollment.dto.js";
import { CreateStudentDto } from "../students/dto/create-student.dto.js";
import { CreateTeacherDto } from "../teachers/dto/create-teacher.dto.js";
import {
  LIST_DELIMITER,
  type ImportTypeDefinition,
} from "./data-transfer.catalog.js";

export type ImportMapping = {
  sourceHeaders: string[];
  fields: Record<string, string | null>;
};
export type RowIssue = { code: string; field: string; message: string };
export type StagedRow = {
  rowNumber: number;
  sourceData: Record<string, string>;
};

export type ValidatedRow = {
  rowNumber: number;
  sourceKey: string;
  status: "VALID" | "INVALID";
  errors: RowIssue[];
  warnings: RowIssue[];
  normalized: Record<string, unknown>;
  dto: object;
  resolved: {
    courseId?: string;
    courseLevelId?: string;
    branchId?: string;
    branchIds?: string[];
    defaultRoomId?: string;
    primaryTeacherId?: string;
    studentId?: string;
    classId?: string;
  };
};

const CONSUMING = "('PENDING','TRIAL','ACTIVE','PAUSED')";

type StudentRef = {
  id: string;
  status: string;
  phone: string | null;
  email: string | null;
};
type EntityRef = { id: string; status: string };
type ClassRef = { id: string; status: string; capacity: number | null };
type LevelRef = { id: string; courseId: string; status: string };
type RoomRef = { id: string; branchId: string; status: string };

export function buildReverseMap(mapping: ImportMapping): Map<string, string> {
  const reverse = new Map<string, string>();
  for (const [header, target] of Object.entries(mapping.fields))
    if (target) reverse.set(target, header);
  return reverse;
}

// Read-only row validation over bulk-loaded tenant maps. Mirrors the manual
// create flows' DTO transforms, relationship checks, uniqueness, and
// Enrollment capacity semantics without writing anything.
export class ImportRowValidator {
  private readonly students = new Map<string, StudentRef>();
  private readonly teachers = new Map<string, EntityRef>();
  private readonly courses = new Map<string, EntityRef>();
  private readonly branches = new Map<string, EntityRef>();
  private readonly classes = new Map<string, ClassRef>();
  private readonly levels = new Map<string, LevelRef[]>();
  private readonly rooms = new Map<string, RoomRef>(); // key: BRANCH_CODE|ROOM_CODE
  private readonly teacherBranches = new Set<string>();
  private readonly operationalPairs = new Set<string>();
  private readonly consumingByClass = new Map<string, number>();
  private readonly existingPhones = new Set<string>();
  private readonly existingEmails = new Set<string>();

  constructor(
    private readonly client: PoolClient,
    private readonly tenantId: string,
    private readonly definition: ImportTypeDefinition,
  ) {}

  private codes(
    rows: StagedRow[],
    reverse: Map<string, string>,
    key: string,
  ): string[] {
    const header = reverse.get(key);
    if (!header) return [];
    return [
      ...new Set(
        rows
          .map((row) => (row.sourceData[header] ?? "").trim().toUpperCase())
          .filter(Boolean),
      ),
    ];
  }

  async load(rows: StagedRow[], reverse: Map<string, string>) {
    const type = this.definition.type;
    if (type === "STUDENTS") {
      for (const row of await this.byCode<StudentRef>(
        "SELECT UPPER(code) AS k, id, status, phone, LOWER(email) AS email FROM students WHERE tenant_id=$1 AND UPPER(code)=ANY($2::text[])",
        this.codes(rows, reverse, "code"),
      )) {
        this.students.set(row.k, row);
      }
      const phones = this.codesList(rows, reverse, "phone");
      if (phones.length) {
        const found = await this.client.query<{ phone: string }>(
          "SELECT phone FROM students WHERE tenant_id=$1 AND phone=ANY($2::text[])",
          [this.tenantId, phones],
        );
        for (const row of found.rows)
          if (row.phone) this.existingPhones.add(row.phone);
      }
      const emails = this.codesList(rows, reverse, "email").map((email) =>
        email.toLowerCase(),
      );
      if (emails.length) {
        const found = await this.client.query<{ email: string }>(
          "SELECT LOWER(email) AS email FROM students WHERE tenant_id=$1 AND LOWER(email)=ANY($2::text[])",
          [this.tenantId, emails],
        );
        for (const row of found.rows)
          if (row.email) this.existingEmails.add(row.email);
      }
    }
    if (type === "TEACHERS") {
      for (const row of await this.byCode<EntityRef>(
        "SELECT UPPER(code) AS k, id, status FROM teachers WHERE tenant_id=$1 AND UPPER(code)=ANY($2::text[])",
        this.codes(rows, reverse, "code"),
      )) {
        this.teachers.set(row.k, row);
      }
      const branchCodes = this.listCellCodes(rows, reverse, "branchCodes");
      if (branchCodes.length) {
        for (const row of await this.byCode<EntityRef>(
          "SELECT UPPER(code) AS k, id, status FROM branches WHERE tenant_id=$1 AND UPPER(code)=ANY($2::text[])",
          branchCodes,
        )) {
          this.branches.set(row.k, row);
        }
      }
    }
    if (type === "COURSES") {
      for (const row of await this.byCode<EntityRef>(
        "SELECT UPPER(code) AS k, id, status FROM courses WHERE tenant_id=$1 AND UPPER(code)=ANY($2::text[])",
        this.codes(rows, reverse, "code"),
      )) {
        this.courses.set(row.k, row);
      }
    }
    if (type === "COURSE_LEVELS") {
      for (const row of await this.byCode<EntityRef>(
        "SELECT UPPER(code) AS k, id, status FROM courses WHERE tenant_id=$1 AND UPPER(code)=ANY($2::text[])",
        this.codes(rows, reverse, "courseCode"),
      )) {
        this.courses.set(row.k, row);
      }
      const levelCodes = this.codes(rows, reverse, "code");
      if (levelCodes.length) {
        const result = await this.client.query<{
          k: string;
          id: string;
          course_id: string;
          status: string;
        }>(
          "SELECT UPPER(code) AS k, id, course_id, status FROM course_levels WHERE tenant_id=$1 AND UPPER(code)=ANY($2::text[])",
          [this.tenantId, levelCodes],
        );
        for (const row of result.rows) {
          const list = this.levels.get(row.k) ?? [];
          list.push({
            id: row.id,
            courseId: row.course_id,
            status: row.status,
          });
          this.levels.set(row.k, list);
        }
      }
    }
    if (type === "CLASSES") {
      for (const row of await this.byCode<EntityRef>(
        "SELECT UPPER(code) AS k, id, status FROM courses WHERE tenant_id=$1 AND UPPER(code)=ANY($2::text[])",
        this.codes(rows, reverse, "courseCode"),
      )) {
        this.courses.set(row.k, row);
      }
      for (const row of await this.byCode<EntityRef>(
        "SELECT UPPER(code) AS k, id, status FROM branches WHERE tenant_id=$1 AND UPPER(code)=ANY($2::text[])",
        this.codes(rows, reverse, "branchCode"),
      )) {
        this.branches.set(row.k, row);
      }
      for (const row of await this.byCode<ClassRef>(
        "SELECT UPPER(code) AS k, id, status, capacity FROM classes WHERE tenant_id=$1 AND UPPER(code)=ANY($2::text[])",
        this.codes(rows, reverse, "code"),
      )) {
        this.classes.set(row.k, row);
      }
      const teacherCodes = this.codes(rows, reverse, "primaryTeacherCode");
      if (teacherCodes.length) {
        for (const row of await this.byCode<EntityRef>(
          "SELECT UPPER(code) AS k, id, status FROM teachers WHERE tenant_id=$1 AND UPPER(code)=ANY($2::text[])",
          teacherCodes,
        )) {
          this.teachers.set(row.k, row);
        }
      }
      const levelCodes = this.codes(rows, reverse, "courseLevelCode");
      if (levelCodes.length) {
        const result = await this.client.query<{
          k: string;
          id: string;
          course_id: string;
          status: string;
        }>(
          "SELECT UPPER(code) AS k, id, course_id, status FROM course_levels WHERE tenant_id=$1 AND UPPER(code)=ANY($2::text[])",
          [this.tenantId, levelCodes],
        );
        for (const row of result.rows) {
          const list = this.levels.get(row.k) ?? [];
          list.push({
            id: row.id,
            courseId: row.course_id,
            status: row.status,
          });
          this.levels.set(row.k, list);
        }
      }
      const roomCodes = this.codes(rows, reverse, "defaultRoomCode");
      if (roomCodes.length) {
        const result = await this.client.query<{
          roomCode: string;
          branchCode: string;
          id: string;
          branchId: string;
          status: string;
        }>(
          `SELECT UPPER(r.code) AS "roomCode", UPPER(b.code) AS "branchCode", r.id, r.branch_id AS "branchId", r.status
           FROM rooms r JOIN branches b ON b.tenant_id=r.tenant_id AND b.id=r.branch_id
           WHERE r.tenant_id=$1 AND UPPER(r.code)=ANY($2::text[])`,
          [this.tenantId, roomCodes],
        );
        for (const room of result.rows)
          this.rooms.set(`${room.branchCode}|${room.roomCode}`, {
            id: room.id,
            branchId: room.branchId,
            status: room.status,
          });
      }
      const branchCodes = this.codes(rows, reverse, "branchCode");
      if (teacherCodes.length && branchCodes.length) {
        const result = await this.client.query<{ tk: string; bk: string }>(
          `SELECT UPPER(t.code) AS tk, UPPER(b.code) AS bk FROM teacher_branches tb
           JOIN teachers t ON t.tenant_id=tb.tenant_id AND t.id=tb.teacher_id
           JOIN branches b ON b.tenant_id=tb.tenant_id AND b.id=tb.branch_id
           WHERE tb.tenant_id=$1 AND UPPER(t.code)=ANY($2::text[]) AND UPPER(b.code)=ANY($3::text[])`,
          [this.tenantId, teacherCodes, branchCodes],
        );
        for (const row of result.rows)
          this.teacherBranches.add(`${row.tk}|${row.bk}`);
      }
    }
    if (type === "ENROLLMENTS") {
      for (const row of await this.byCode<StudentRef>(
        "SELECT UPPER(code) AS k, id, status, phone, LOWER(email) AS email FROM students WHERE tenant_id=$1 AND UPPER(code)=ANY($2::text[])",
        this.codes(rows, reverse, "studentCode"),
      )) {
        this.students.set(row.k, row);
      }
      for (const row of await this.byCode<ClassRef>(
        "SELECT UPPER(code) AS k, id, status, capacity FROM classes WHERE tenant_id=$1 AND UPPER(code)=ANY($2::text[])",
        this.codes(rows, reverse, "classCode"),
      )) {
        this.classes.set(row.k, row);
      }
      const studentIds = [
        ...new Set(
          rows
            .map(
              (row) =>
                this.students.get(
                  (this.raw(row, reverse, "studentCode") ?? "").toUpperCase(),
                )?.id,
            )
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const classIds = [
        ...new Set(
          rows
            .map(
              (row) =>
                this.classes.get(
                  (this.raw(row, reverse, "classCode") ?? "").toUpperCase(),
                )?.id,
            )
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      if (studentIds.length && classIds.length) {
        const pairs = await this.client.query<{
          student_id: string;
          class_id: string;
        }>(
          `SELECT student_id, class_id FROM enrollments WHERE tenant_id=$1 AND status IN ${CONSUMING} AND student_id=ANY($2::char(26)[]) AND class_id=ANY($3::char(26)[])`,
          [this.tenantId, studentIds, classIds],
        );
        for (const pair of pairs.rows)
          this.operationalPairs.add(`${pair.student_id}|${pair.class_id}`);
      }
      if (classIds.length) {
        const counts = await this.client.query<{
          class_id: string;
          count: string;
        }>(
          `SELECT class_id, COUNT(*)::text AS count FROM enrollments WHERE tenant_id=$1 AND class_id=ANY($2::char(26)[]) AND status IN ${CONSUMING} GROUP BY class_id`,
          [this.tenantId, classIds],
        );
        for (const row of counts.rows)
          this.consumingByClass.set(row.class_id, Number(row.count));
      }
    }
  }

  private async byCode<T>(
    sql: string,
    codes: string[],
  ): Promise<Array<T & { k: string }>> {
    if (!codes.length) return [];
    const result = await this.client.query<T & { k: string }>(sql, [
      this.tenantId,
      codes,
    ]);
    return result.rows;
  }

  private codesList(
    rows: StagedRow[],
    reverse: Map<string, string>,
    key: string,
  ): string[] {
    const header = reverse.get(key);
    if (!header) return [];
    return [
      ...new Set(
        rows
          .map((row) => (row.sourceData[header] ?? "").trim())
          .filter(Boolean),
      ),
    ];
  }

  private listCellCodes(
    rows: StagedRow[],
    reverse: Map<string, string>,
    key: string,
  ): string[] {
    const values = this.codesList(rows, reverse, key);
    return [
      ...new Set(
        values.flatMap((value) =>
          value
            .split(LIST_DELIMITER)
            .map((item) => item.trim().toUpperCase())
            .filter(Boolean),
        ),
      ),
    ];
  }

  private raw(
    row: StagedRow,
    reverse: Map<string, string>,
    key: string,
  ): string | undefined {
    const header = reverse.get(key);
    if (!header) return undefined;
    const value = row.sourceData[header];
    return value === undefined ? undefined : value.trim();
  }

  validateRow(
    row: StagedRow,
    reverse: Map<string, string>,
    inFileKeys: Map<string, number>,
  ): ValidatedRow {
    const definition = this.definition;
    const errors: RowIssue[] = [];
    const warnings: RowIssue[] = [];
    const plain: Record<string, unknown> = {};
    const normalized: Record<string, unknown> = {};
    const resolved: ValidatedRow["resolved"] = {};
    const relationKeys = new Set(
      definition.fields
        .filter((field) => field.relation)
        .map((field) => field.key),
    );

    const valueOf = (key: string) => this.raw(row, reverse, key);
    const normalizedText = (key: string) => {
      const raw = valueOf(key);
      if (raw === undefined || raw === "") return undefined;
      return raw;
    };

    // 1. Required fields and scalar normalization.
    for (const field of definition.fields) {
      const text = normalizedText(field.key);
      if (field.required && (text === undefined || text === "")) {
        errors.push({
          code: "REQUIRED",
          field: field.key,
          message: `${field.label} là bắt buộc`,
        });
        continue;
      }
      if (text === undefined || relationKeys.has(field.key)) continue;
      if (field.type === "integer") {
        plain[field.key] = /^-?\d+$/.test(text) ? Number(text) : text;
      } else if (field.type === "codeList") {
        const items = text
          .split(LIST_DELIMITER)
          .map((item) => item.trim())
          .filter(Boolean);
        if (items.length !== new Set(items).size) {
          errors.push({
            code: "INVALID_FORMAT",
            field: field.key,
            message: `${field.label} chứa giá trị trùng lặp`,
          });
          continue;
        }
        plain[field.key] = items;
      } else if (field.type === "enum") {
        if (!field.allowedValues!.includes(text)) {
          errors.push({
            code: "INVALID_FORMAT",
            field: field.key,
            message: `${field.label} phải là một trong ${field.allowedValues!.join(", ")}`,
          });
          continue;
        }
        plain[field.key] = text;
      } else {
        plain[field.key] = text;
      }
    }

    // 2. Relationship resolution and per-type invariants.
    const identityValues: string[] = [];
    for (const key of definition.identityFields) {
      const value = normalizedText(key);
      identityValues.push((value ?? "").toUpperCase());
    }
    const identityComplete = identityValues.every((value) => value !== "");

    if (definition.type === "TEACHERS") {
      const raw = normalizedText("branchCodes");
      if (raw !== undefined) {
        const codes = raw
          .split(LIST_DELIMITER)
          .map((item) => item.trim().toUpperCase())
          .filter(Boolean);
        if (codes.length !== new Set(codes).size) {
          errors.push({
            code: "INVALID_FORMAT",
            field: "branchCodes",
            message: "Mã chi nhánh bị trùng trong ô",
          });
        } else {
          const missing = codes.filter((code) => !this.branches.has(code));
          if (missing.length)
            errors.push({
              code: "NOT_FOUND",
              field: "branchCodes",
              message: `Chi nhánh ${missing.join(", ")} không tồn tại`,
            });
          else
            resolved.branchIds = codes.map(
              (code) => this.branches.get(code)!.id,
            );
        }
      }
    }
    if (definition.type === "COURSE_LEVELS") {
      const courseCode = identityValues.length
        ? (normalizedText("courseCode") ?? "").toUpperCase()
        : undefined;
      if (courseCode) {
        const course = this.courses.get(courseCode);
        if (!course)
          errors.push({
            code: "NOT_FOUND",
            field: "courseCode",
            message: `Khóa học ${courseCode} không tồn tại`,
          });
        else resolved.courseId = course.id;
      }
      if (resolved.courseId && identityValues[1]) {
        const exists = (this.levels.get(identityValues[1]) ?? []).some(
          (level) => level.courseId === resolved.courseId,
        );
        if (exists)
          errors.push({
            code: "ALREADY_EXISTS",
            field: "code",
            message: `Cấp độ ${identityValues[1]} đã tồn tại trong khóa học`,
          });
      }
    }
    if (definition.type === "CLASSES") {
      const courseCode = (normalizedText("courseCode") ?? "").toUpperCase();
      if (courseCode) {
        const course = this.courses.get(courseCode);
        if (!course)
          errors.push({
            code: "NOT_FOUND",
            field: "courseCode",
            message: `Khóa học ${courseCode} không tồn tại`,
          });
        else {
          resolved.courseId = course.id;
          if (course.status === "DISABLED")
            errors.push({
              code: "INVALID_RELATION",
              field: "courseCode",
              message: `Khóa học ${courseCode} đang tắt`,
            });
        }
      }
      const branchCode = (normalizedText("branchCode") ?? "").toUpperCase();
      if (branchCode) {
        const branch = this.branches.get(branchCode);
        if (!branch)
          errors.push({
            code: "NOT_FOUND",
            field: "branchCode",
            message: `Chi nhánh ${branchCode} không tồn tại`,
          });
        else {
          resolved.branchId = branch.id;
          if (branch.status === "DISABLED")
            errors.push({
              code: "INVALID_RELATION",
              field: "branchCode",
              message: `Chi nhánh ${branchCode} đang tắt`,
            });
        }
      }
      const levelCode = (normalizedText("courseLevelCode") ?? "").toUpperCase();
      if (levelCode) {
        const candidates = this.levels.get(levelCode) ?? [];
        const level = resolved.courseId
          ? candidates.find(
              (candidate) => candidate.courseId === resolved.courseId,
            )
          : undefined;
        if (!level)
          errors.push({
            code: "INVALID_RELATION",
            field: "courseLevelCode",
            message: `Cấp độ ${levelCode} không thuộc khóa học ${courseCode}`,
          });
        else {
          resolved.courseLevelId = level.id;
          if (level.status === "DISABLED")
            errors.push({
              code: "INVALID_RELATION",
              field: "courseLevelCode",
              message: `Cấp độ ${levelCode} đang tắt`,
            });
        }
      }
      const roomCode = (normalizedText("defaultRoomCode") ?? "").toUpperCase();
      if (roomCode) {
        if (!branchCode) {
          errors.push({
            code: "REQUIRED",
            field: "branchCode",
            message: "Mã chi nhánh là bắt buộc khi có phòng học mặc định",
          });
        } else {
          const room = this.rooms.get(`${branchCode}|${roomCode}`);
          if (!room)
            errors.push({
              code: "NOT_FOUND",
              field: "defaultRoomCode",
              message: `Phòng học ${roomCode} không tồn tại trong chi nhánh ${branchCode}`,
            });
          else if (room.status === "DISABLED")
            errors.push({
              code: "INVALID_RELATION",
              field: "defaultRoomCode",
              message: `Phòng học ${roomCode} đang tắt`,
            });
          else resolved.defaultRoomId = room.id;
        }
      }
      const teacherCode = (
        normalizedText("primaryTeacherCode") ?? ""
      ).toUpperCase();
      if (teacherCode) {
        const teacher = this.teachers.get(teacherCode);
        if (!teacher)
          errors.push({
            code: "NOT_FOUND",
            field: "primaryTeacherCode",
            message: `Giáo viên ${teacherCode} không tồn tại`,
          });
        else {
          resolved.primaryTeacherId = teacher.id;
          if (teacher.status === "DISABLED")
            errors.push({
              code: "INVALID_RELATION",
              field: "primaryTeacherCode",
              message: `Giáo viên ${teacherCode} đang tắt`,
            });
          if (
            branchCode &&
            !this.teacherBranches.has(`${teacherCode}|${branchCode}`)
          ) {
            errors.push({
              code: "INVALID_RELATION",
              field: "primaryTeacherCode",
              message: `Giáo viên ${teacherCode} chưa được gán vào chi nhánh ${branchCode}`,
            });
          }
        }
      }
      if (this.classes.has(identityValues[0] ?? "") && identityValues[0]) {
        errors.push({
          code: "ALREADY_EXISTS",
          field: "code",
          message: `Mã lớp ${identityValues[0]} đã tồn tại`,
        });
      }
      const startDate = plain.startDate as string | undefined;
      const expectedEndDate = plain.expectedEndDate as string | undefined;
      if (
        startDate &&
        expectedEndDate &&
        String(startDate).slice(0, 10) > String(expectedEndDate).slice(0, 10)
      ) {
        errors.push({
          code: "INVALID_FORMAT",
          field: "expectedEndDate",
          message: "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc dự kiến",
        });
      }
    }
    if (definition.type === "ENROLLMENTS") {
      const studentCode = (normalizedText("studentCode") ?? "").toUpperCase();
      const student = studentCode ? this.students.get(studentCode) : undefined;
      if (studentCode && !student)
        errors.push({
          code: "NOT_FOUND",
          field: "studentCode",
          message: `Học viên ${studentCode} không tồn tại`,
        });
      const classCode = (normalizedText("classCode") ?? "").toUpperCase();
      const classRow = classCode ? this.classes.get(classCode) : undefined;
      if (classCode && !classRow)
        errors.push({
          code: "NOT_FOUND",
          field: "classCode",
          message: `Lớp học ${classCode} không tồn tại`,
        });
      const status = (plain.status as string | undefined) ?? "PENDING";
      const active = status !== "PENDING";
      if (student) {
        resolved.studentId = student.id;
        if (active && student.status !== "ACTIVE")
          errors.push({
            code: "INVALID_RELATION",
            field: "studentCode",
            message: `Học viên ${studentCode} đang tắt`,
          });
      }
      if (classRow) {
        resolved.classId = classRow.id;
        if (active && classRow.status !== "ACTIVE")
          errors.push({
            code: "INVALID_RELATION",
            field: "classCode",
            message: `Lớp học ${classCode} đang tắt`,
          });
      }
      if (
        student &&
        classRow &&
        this.operationalPairs.has(`${student.id}|${classRow.id}`)
      ) {
        errors.push({
          code: "ALREADY_EXISTS",
          field: "classCode",
          message: `Học viên ${studentCode} đã có ghi danh đang hoạt động trong lớp ${classCode}`,
        });
      }
    }

    // 3. In-file identity duplicates: the first occurrence wins.
    const identity = identityValues.join("|");
    if (identityComplete) {
      const first = inFileKeys.get(identity);
      if (first !== undefined && first !== row.rowNumber) {
        errors.push({
          code: "DUPLICATE_IN_FILE",
          field: definition.identityFields[0],
          message: `Trùng với dòng ${first} trong tệp`,
        });
      } else {
        inFileKeys.set(identity, row.rowNumber);
      }
    }

    // Existing-code duplicates for simple code identities.
    if (identityComplete) {
      if (
        definition.type === "STUDENTS" &&
        this.students.has(identityValues[0])
      ) {
        errors.push({
          code: "ALREADY_EXISTS",
          field: "code",
          message: `Mã học viên ${identityValues[0]} đã tồn tại`,
        });
      }
      if (
        definition.type === "TEACHERS" &&
        this.teachers.has(identityValues[0])
      ) {
        errors.push({
          code: "ALREADY_EXISTS",
          field: "code",
          message: `Mã giáo viên ${identityValues[0]} đã tồn tại`,
        });
      }
      if (
        definition.type === "COURSES" &&
        this.courses.has(identityValues[0])
      ) {
        errors.push({
          code: "ALREADY_EXISTS",
          field: "code",
          message: `Mã khóa học ${identityValues[0]} đã tồn tại`,
        });
      }
    }

    // 4. Scalar DTO validation reuses the manual create contract.
    const suppressed = new Set(
      definition.type === "CLASSES"
        ? [
            "courseId",
            "branchId",
            "courseLevelId",
            "defaultRoomId",
            "primaryTeacherId",
          ]
        : definition.type === "ENROLLMENTS"
          ? ["studentId", "classId"]
          : [],
    );
    const dtoPlain: Record<string, unknown> = { ...plain };
    if (definition.type === "CLASSES") {
      dtoPlain.courseId = resolved.courseId;
      dtoPlain.branchId = resolved.branchId;
      dtoPlain.courseLevelId = resolved.courseLevelId;
      dtoPlain.defaultRoomId = resolved.defaultRoomId;
      dtoPlain.primaryTeacherId = resolved.primaryTeacherId;
    }
    if (definition.type === "ENROLLMENTS") {
      dtoPlain.studentId = resolved.studentId;
      dtoPlain.classId = resolved.classId;
    }
    const dto = plainToInstance(dtoClassFor(definition.type) as ClassConstructor<object>, dtoPlain);
    const dtoErrors = validateSync(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    let instanceUsable = true;
    for (const error of dtoErrors) {
      if (suppressed.has(error.property)) continue;
      const constraints = Object.entries(error.constraints ?? {});
      if (!constraints.length) {
        instanceUsable = false;
        continue;
      }
      const [constraint, message] = constraints[0];
      const code =
        constraint === "IsNotEmpty" || constraint === "IsDefined"
          ? "REQUIRED"
          : "INVALID_FORMAT";
      if (code === "REQUIRED") instanceUsable = false;
      errors.push({ code, field: error.property, message });
    }

    // 5. Portable normalized projection for preview.
    const record = dto as unknown as Record<string, unknown>;
    for (const field of definition.fields) {
      if (relationKeys.has(field.key)) {
        const raw = normalizedText(field.key);
        if (raw !== undefined) {
          normalized[field.key] =
            field.type === "codeList"
              ? raw
                  .split(LIST_DELIMITER)
                  .map((item) => item.trim().toUpperCase())
                  .filter(Boolean)
                  .join(LIST_DELIMITER)
              : raw.toUpperCase();
        }
        continue;
      }
      if (!instanceUsable) {
        if (field.key in plain) normalized[field.key] = plain[field.key];
        continue;
      }
      if (field.key in record && record[field.key] !== undefined) {
        normalized[field.key] =
          field.type === "code"
            ? String(record[field.key]).toUpperCase()
            : record[field.key];
      }
    }
    if (definition.type === "STUDENTS" && typeof normalized.email === "string")
      normalized.email = normalized.email.toLowerCase();

    // 6. Contact-match warnings (never blocking, never merging).
    if (definition.type === "STUDENTS") {
      const phone = normalized.phone as string | undefined;
      if (phone && this.existingPhones.has(phone))
        warnings.push({
          code: "DUPLICATE_CONTACT",
          field: "phone",
          message: `Điện thoại ${phone} đã được dùng bởi học viên khác`,
        });
      const email =
        typeof normalized.email === "string" ? normalized.email : undefined;
      if (email && this.existingEmails.has(email))
        warnings.push({
          code: "DUPLICATE_CONTACT",
          field: "email",
          message: `Email ${email} đã được dùng bởi học viên khác`,
        });
    }

    return {
      rowNumber: row.rowNumber,
      sourceKey: identityComplete ? identity : "",
      status: errors.length ? "INVALID" : "VALID",
      errors,
      warnings,
      normalized,
      dto,
      resolved,
    };
  }

  // Grouped capacity check for ENROLLMENTS: existing consuming seats plus the
  // batch's own demand must fit each referenced class's capacity.
  capacityDemandErrors(rows: ValidatedRow[]): Map<number, RowIssue> {
    const conflicts = new Map<number, RowIssue>();
    if (this.definition.type !== "ENROLLMENTS") return conflicts;
    const demand = new Map<string, number>();
    const label = new Map<string, string>();
    for (const row of rows) {
      if (row.status !== "VALID" || !row.resolved.classId) continue;
      demand.set(
        row.resolved.classId,
        (demand.get(row.resolved.classId) ?? 0) + 1,
      );
      label.set(
        row.resolved.classId,
        String(row.normalized.classCode ?? row.resolved.classId),
      );
    }
    for (const [classId, count] of demand) {
      let capacity: number | null = null;
      let classCode = label.get(classId) ?? classId;
      for (const [code, ref] of this.classes)
        if (ref.id === classId) {
          capacity = ref.capacity;
          classCode = code;
          break;
        }
      if (capacity == null) continue;
      const existing = this.consumingByClass.get(classId) ?? 0;
      if (existing + count > capacity) {
        const error: RowIssue = {
          code: "CAPACITY_CONFLICT",
          field: "classCode",
          message: `Lớp ${classCode} chỉ còn ${Math.max(0, capacity - existing)} chỗ trống nhưng tệp cần ${count}`,
        };
        for (const row of rows)
          if (row.status === "VALID" && row.resolved.classId === classId)
            conflicts.set(row.rowNumber, error);
      }
    }
    return conflicts;
  }
}
``;

function dtoClassFor(type: ImportTypeDefinition["type"]) {
  switch (type) {
    case "STUDENTS":
      return CreateStudentDto;
    case "TEACHERS":
      return CreateTeacherDto;
    case "COURSES":
      return CreateCourseDto;
    case "COURSE_LEVELS":
      return CreateCourseLevelDto;
    case "CLASSES":
      return CreateClassDto;
    case "ENROLLMENTS":
      return CreateEnrollmentDto;
  }
}
