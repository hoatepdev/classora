import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { listTeachers, teacherQueryKey } from "../teachers/api.js";
import {
  classScheduleQueryKey,
  createSchedule,
  listClassSchedules,
  teacherScheduleQueryKey,
  updateSchedule,
} from "./api.js";
import { dayLabels } from "./labels.js";
import { scheduleSchema, type ScheduleFormValues } from "./schema.js";
import { dayOfWeeks, type ClassSchedule } from "./types.js";

const defaults: ScheduleFormValues = {
  teacherId: "",
  dayOfWeek: "MONDAY",
  startTime: "18:00",
  endTime: "20:00",
  room: "",
  status: "ACTIVE",
};

export function ClassSchedulesSection({ classId }: { classId: string }) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string>();
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
    formState: { errors },
  } = useForm<ScheduleFormValues>({ resolver: zodResolver(scheduleSchema), defaultValues: defaults });
  const editing = schedules.data?.find((schedule) => schedule.id === editingId);

  const invalidateSchedule = async (schedule: { classId: string; teacherId: string }) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: classScheduleQueryKey(schedule.classId) }),
      queryClient.invalidateQueries({ queryKey: teacherScheduleQueryKey(schedule.teacherId) }),
    ]);
  };

  const save = useMutation({
    mutationFn: (values: ScheduleFormValues) => {
      const input = { ...values, room: values.room || null };
      return editing
        ? updateSchedule(editing.id, input)
        : createSchedule({ ...input, classId });
    },
    onSuccess: async (schedule) => {
      const previousTeacherId = editing?.teacherId;
      setEditingId(undefined);
      reset(defaults);
      await invalidateSchedule(schedule);
      if (previousTeacherId && previousTeacherId !== schedule.teacherId) {
        await queryClient.invalidateQueries({ queryKey: teacherScheduleQueryKey(previousTeacherId) });
      }
    },
    onError: (error) => setError("root", {
      message: axios.isAxiosError(error) && error.response?.status === 409
        ? conflictMessage(error.response.data?.message)
        : "Không thể lưu lịch học. Vui lòng thử lại.",
    }),
  });

  const disable = useMutation({
    mutationFn: (schedule: ClassSchedule) => updateSchedule(schedule.id, { status: "DISABLED" }),
    onSuccess: invalidateSchedule,
  });

  const activeTeachers = teachers.data?.filter(
    (teacher) => teacher.status === "ACTIVE" || teacher.id === editing?.teacherId,
  ) ?? [];

  const edit = (schedule: ClassSchedule) => {
    setEditingId(schedule.id);
    reset({
      teacherId: schedule.teacherId,
      dayOfWeek: schedule.dayOfWeek,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      room: schedule.room ?? "",
      status: schedule.status,
    });
  };

  return <section className="relationship-section" aria-labelledby="class-schedules-heading">
    <div className="relationship-heading">
      <div><h2 id="class-schedules-heading">Lịch học</h2><p className="subtitle">Lịch học lặp lại hằng tuần của lớp.</p></div>
    </div>
    <form className="schedule-form" onSubmit={handleSubmit((values) => save.mutate(values))} noValidate>
      {errors.root && <p className="form-error" role="alert">{errors.root.message}</p>}
      <div className="schedule-fields">
        <Field label="Giáo viên" error={errors.teacherId?.message}>
          <select className="input" disabled={teachers.isPending || save.isPending} {...register("teacherId")}>
            <option value="">Chọn giáo viên</option>
            {activeTeachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.code} — {teacher.name}</option>)}
          </select>
        </Field>
        <Field label="Ngày" error={errors.dayOfWeek?.message}>
          <select className="input" {...register("dayOfWeek")}>
            {dayOfWeeks.map((day) => <option key={day} value={day}>{dayLabels[day]}</option>)}
          </select>
        </Field>
        <Field label="Bắt đầu" error={errors.startTime?.message}>
          <input className="input" type="time" {...register("startTime")} />
        </Field>
        <Field label="Kết thúc" error={errors.endTime?.message}>
          <input className="input" type="time" {...register("endTime")} />
        </Field>
        <Field label="Phòng / địa điểm" error={errors.room?.message} required={false}>
          <input className="input" autoComplete="off" {...register("room")} />
        </Field>
        {editing && <Field label="Trạng thái" error={errors.status?.message}>
          <select className="input" {...register("status")}>
            <option value="ACTIVE">Đang hoạt động</option>
            <option value="DISABLED">Ngừng hoạt động</option>
          </select>
        </Field>}
      </div>
      <div className="schedule-actions">
        <button className="button" disabled={save.isPending}>{save.isPending ? "Đang lưu…" : editing ? "Lưu thay đổi" : "Thêm lịch học"}</button>
        {editing && <button className="button secondary" type="button" onClick={() => { setEditingId(undefined); reset(defaults); }}>Hủy chỉnh sửa</button>}
      </div>
    </form>

    {disable.isError && <p className="form-error" role="alert">Không thể ngừng lịch học. Vui lòng thử lại.</p>}
    {schedules.isPending ? <div className="state">Đang tải lịch học…</div> : schedules.isError ? <div className="state error" role="alert">Không thể tải lịch học của lớp.</div> : schedules.data.length === 0 ? <div className="state">Chưa có lịch học.</div> : <div className="register">
      <table>
        <thead><tr><th>Ngày</th><th>Thời gian</th><th>Giáo viên</th><th>Phòng / địa điểm</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
        <tbody>{schedules.data.map((schedule) => <tr key={schedule.id}>
          <td data-label="Ngày">{dayLabels[schedule.dayOfWeek]}</td>
          <td className="code" data-label="Thời gian">{schedule.startTime}–{schedule.endTime}</td>
          <td className="name" data-label="Giáo viên"><Link className="action-link" to={`/teachers/${schedule.teacherId}`}>{schedule.teacherCode} — {schedule.teacherName}</Link></td>
          <td data-label="Phòng / địa điểm">{schedule.room ?? "—"}</td>
          <td data-label="Trạng thái"><span className={`status ${schedule.status === "DISABLED" ? "disabled" : ""}`}>{schedule.status === "ACTIVE" ? "Đang hoạt động" : "Ngừng hoạt động"}</span></td>
          <td data-label="Thao tác"><span className="row-actions"><button className="action-button" type="button" onClick={() => edit(schedule)}>Sửa</button>{schedule.status === "ACTIVE" && <button className="action-button" type="button" disabled={disable.isPending} onClick={() => disable.mutate(schedule)}>Ngừng hoạt động</button>}</span></td>
        </tr>)}</tbody>
      </table>
    </div>}
  </section>;
}

function conflictMessage(message: unknown) {
  if (typeof message !== "string") return "Lịch học bị trùng. Vui lòng chọn thời gian khác.";
  if (message.startsWith("Teacher")) return "Giáo viên đã có lịch dạy trùng vào thời gian này.";
  if (message.startsWith("Class")) return "Lớp học đã có lịch trùng vào thời gian này.";
  return "Lịch học này đã tồn tại.";
}

function Field({ label, error, required = true, children }: { label: string; error?: string; required?: boolean; children: React.ReactNode }) {
  return <label className="field"><span>{label}{required && <span className="required"> *</span>}</span>{children}{error && <span className="field-error">{error}</span>}</label>;
}
