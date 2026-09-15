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
import { ClassSchedulesSection } from "../schedules/ClassSchedulesSection.js";
import { listStudents, studentQueryKey } from "../students/api.js";
import { classQueryKey, getClass } from "./api.js";

const dateFormatter = new Intl.DateTimeFormat("vi-VN");

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
  const students = useQuery({
    queryKey: studentQueryKey(),
    queryFn: listStudents,
  });
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
    mutationFn: withdrawEnrollment,
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
  ];
  const activeStudentIds = new Set(
    enrollments.data?.filter((enrollment) => enrollment.status === "ACTIVE").map((enrollment) => enrollment.studentId),
  );
  const availableStudents = students.data?.filter(
    (student) => student.status === "ACTIVE" && !activeStudentIds.has(student.id),
  ) ?? [];

  return <main className="page">
    <div className="page-heading">
      <div><h1>{classRecord.data.name}</h1><p className="subtitle">Thông tin lớp học đang lưu tại trung tâm.</p></div>
      <Link className="button" to={`/classes/${classRecord.data.id}/edit`}>Chỉnh sửa</Link>
    </div>
    <dl className="detail-sheet">
      {fields.map(([label, value]) => <div className="detail-field" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
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
            <td data-label="Trạng thái"><span className={`status ${enrollment.status === "WITHDRAWN" ? "disabled" : ""}`}>{enrollment.status === "ACTIVE" ? "Đang học" : "Đã rút"}</span></td>
            <td data-label="Ngày ghi danh">{dateFormatter.format(new Date(enrollment.enrolledAt))}</td>
            <td data-label="Thao tác">{enrollment.status === "ACTIVE" ? <button className="action-button" type="button" disabled={withdraw.isPending} onClick={() => withdraw.mutate(enrollment.id)}>Rút khỏi lớp</button> : "—"}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>

    <ClassSchedulesSection classId={classRecord.data.id} />

    <div className="form-actions"><Link className="button secondary" to="/classes">Quay lại danh sách</Link></div>
  </main>;
}
