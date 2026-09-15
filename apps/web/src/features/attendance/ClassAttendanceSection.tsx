import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { classScheduleQueryKey, listClassSchedules } from "../schedules/api.js";
import { listTeachers, teacherQueryKey } from "../teachers/api.js";
import {
  classAttendanceQueryKey,
  createAttendanceSession,
  listClassAttendanceSessions,
} from "./api.js";
import { attendanceSessionSchema, type AttendanceSessionFormValues } from "./schema.js";

const dateFormatter = new Intl.DateTimeFormat("vi-VN");
const defaults: AttendanceSessionFormValues = {
  sessionDate: "",
  scheduleId: "",
  teacherId: "",
  startTime: "18:00",
  endTime: "20:00",
};

export function ClassAttendanceSection({ classId }: { classId: string }) {
  const queryClient = useQueryClient();
  const sessions = useQuery({
    queryKey: classAttendanceQueryKey(classId),
    queryFn: () => listClassAttendanceSessions(classId),
  });
  const schedules = useQuery({
    queryKey: classScheduleQueryKey(classId),
    queryFn: () => listClassSchedules(classId),
  });
  const teachers = useQuery({ queryKey: teacherQueryKey(), queryFn: listTeachers });
  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    formState: { errors },
  } = useForm<AttendanceSessionFormValues>({
    resolver: zodResolver(attendanceSessionSchema),
    defaultValues: defaults,
  });
  const create = useMutation({
    mutationFn: (values: AttendanceSessionFormValues) => createAttendanceSession(values.scheduleId
      ? { classId, sessionDate: values.sessionDate, scheduleId: values.scheduleId }
      : {
          classId,
          sessionDate: values.sessionDate,
          teacherId: values.teacherId || undefined,
          startTime: values.startTime,
          endTime: values.endTime,
        }),
    onSuccess: async () => {
      reset(defaults);
      await queryClient.invalidateQueries({ queryKey: classAttendanceQueryKey(classId) });
    },
    onError: (error) => setError("root", {
      message: axios.isAxiosError(error) && error.response?.status === 409
        ? "Buổi điểm danh này đã tồn tại."
        : "Không thể tạo buổi điểm danh. Vui lòng thử lại.",
    }),
  });

  const selectSchedule = (scheduleId: string) => {
    setValue("scheduleId", scheduleId);
    const schedule = schedules.data?.find((item) => item.id === scheduleId);
    if (!schedule) return;
    setValue("teacherId", schedule.teacherId);
    setValue("startTime", schedule.startTime);
    setValue("endTime", schedule.endTime);
  };

  return <section className="relationship-section" aria-labelledby="class-attendance-heading">
    <div className="relationship-heading">
      <div><h2 id="class-attendance-heading">Điểm danh</h2><p className="subtitle">Các buổi học thực tế và danh sách điểm danh đã lưu.</p></div>
    </div>
    <form className="schedule-form" onSubmit={handleSubmit((values) => create.mutate(values))} noValidate>
      {errors.root && <p className="form-error" role="alert">{errors.root.message}</p>}
      <div className="schedule-fields">
        <Field label="Ngày" error={errors.sessionDate?.message}>
          <input className="input" type="date" {...register("sessionDate")} />
        </Field>
        <Field label="Lịch học" error={errors.scheduleId?.message} required={false}>
          <select className="input" disabled={schedules.isPending} {...register("scheduleId", {
            onChange: (event) => selectSchedule(event.target.value),
          })}>
            <option value="">Không theo lịch</option>
            {schedules.data?.filter((schedule) => schedule.status === "ACTIVE").map((schedule) => <option key={schedule.id} value={schedule.id}>
              {schedule.startTime}–{schedule.endTime} · {schedule.teacherName}
            </option>)}
          </select>
        </Field>
        <Field label="Giáo viên" error={errors.teacherId?.message} required={false}>
          <select className="input" disabled={teachers.isPending} {...register("teacherId")}>
            <option value="">Không chọn</option>
            {teachers.data?.filter((teacher) => teacher.status === "ACTIVE").map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.code} — {teacher.name}</option>)}
          </select>
        </Field>
        <Field label="Bắt đầu" error={errors.startTime?.message}>
          <input className="input" type="time" {...register("startTime")} />
        </Field>
        <Field label="Kết thúc" error={errors.endTime?.message}>
          <input className="input" type="time" {...register("endTime")} />
        </Field>
      </div>
      <div className="schedule-actions"><button className="button" disabled={create.isPending}>{create.isPending ? "Đang tạo…" : "Tạo buổi điểm danh"}</button></div>
    </form>

    {sessions.isPending ? <div className="state">Đang tải lịch sử điểm danh…</div> : sessions.isError ? <div className="state error" role="alert">Không thể tải lịch sử điểm danh.</div> : sessions.data.length === 0 ? <div className="state">Chưa có buổi điểm danh.</div> : <div className="register">
      <table>
        <thead><tr><th>Ngày</th><th>Thời gian</th><th>Giáo viên</th><th>Học viên</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
        <tbody>{sessions.data.map((session) => <tr key={session.id}>
          <td data-label="Ngày">{dateFormatter.format(new Date(`${session.sessionDate}T00:00:00`))}</td>
          <td className="code" data-label="Thời gian">{session.startTime}–{session.endTime}</td>
          <td data-label="Giáo viên">{session.teacherName ?? "—"}</td>
          <td data-label="Học viên">{session.recordCount}</td>
          <td data-label="Trạng thái"><span className={`status ${session.status === "COMPLETED" ? "disabled" : ""}`}>{session.status === "OPEN" ? "Đang mở" : "Đã hoàn thành"}</span></td>
          <td data-label="Thao tác"><Link className="action-link" to={`/attendance-sessions/${session.id}`}>Mở điểm danh</Link></td>
        </tr>)}</tbody>
      </table>
    </div>}
  </section>;
}

function Field({ label, error, required = true, children }: { label: string; error?: string; required?: boolean; children: React.ReactNode }) {
  return <label className="field"><span>{label}{required && <span className="required"> *</span>}</span>{children}{error && <span className="field-error">{error}</span>}</label>;
}
