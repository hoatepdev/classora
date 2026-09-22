import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { ChevronLeft } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ErrorState } from "@/components/error-state";
import { FormField } from "@/components/form-field";
import { LoadingState } from "@/components/loading-state";
import { PageContainer } from "@/components/page-container";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { courseClassQueryKey, courseQueryKey, listCourses } from "../courses/api.js";
import { courseLevelQueryKey, listCourseLevels } from "../courses/levels.js";
import { branchQueryKey, listBranches } from "../branches/api.js";
import { teacherQueryKey, listTeachers } from "../teachers/api.js";
import { classQueryKey, createClass, getClass, listRoomsForBranch, updateClass } from "./api.js";
import { classSchema, type ClassFormValues } from "./schema.js";

const defaults: ClassFormValues = { courseId: "", branchId: "", courseLevelId: "", defaultRoomId: "", primaryTeacherId: "", capacity: "", startDate: "", endDate: "", code: "", name: "", description: "", status: "ACTIVE" };

export function ClassForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const classRecord = useQuery({ queryKey: [...classQueryKey(), id], queryFn: () => getClass(id!), enabled: editing });
  const courses = useQuery({ queryKey: courseQueryKey(), queryFn: listCourses });
  const branches = useQuery({ queryKey: branchQueryKey(), queryFn: listBranches });
  const teachers = useQuery({ queryKey: teacherQueryKey(), queryFn: listTeachers });
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<ClassFormValues>({ resolver: zodResolver(classSchema), defaultValues: defaults });
  const selectedCourseId = watch("courseId");
  const selectedBranchId = watch("branchId");
  const levels = useQuery({ queryKey: courseLevelQueryKey(selectedCourseId), queryFn: () => listCourseLevels(selectedCourseId), enabled: Boolean(selectedCourseId) });
  const rooms = useQuery({ queryKey: ["rooms", window.location.hostname, selectedBranchId], queryFn: () => listRoomsForBranch(selectedBranchId), enabled: Boolean(selectedBranchId) });

  useEffect(() => {
    if (!classRecord.data) return;
    reset({ courseId: classRecord.data.courseId ?? "", branchId: classRecord.data.branchId ?? "", courseLevelId: classRecord.data.courseLevelId ?? "", defaultRoomId: classRecord.data.defaultRoomId ?? "", primaryTeacherId: classRecord.data.primaryTeacherId ?? "", capacity: classRecord.data.capacity ? String(classRecord.data.capacity) : "", startDate: classRecord.data.startDate?.slice(0, 10) ?? "", endDate: classRecord.data.endDate?.slice(0, 10) ?? "", code: classRecord.data.code, name: classRecord.data.name, description: classRecord.data.description ?? "", status: classRecord.data.status });
  }, [classRecord.data, reset]);

  const mutation = useMutation({
    mutationFn: (values: ClassFormValues) => {
      const input = { ...values, capacity: values.capacity ? Number(values.capacity) : null, branchId: values.branchId || null, courseLevelId: values.courseLevelId || null, defaultRoomId: values.defaultRoomId || null, primaryTeacherId: values.primaryTeacherId || null, startDate: values.startDate || null, endDate: values.endDate || null, description: values.description || null };
      return editing ? updateClass(id!, input) : createClass(input);
    },
    onSuccess: async (saved) => {
      const previousCourseId = classRecord.data?.courseId;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: classQueryKey() }),
        queryClient.invalidateQueries({ queryKey: courseClassQueryKey(saved.courseId!) }),
      ]);
      if (previousCourseId && previousCourseId !== saved.courseId) await queryClient.invalidateQueries({ queryKey: courseClassQueryKey(previousCourseId) });
      navigate("/classes");
    },
    onError: (error) => setError("root", {
      message: axios.isAxiosError(error) && error.response?.status === 409
        ? typeof error.response.data?.message === "string" && error.response.data.message.startsWith("Course")
          ? "Khóa học đang ngừng hoạt động, không thể gán lớp vào khóa này."
          : "Mã lớp học đã tồn tại trong trung tâm."
        : "Không thể lưu lớp học. Vui lòng thử lại.",
    }),
  });

  if (editing && classRecord.isPending) return <PageContainer><LoadingState label="Đang tải thông tin lớp học" /></PageContainer>;
  if (editing && classRecord.isError) return <PageContainer><ErrorState title="Không tìm thấy lớp học" message="Quay lại danh sách và thử lại." onRetry={() => void classRecord.refetch()} /></PageContainer>;

  const selectableCourses = courses.data?.filter((course) => course.status === "ACTIVE" || course.id === classRecord.data?.courseId) ?? [];

  return <PageContainer className="max-w-5xl">
    <Button variant="ghost" size="sm" asChild className="mb-4 -ml-3"><Link to="/classes"><ChevronLeft size={16} aria-hidden="true" />Lớp học</Link></Button>
    <PageHeader title={editing ? "Chỉnh sửa lớp học" : "Thêm lớp học"} description={editing ? "Cập nhật thông tin đang lưu tại trung tâm." : "Nhập những thông tin cần thiết cho lớp học."} />
    <form className="form-sheet" onSubmit={handleSubmit((values) => mutation.mutate(values))} noValidate>
      {errors.root && <p className="form-error" role="alert">{errors.root.message}</p>}
      <div className="grid gap-5 md:grid-cols-2">
        <FormField id="class-course" label="Khóa học" required error={errors.courseId?.message}><select id="class-course" className="input" disabled={courses.isPending || courses.isError} {...register("courseId")}><option value="">Chọn khóa học</option>{selectableCourses.map((course) => <option key={course.id} value={course.id}>{course.code} — {course.name}</option>)}</select></FormField>
        <FormField id="class-level" label="Cấp độ khóa học" error={errors.courseLevelId?.message}><select id="class-level" className="input" disabled={!selectedCourseId || levels.isPending} {...register("courseLevelId")}><option value="">Không chọn cấp độ</option>{levels.data?.filter((level) => level.status === "ACTIVE" || level.id === classRecord.data?.courseLevelId).map((level) => <option key={level.id} value={level.id}>{level.code} — {level.name}</option>)}</select></FormField>
        <FormField id="class-branch" label="Chi nhánh" error={errors.branchId?.message}><select id="class-branch" className="input" {...register("branchId")} onChange={(event) => { setValue("branchId", event.target.value); setValue("defaultRoomId", ""); }}><option value="">Không chọn chi nhánh</option>{branches.data?.filter((branch) => branch.status === "ACTIVE" || branch.id === classRecord.data?.branchId).map((branch) => <option key={branch.id} value={branch.id}>{branch.code} — {branch.name}</option>)}</select></FormField>
        <FormField id="class-room" label="Phòng học mặc định" error={errors.defaultRoomId?.message}><select id="class-room" className="input" disabled={!selectedBranchId || rooms.isPending} {...register("defaultRoomId")}><option value="">Không chọn phòng</option>{rooms.data?.filter((room) => room.status === "ACTIVE" || room.id === classRecord.data?.defaultRoomId).map((room) => <option key={room.id} value={room.id}>{room.code} — {room.name}</option>)}</select></FormField>
        <FormField id="class-teacher" label="Giáo viên phụ trách" error={errors.primaryTeacherId?.message}><select id="class-teacher" className="input" {...register("primaryTeacherId")}><option value="">Không chọn giáo viên</option>{teachers.data?.filter((teacher) => teacher.status === "ACTIVE" || teacher.id === classRecord.data?.primaryTeacherId).map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.code} — {teacher.name}</option>)}</select></FormField>
        <FormField id="class-capacity" label="Sức chứa" error={errors.capacity?.message}><Input id="class-capacity" type="number" min="1" {...register("capacity")} /></FormField>
        <FormField id="class-code" label="Mã lớp" required error={errors.code?.message}><Input id="class-code" autoComplete="off" aria-invalid={Boolean(errors.code)} aria-describedby={errors.code ? "class-code-error" : undefined} {...register("code")} /></FormField>
        <FormField id="class-status" label="Trạng thái" required error={errors.status?.message}><select id="class-status" className="input" aria-invalid={Boolean(errors.status)} aria-describedby={errors.status ? "class-status-error" : undefined} {...register("status")}><option value="ACTIVE">Đang hoạt động</option><option value="DISABLED">Ngừng hoạt động</option></select></FormField>
        <FormField id="class-name" label="Tên lớp" required error={errors.name?.message} full><Input id="class-name" autoComplete="off" aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? "class-name-error" : undefined} {...register("name")} /></FormField>
        <FormField id="class-description" label="Mô tả" error={errors.description?.message} full><Textarea id="class-description" rows={4} aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? "class-description-error" : undefined} {...register("description")} /></FormField>
      </div>
      <div className="form-actions"><Button disabled={mutation.isPending}>{mutation.isPending ? "Đang lưu…" : "Lưu lớp học"}</Button><Button variant="secondary" asChild><Link to="/classes">Hủy</Link></Button></div>
    </form>
  </PageContainer>;
}
