import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  classEnrollmentQueryKey,
  createEnrollment,
  listClassEnrollments,
  studentEnrollmentQueryKey,
  withdrawEnrollment,
} from "../enrollments/api.js";
import { EnrollmentLifecycleActions } from "../enrollments/EnrollmentLifecycleActions.js";
import { ClassAttendanceSection } from "../attendance/ClassAttendanceSection.js";
import { currentTenantQueryKey, currentUserQueryKey, getCurrentTenant, getCurrentUser } from "@/auth/api";
import { can } from "@/auth/permissions";
import { ClassSchedulesSection } from "../schedules/ClassSchedulesSection.js";
import { listUpcomingSessions, upcomingSessionQueryKey } from "../schedules/api.js";
import type { Session } from "../schedules/types.js";
import { listStudents, studentQueryKey } from "../students/api.js";
import { classQueryKey, getClass } from "./api.js";

const dateFormatter = new Intl.DateTimeFormat("vi-VN");
const sessionDateFormatter = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

function upcomingDateRange() {
  const from = new Date();
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + 30);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function UpcomingSessionsSection({ query }: { query: { isPending: boolean; isError: boolean; data?: Session[]; refetch: () => unknown } }) {
  return <section className="relationship-section" aria-labelledby="class-upcoming-sessions-heading">
    <div className="relationship-heading"><div><h2 id="class-upcoming-sessions-heading">Buổi học sắp tới</h2><p className="subtitle">Các Session trong 30 ngày tới của lớp.</p></div></div>
    {query.isPending ? <div className="state">Đang tải buổi học…</div> : query.isError ? <div className="state error" role="alert">Không thể tải buổi học của lớp.</div> : !query.data?.length ? <div className="state">Chưa có buổi học sắp tới.</div> : <div className="register"><table><thead><tr><th>Ngày</th><th>Thời gian</th><th>Giáo viên</th><th>Phòng học</th><th>Trạng thái</th></tr></thead><tbody>{query.data.map((session) => <tr key={session.id}><td data-label="Ngày">{sessionDateFormatter.format(new Date(`${session.sessionDate}T00:00:00Z`))}</td><td className="code" data-label="Thời gian">{session.startTime}–{session.endTime}</td><td data-label="Giáo viên">{session.teacherName ?? "—"}</td><td data-label="Phòng học">{session.roomName ?? "—"}</td><td data-label="Trạng thái"><span className={`status ${session.status !== "SCHEDULED" ? "disabled" : ""}`}>{session.status === "SCHEDULED" ? "Đã lên lịch" : session.status === "COMPLETED" ? "Đã hoàn thành" : session.status === "CANCELLED" ? "Đã hủy" : "Đã dời lịch"}</span></td></tr>)}</tbody></table></div>}
  </section>;
}

export function ClassDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [studentId, setStudentId] = useState("");
  const [mutationError, setMutationError] = useState("");
  const classRecord = useQuery({
    queryKey: [...classQueryKey(), id],
    queryFn: () => getClass(id!),
    enabled: Boolean(id),
  });
  const enrollments = useQuery({
    queryKey: classEnrollmentQueryKey(id ?? ""),
    queryFn: () => listClassEnrollments(id!),
    enabled: Boolean(id),
  });
  const upcomingRange = upcomingDateRange();
  const upcomingSessions = useQuery({
    queryKey: upcomingSessionQueryKey({ ...upcomingRange, classId: id, status: "SCHEDULED" }),
    queryFn: () => listUpcomingSessions({ ...upcomingRange, classId: id, status: "SCHEDULED" }),
    enabled: Boolean(id),
  });
  const students = useQuery({
    queryKey: studentQueryKey(),
    queryFn: () => listStudents(),
  });
  const user = useQuery({ queryKey: currentUserQueryKey(), queryFn: getCurrentUser });
  const tenant = useQuery({ queryKey: currentTenantQueryKey(), queryFn: getCurrentTenant });
  const membership = user.data?.memberships.find((item) => item.tenantId === tenant.data?.tenantId);
  const canEnrollmentWrite = can(membership, "enrollment.write");
  const enroll = useMutation({
    mutationFn: createEnrollment,
    onSuccess: async (enrollment) => {
      setMutationError("");
      setStudentId("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: classEnrollmentQueryKey(enrollment.classId) }),
        queryClient.invalidateQueries({ queryKey: studentEnrollmentQueryKey(enrollment.studentId) }),
      ]);
    },
    onError: (error) => {
      setMutationError(
        axios.isAxiosError(error) && error.response?.status === 409
          ? "Học viên đã được ghi danh vào lớp này."
          : "Không thể ghi danh học viên. Vui lòng thử lại.",
      );
    },
  });
  const withdraw = useMutation({
    mutationFn: (id: string) => withdrawEnrollment(id),
    onSuccess: async (enrollment) => {
      setMutationError("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: classEnrollmentQueryKey(enrollment.classId) }),
        queryClient.invalidateQueries({ queryKey: studentEnrollmentQueryKey(enrollment.studentId) }),
      ]);
    },
    onError: () => setMutationError("Không thể rút học viên khỏi lớp. Vui lòng thử lại."),
  });

  if (classRecord.isPending) {
    return <main className="page"><div className="state">Đang tải thông tin lớp học…</div></main>;
  }
  if (classRecord.isError) {
    const notFound = axios.isAxiosError(classRecord.error) && classRecord.error.response?.status === 404;
    return <main className="page"><div className="state error" role="alert">
      <strong>{notFound ? "Không tìm thấy lớp học" : "Không thể tải lớp học"}</strong>
      Quay lại danh sách và thử lại.
    </div></main>;
  }

  const fields = [
    ["Mã lớp", classRecord.data.code],
    ["Tên lớp", classRecord.data.name],
    ["Mô tả", classRecord.data.description ?? "—"],
    ["Chi nhánh", classRecord.data.branchName ? `${classRecord.data.branchCode} — ${classRecord.data.branchName}` : "—"],
    ["Cấp độ", classRecord.data.courseLevelName ? `${classRecord.data.courseLevelCode} — ${classRecord.data.courseLevelName}` : "—"],
    ["Phòng học mặc định", classRecord.data.defaultRoomName ? `${classRecord.data.defaultRoomCode} — ${classRecord.data.defaultRoomName}` : "—"],
    ["Giáo viên phụ trách", classRecord.data.primaryTeacherName ?? "—"],
    ["Sức chứa", classRecord.data.capacity ? `${classRecord.data.capacity} người` : "—"],
    ["Thời gian", classRecord.data.startDate || classRecord.data.expectedEndDate ? `${classRecord.data.startDate?.slice(0, 10) ?? "?"} – ${classRecord.data.expectedEndDate?.slice(0, 10) ?? "?"}` : "—"],
  ];
  const activeStudentIds = new Set(
    enrollments.data?.filter((enrollment) => ["PENDING", "TRIAL", "ACTIVE", "PAUSED"].includes(enrollment.status)).map((enrollment) => enrollment.studentId),
  );
  const availableStudents = students.data?.data.filter(
    (student) => student.status === "ACTIVE" && !activeStudentIds.has(student.id),
  ) ?? [];

  return <main className="page">
    <div className="page-heading">
      <div><h1>{classRecord.data.name}</h1><p className="subtitle">Thông tin lớp học đang lưu tại trung tâm.</p></div>
      <Link className="button" to={`/classes/${classRecord.data.id}/edit`}>Chỉnh sửa</Link>
    </div>
    <dl className="detail-sheet">
      {fields.map(([label, value]) => <div className="detail-field" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      <div className="detail-field"><dt>Khóa học</dt><dd>{classRecord.data.courseId && classRecord.data.courseCode && classRecord.data.courseName ? <Link className="action-link" to={`/courses/${classRecord.data.courseId}`}>{classRecord.data.courseCode} — {classRecord.data.courseName}</Link> : "—"}</dd></div>
      <div className="detail-field"><dt>Trạng thái</dt><dd><span className={`status ${classRecord.data.status === "DISABLED" ? "disabled" : ""}`}>{classRecord.data.status === "ACTIVE" ? "Đang hoạt động" : "Ngừng hoạt động"}</span></dd></div>
    </dl>

    <section className="relationship-section" aria-labelledby="class-students-heading">
      <div className="relationship-heading">
        <div><h2 id="class-students-heading">Học viên</h2><p className="subtitle">Học viên đã ghi danh vào lớp.</p></div>
        <div className="enrollment-control">
          <label className="sr-only" htmlFor="student-enrollment">Chọn học viên</label>
          <select
            className="input"
            id="student-enrollment"
            value={studentId}
            onChange={(event) => setStudentId(event.target.value)}
            disabled={students.isPending || students.isError || enroll.isPending}
          >
            <option value="">Chọn học viên</option>
            {availableStudents.map((student) => <option key={student.id} value={student.id}>{student.code} — {student.fullName}</option>)}
          </select>
          <button
            className="button"
            type="button"
            disabled={!studentId || enroll.isPending}
            onClick={() => enroll.mutate({ studentId, classId: classRecord.data.id })}
          >Ghi danh</button>
        </div>
      </div>
      {mutationError && <p className="form-error" role="alert">{mutationError}</p>}
      {enrollments.isPending ? <div className="state">Đang tải học viên…</div> : enrollments.isError ? <div className="state error" role="alert">Không thể tải học viên của lớp.</div> : enrollments.data.length === 0 ? <div className="state">Chưa có học viên ghi danh.</div> : <div className="register">
        <table>
          <thead><tr><th>Mã học viên</th><th>Họ và tên</th><th>Trạng thái</th><th>Ngày ghi danh</th><th>Thao tác</th></tr></thead>
          <tbody>{enrollments.data.map((enrollment) => <tr key={enrollment.id}>
            <td className="code" data-label="Mã học viên">{enrollment.studentCode}</td>
            <td className="name" data-label="Họ và tên"><Link className="action-link" to={`/students/${enrollment.studentId}`}>{enrollment.studentFullName}</Link></td>
            <td data-label="Trạng thái"><span className={`status ${enrollment.status === "WITHDRAWN" ? "disabled" : ""}`}>{enrollment.status === "ACTIVE" ? "Đang học" : enrollment.status === "PAUSED" ? "Tạm dừng" : enrollment.status === "PENDING" ? "Chờ bắt đầu" : enrollment.status === "TRIAL" ? "Học thử" : enrollment.status === "COMPLETED" ? "Đã hoàn thành" : enrollment.status === "CANCELLED" ? "Đã hủy" : "Đã rút"}</span></td>
            <td data-label="Ngày ghi danh">{dateFormatter.format(new Date(enrollment.enrolledAt))}</td>
            <td data-label="Thao tác"><EnrollmentLifecycleActions enrollment={enrollment} canWrite={canEnrollmentWrite} /></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>

    <ClassSchedulesSection classId={classRecord.data.id} />
    <UpcomingSessionsSection query={upcomingSessions} />
    <ClassAttendanceSection classId={classRecord.data.id} />

    <div className="form-actions"><Link className="button secondary" to="/classes">Quay lại danh sách</Link></div>
  </main>;
}
