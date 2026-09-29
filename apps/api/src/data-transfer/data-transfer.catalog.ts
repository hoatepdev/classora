import { BadRequestException } from '@nestjs/common';
import type { Permission } from '../authorization/permissions.js';

export const IMPORT_TYPES = ['STUDENTS', 'TEACHERS', 'COURSES', 'COURSE_LEVELS', 'CLASSES', 'ENROLLMENTS'] as const;
export type ImportType = (typeof IMPORT_TYPES)[number];

export type ImportField = {
  key: string;
  label: string;
  required: boolean;
  type: 'text' | 'email' | 'date' | 'datetime' | 'integer' | 'enum' | 'code' | 'codeList';
  allowedValues?: readonly string[];
  relation?: 'course' | 'courseLevel' | 'branch' | 'room' | 'teacher' | 'student' | 'class' | 'branchList';
  example: string;
};

export type ImportTypeDefinition = {
  type: ImportType;
  label: string;
  order: number;
  dependsOn: string;
  writePermission: Permission;
  readPermission: Permission;
  fields: readonly ImportField[];
  identityFields: readonly string[];
};

export type ExportColumn = { key: string; label: string; sql: string };
export type ExportFilter = 'status' | 'branchId' | 'courseId' | 'classId';

export type ExportTypeDefinition = {
  type: ImportType;
  label: string;
  readPermission: Permission;
  filters: readonly ExportFilter[];
  statusValues?: readonly string[];
  columns: readonly ExportColumn[];
};

// One deliberate list delimiter across all import types (spec: LOCAL-16).
export const LIST_DELIMITER = '|';

export const IMPORT_CATALOG: Readonly<Record<ImportType, ImportTypeDefinition>> = {
  STUDENTS: {
    type: 'STUDENTS',
    label: 'Học viên',
    order: 3,
    dependsOn: 'Không có. Nên import trước khi import Ghi danh.',
    writePermission: 'student.write',
    readPermission: 'student.read',
    identityFields: ['code'],
    fields: [
      { key: 'code', label: 'Mã học viên', required: true, type: 'code', example: 'ST001' },
      { key: 'fullName', label: 'Họ và tên', required: true, type: 'text', example: 'Nguyễn Văn A' },
      { key: 'phone', label: 'Điện thoại', required: false, type: 'text', example: '0901234567' },
      { key: 'email', label: 'Email', required: false, type: 'email', example: 'a@example.com' },
      { key: 'dateOfBirth', label: 'Ngày sinh', required: false, type: 'date', example: '2010-05-20' },
      { key: 'gender', label: 'Giới tính', required: false, type: 'enum', allowedValues: ['UNSPECIFIED', 'FEMALE', 'MALE', 'OTHER'], example: 'FEMALE' },
      { key: 'address', label: 'Địa chỉ', required: false, type: 'text', example: '12 Nguyễn Trãi, Hà Nội' },
      { key: 'school', label: 'Trường', required: false, type: 'text', example: 'THCS Chu Văn An' },
      { key: 'source', label: 'Nguồn', required: false, type: 'text', example: 'Giới thiệu' },
      { key: 'status', label: 'Trạng thái', required: false, type: 'enum', allowedValues: ['ACTIVE', 'DISABLED'], example: 'ACTIVE' },
    ],
  },
  TEACHERS: {
    type: 'TEACHERS',
    label: 'Giáo viên',
    order: 2,
    dependsOn: 'Chi nhánh phải tồn tại trước nếu có cột branchCodes.',
    writePermission: 'teacher.write',
    readPermission: 'teacher.read',
    identityFields: ['code'],
    fields: [
      { key: 'code', label: 'Mã giáo viên', required: true, type: 'code', example: 'T001' },
      { key: 'name', label: 'Họ và tên', required: true, type: 'text', example: 'Trần Thị B' },
      { key: 'phone', label: 'Điện thoại', required: false, type: 'text', example: '0912345678' },
      { key: 'email', label: 'Email', required: false, type: 'email', example: 'b@example.com' },
      { key: 'note', label: 'Ghi chú', required: false, type: 'text', example: 'Giảng viên IELTS' },
      { key: 'specialties', label: 'Chuyên môn (phân tách bằng |)', required: false, type: 'codeList', example: 'IELTS|TOEIC' },
      { key: 'status', label: 'Trạng thái', required: false, type: 'enum', allowedValues: ['ACTIVE', 'DISABLED'], example: 'ACTIVE' },
      { key: 'branchCodes', label: 'Mã chi nhánh (phân tách bằng |)', required: false, type: 'codeList', relation: 'branchList', example: 'HN|HCM' },
    ],
  },
  COURSES: {
    type: 'COURSES',
    label: 'Khóa học',
    order: 0,
    dependsOn: 'Không có. Import trước Cấp độ và Lớp học.',
    writePermission: 'course.write',
    readPermission: 'course.read',
    identityFields: ['code'],
    fields: [
      { key: 'code', label: 'Mã khóa học', required: true, type: 'code', example: 'ENG-ADULT' },
      { key: 'name', label: 'Tên khóa học', required: true, type: 'text', example: 'Tiếng Anh người lớn' },
      { key: 'description', label: 'Mô tả', required: false, type: 'text', example: 'Chương trình 6 tháng' },
      { key: 'status', label: 'Trạng thái', required: false, type: 'enum', allowedValues: ['ACTIVE', 'DISABLED'], example: 'ACTIVE' },
    ],
  },
  COURSE_LEVELS: {
    type: 'COURSE_LEVELS',
    label: 'Cấp độ khóa học',
    order: 1,
    dependsOn: 'Khóa học phải tồn tại trước (cột courseCode).',
    writePermission: 'course.write',
    readPermission: 'course.read',
    identityFields: ['courseCode', 'code'],
    fields: [
      { key: 'courseCode', label: 'Mã khóa học', required: true, type: 'code', relation: 'course', example: 'ENG-ADULT' },
      { key: 'code', label: 'Mã cấp độ', required: true, type: 'code', example: 'L1' },
      { key: 'name', label: 'Tên cấp độ', required: true, type: 'text', example: 'Cấp độ 1' },
      { key: 'displayOrder', label: 'Thứ tự hiển thị', required: true, type: 'integer', example: '1' },
      { key: 'description', label: 'Mô tả', required: false, type: 'text', example: 'Sơ cấp' },
      { key: 'status', label: 'Trạng thái', required: false, type: 'enum', allowedValues: ['ACTIVE', 'DISABLED'], example: 'ACTIVE' },
    ],
  },
  CLASSES: {
    type: 'CLASSES',
    label: 'Lớp học',
    order: 4,
    dependsOn: 'Khóa học, Cấp độ, Chi nhánh, Phòng học và Giáo viên phải tồn tại trước khi được tham chiếu.',
    writePermission: 'class.write',
    readPermission: 'class.read',
    identityFields: ['code'],
    fields: [
      { key: 'code', label: 'Mã lớp', required: true, type: 'code', example: 'CLS-01' },
      { key: 'name', label: 'Tên lớp', required: true, type: 'text', example: 'IELTS Evening 1' },
      { key: 'courseCode', label: 'Mã khóa học', required: true, type: 'code', relation: 'course', example: 'ENG-ADULT' },
      { key: 'courseLevelCode', label: 'Mã cấp độ', required: false, type: 'code', relation: 'courseLevel', example: 'L1' },
      { key: 'branchCode', label: 'Mã chi nhánh', required: false, type: 'code', relation: 'branch', example: 'HN' },
      { key: 'defaultRoomCode', label: 'Mã phòng học', required: false, type: 'code', relation: 'room', example: 'R101' },
      { key: 'primaryTeacherCode', label: 'Mã giáo viên chủ nhiệm', required: false, type: 'code', relation: 'teacher', example: 'T001' },
      { key: 'description', label: 'Mô tả', required: false, type: 'text', example: 'Lớp tối thứ 2-4-6' },
      { key: 'capacity', label: 'Sĩ số tối đa', required: false, type: 'integer', example: '20' },
      { key: 'startDate', label: 'Ngày bắt đầu', required: false, type: 'date', example: '2026-10-01' },
      { key: 'expectedEndDate', label: 'Ngày kết thúc dự kiến', required: false, type: 'date', example: '2027-01-31' },
      { key: 'status', label: 'Trạng thái', required: false, type: 'enum', allowedValues: ['ACTIVE', 'DISABLED'], example: 'ACTIVE' },
    ],
  },
  ENROLLMENTS: {
    type: 'ENROLLMENTS',
    label: 'Ghi danh',
    order: 5,
    dependsOn: 'Học viên và Lớp học phải tồn tại trước. Chỉ nhận trạng thái ban đầu PENDING/TRIAL/ACTIVE.',
    writePermission: 'enrollment.write',
    readPermission: 'enrollment.read',
    identityFields: ['studentCode', 'classCode'],
    fields: [
      { key: 'studentCode', label: 'Mã học viên', required: true, type: 'code', relation: 'student', example: 'ST001' },
      { key: 'classCode', label: 'Mã lớp', required: true, type: 'code', relation: 'class', example: 'CLS-01' },
      { key: 'status', label: 'Trạng thái ban đầu', required: false, type: 'enum', allowedValues: ['PENDING', 'TRIAL', 'ACTIVE'], example: 'ACTIVE' },
      { key: 'enrolledAt', label: 'Ngày ghi danh', required: false, type: 'datetime', example: '2026-10-05T08:00:00Z' },
      { key: 'expectedEndDate', label: 'Ngày kết thúc dự kiến', required: false, type: 'date', example: '2027-01-31' },
      { key: 'notes', label: 'Ghi chú', required: false, type: 'text', example: 'Học lại từ tháng 10' },
    ],
  },
};

export const EXPORT_CATALOG: Readonly<Record<ImportType, ExportTypeDefinition>> = {
  STUDENTS: {
    type: 'STUDENTS',
    label: 'Học viên',
    readPermission: 'student.read',
    filters: ['status'],
    statusValues: ['ACTIVE', 'DISABLED'],
    columns: [
      { key: 'code', label: 'Mã học viên', sql: 's.code' },
      { key: 'fullName', label: 'Họ và tên', sql: 's.full_name' },
      { key: 'phone', label: 'Điện thoại', sql: 's.phone' },
      { key: 'email', label: 'Email', sql: 's.email' },
      { key: 'dateOfBirth', label: 'Ngày sinh', sql: 's.date_of_birth::text' },
      { key: 'gender', label: 'Giới tính', sql: 's.gender' },
      { key: 'address', label: 'Địa chỉ', sql: 's.address' },
      { key: 'school', label: 'Trường', sql: 's.school' },
      { key: 'source', label: 'Nguồn', sql: 's.source' },
      { key: 'status', label: 'Trạng thái', sql: 's.status' },
      { key: 'createdAt', label: 'Ngày tạo', sql: 's.created_at' },
    ],
  },
  TEACHERS: {
    type: 'TEACHERS',
    label: 'Giáo viên',
    readPermission: 'teacher.read',
    filters: ['status', 'branchId'],
    statusValues: ['ACTIVE', 'DISABLED'],
    columns: [
      { key: 'code', label: 'Mã giáo viên', sql: 't.code' },
      { key: 'name', label: 'Họ và tên', sql: 't.name' },
      { key: 'phone', label: 'Điện thoại', sql: 't.phone' },
      { key: 'email', label: 'Email', sql: 't.email' },
      { key: 'note', label: 'Ghi chú', sql: 't.note' },
      { key: 'specialties', label: 'Chuyên môn (phân tách bằng |)', sql: "array_to_string(t.specialties, '|')" },
      { key: 'branchCodes', label: 'Mã chi nhánh (phân tách bằng |)', sql: "(SELECT string_agg(b.code, '|' ORDER BY b.code) FROM teacher_branches tb JOIN branches b ON b.tenant_id = tb.tenant_id AND b.id = tb.branch_id WHERE tb.tenant_id = t.tenant_id AND tb.teacher_id = t.id)" },
      { key: 'status', label: 'Trạng thái', sql: 't.status' },
      { key: 'createdAt', label: 'Ngày tạo', sql: 't.created_at' },
    ],
  },
  COURSES: {
    type: 'COURSES',
    label: 'Khóa học',
    readPermission: 'course.read',
    filters: ['status'],
    statusValues: ['ACTIVE', 'DISABLED'],
    columns: [
      { key: 'code', label: 'Mã khóa học', sql: 'c.code' },
      { key: 'name', label: 'Tên khóa học', sql: 'c.name' },
      { key: 'description', label: 'Mô tả', sql: 'c.description' },
      { key: 'status', label: 'Trạng thái', sql: 'c.status' },
      { key: 'createdAt', label: 'Ngày tạo', sql: 'c.created_at' },
    ],
  },
  COURSE_LEVELS: {
    type: 'COURSE_LEVELS',
    label: 'Cấp độ khóa học',
    readPermission: 'course.read',
    filters: ['status', 'courseId'],
    statusValues: ['ACTIVE', 'DISABLED'],
    columns: [
      { key: 'courseCode', label: 'Mã khóa học', sql: 'course.code' },
      { key: 'code', label: 'Mã cấp độ', sql: 'l.code' },
      { key: 'name', label: 'Tên cấp độ', sql: 'l.name' },
      { key: 'displayOrder', label: 'Thứ tự hiển thị', sql: 'l.display_order' },
      { key: 'description', label: 'Mô tả', sql: 'l.description' },
      { key: 'status', label: 'Trạng thái', sql: 'l.status' },
      { key: 'createdAt', label: 'Ngày tạo', sql: 'l.created_at' },
    ],
  },
  CLASSES: {
    type: 'CLASSES',
    label: 'Lớp học',
    readPermission: 'class.read',
    filters: ['status', 'branchId', 'courseId'],
    statusValues: ['ACTIVE', 'DISABLED', 'COMPLETED'],
    columns: [
      { key: 'code', label: 'Mã lớp', sql: 'k.code' },
      { key: 'name', label: 'Tên lớp', sql: 'k.name' },
      { key: 'courseCode', label: 'Mã khóa học', sql: 'course.code' },
      { key: 'courseLevelCode', label: 'Mã cấp độ', sql: 'level.code' },
      { key: 'branchCode', label: 'Mã chi nhánh', sql: 'branch.code' },
      { key: 'defaultRoomCode', label: 'Mã phòng học', sql: 'room.code' },
      { key: 'primaryTeacherCode', label: 'Mã giáo viên chủ nhiệm', sql: 'teacher.code' },
      { key: 'description', label: 'Mô tả', sql: 'k.description' },
      { key: 'capacity', label: 'Sĩ số tối đa', sql: 'k.capacity' },
      { key: 'startDate', label: 'Ngày bắt đầu', sql: 'k.start_date::text' },
      { key: 'expectedEndDate', label: 'Ngày kết thúc dự kiến', sql: 'k.expected_end_date::text' },
      { key: 'status', label: 'Trạng thái', sql: 'k.status' },
      { key: 'createdAt', label: 'Ngày tạo', sql: 'k.created_at' },
    ],
  },
  ENROLLMENTS: {
    type: 'ENROLLMENTS',
    label: 'Ghi danh',
    readPermission: 'enrollment.read',
    filters: ['status', 'classId'],
    statusValues: ['PENDING', 'TRIAL', 'ACTIVE', 'PAUSED', 'COMPLETED', 'WITHDRAWN', 'CANCELLED'],
    columns: [
      { key: 'studentCode', label: 'Mã học viên', sql: 's.code' },
      { key: 'studentName', label: 'Tên học viên', sql: 's.full_name' },
      { key: 'classCode', label: 'Mã lớp', sql: 'k.code' },
      { key: 'className', label: 'Tên lớp', sql: 'k.name' },
      { key: 'status', label: 'Trạng thái', sql: 'e.status' },
      { key: 'enrolledAt', label: 'Ngày ghi danh', sql: 'e.enrolled_at' },
      { key: 'expectedEndDate', label: 'Ngày kết thúc dự kiến', sql: 'e.expected_end_date::text' },
      { key: 'notes', label: 'Ghi chú', sql: 'e.notes' },
      { key: 'createdAt', label: 'Ngày tạo', sql: 'e.created_at' },
    ],
  },
};

export function importTypeDefinition(type: string): ImportTypeDefinition {
  const definition = IMPORT_TYPES.includes(type as ImportType) ? IMPORT_CATALOG[type as ImportType] : undefined;
  if (!definition) throw new BadRequestException('Loại import không được hỗ trợ');
  return definition;
}

export function exportTypeDefinition(type: string): ExportTypeDefinition {
  const definition = IMPORT_TYPES.includes(type as ImportType) ? EXPORT_CATALOG[type as ImportType] : undefined;
  if (!definition) throw new BadRequestException('Loại kết xuất không được hỗ trợ');
  return definition;
}
