import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { courseClassQueryKey, courseQueryKey, getCourse, listCourseClasses } from "./api.js";
import { createCourseLevel, courseLevelQueryKey, deleteCourseLevel, listCourseLevels, updateCourseLevel, type CourseLevel } from "./levels.js";

export function CourseDetail() {
  const { id } = useParams();
  const course = useQuery({ queryKey: [...courseQueryKey(), id], queryFn: () => getCourse(id!), enabled: Boolean(id) });
  const classes = useQuery({ queryKey: courseClassQueryKey(id ?? ""), queryFn: () => listCourseClasses(id!), enabled: Boolean(id) });
  const levels = useQuery({ queryKey: courseLevelQueryKey(id ?? ""), queryFn: () => listCourseLevels(id!), enabled: Boolean(id) });
  const queryClient = useQueryClient();
  const [editingLevel, setEditingLevel] = useState<CourseLevel | null>(null);
  const [levelCode, setLevelCode] = useState("");
  const [levelName, setLevelName] = useState("");
  const [levelOrder, setLevelOrder] = useState("1");
  const [levelDescription, setLevelDescription] = useState("");
  const levelMutation = useMutation({
    mutationFn: () => editingLevel ? updateCourseLevel(id!, editingLevel.id, { code: levelCode, name: levelName, description: levelDescription || null, displayOrder: Number(levelOrder), status: editingLevel.status }) : createCourseLevel(id!, { code: levelCode, name: levelName, description: levelDescription || null, displayOrder: Number(levelOrder), status: "ACTIVE" }),
    onSuccess: async () => { setEditingLevel(null); setLevelCode(""); setLevelName(""); setLevelDescription(""); setLevelOrder("1"); await queryClient.invalidateQueries({ queryKey: courseLevelQueryKey(id ?? "") }); },
  });
  const removeLevel = useMutation({ mutationFn: (levelId: string) => deleteCourseLevel(id!, levelId), onSuccess: () => queryClient.invalidateQueries({ queryKey: courseLevelQueryKey(id ?? "") }) });

  if (course.isPending) return <main className="page"><div className="state">Đang tải thông tin khóa học…</div></main>;
  if (course.isError) {
    const notFound = axios.isAxiosError(course.error) && course.error.response?.status === 404;
    return <main className="page"><div className="state error" role="alert"><strong>{notFound ? "Không tìm thấy khóa học" : "Không thể tải khóa học"}</strong>Quay lại danh sách và thử lại.</div></main>;
  }

  const fields = [
    ["Mã khóa học", course.data.code],
    ["Tên khóa học", course.data.name],
    ["Mô tả", course.data.description ?? "—"],
  ];

  return <main className="page">
    <div className="page-heading">
      <div><h1>{course.data.name}</h1><p className="subtitle">Thông tin khóa học đang lưu tại trung tâm.</p></div>
      <Link className="button" to={`/courses/${course.data.id}/edit`}>Chỉnh sửa</Link>
    </div>
    <dl className="detail-sheet">
      {fields.map(([label, value]) => <div className="detail-field" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      <div className="detail-field"><dt>Trạng thái</dt><dd><span className={`status ${course.data.status === "DISABLED" ? "disabled" : ""}`}>{course.data.status === "ACTIVE" ? "Đang hoạt động" : "Ngừng hoạt động"}</span></dd></div>
    </dl>

    <section className="relationship-section" aria-labelledby="course-classes-heading">
      <div className="relationship-heading"><div><h2 id="course-classes-heading">Lớp học</h2><p className="subtitle">Các lớp học thuộc khóa học này.</p></div></div>
      {classes.isPending ? <div className="state">Đang tải lớp học…</div> : classes.isError ? <div className="state error" role="alert">Không thể tải lớp học của khóa.</div> : classes.data.length === 0 ? <div className="state">Chưa có lớp học trong khóa.</div> : <div className="register">
        <table>
          <thead><tr><th>Mã lớp</th><th>Tên lớp</th><th>Trạng thái</th></tr></thead>
          <tbody>{classes.data.map(record => <tr key={record.id}>
            <td className="code" data-label="Mã lớp">{record.code}</td>
            <td className="name" data-label="Tên lớp"><Link className="action-link" to={`/classes/${record.id}`}>{record.name}</Link></td>
            <td data-label="Trạng thái"><span className={`status ${record.status === "DISABLED" ? "disabled" : ""}`}>{record.status === "ACTIVE" ? "Đang hoạt động" : "Ngừng hoạt động"}</span></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>

    <section className="relationship-section" aria-labelledby="course-levels-heading">
      <div className="relationship-heading"><div><h2 id="course-levels-heading">Cấp độ khóa học</h2><p className="subtitle">Các cấp độ dùng để phân loại lớp trong khóa học.</p></div></div>
      <form className="schedule-form" onSubmit={(event) => { event.preventDefault(); if (levelCode.trim() && levelName.trim()) levelMutation.mutate(); }}>
        <div className="grid gap-4 md:grid-cols-[1fr_2fr_2fr_110px_auto]"><label className="field"><span>Mã cấp độ</span><Input value={levelCode} onChange={(event) => setLevelCode(event.target.value)} required /></label><label className="field"><span>Tên cấp độ</span><Input value={levelName} onChange={(event) => setLevelName(event.target.value)} required /></label><label className="field"><span>Mô tả</span><Input value={levelDescription} onChange={(event) => setLevelDescription(event.target.value)} /></label><label className="field"><span>Thứ tự</span><Input type="number" min="1" value={levelOrder} onChange={(event) => setLevelOrder(event.target.value)} required /></label><Button className="self-end" disabled={levelMutation.isPending}>{editingLevel ? "Lưu" : "Thêm"}</Button></div>
        {editingLevel && <button type="button" className="action-button mt-3" onClick={() => { setEditingLevel(null); setLevelCode(""); setLevelName(""); setLevelOrder("1"); }}>Hủy chỉnh sửa</button>}
      </form>
      {levels.isPending ? <div className="state">Đang tải cấp độ…</div> : levels.isError ? <div className="state error" role="alert">Không thể tải cấp độ khóa học.</div> : levels.data.length === 0 ? <div className="state">Chưa có cấp độ khóa học.</div> : <div className="register"><table><thead><tr><th>Thứ tự</th><th>Mã</th><th>Tên cấp độ</th><th>Mô tả</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{levels.data.map((level) => <tr key={level.id}><td data-label="Thứ tự">{level.displayOrder}</td><td className="code" data-label="Mã">{level.code}</td><td className="name" data-label="Tên cấp độ">{level.name}</td><td data-label="Mô tả">{level.description || "—"}</td><td data-label="Trạng thái"><span className={`status ${level.status === "DISABLED" ? "disabled" : ""}`}>{level.status === "ACTIVE" ? "Đang dùng" : "Ngừng dùng"}</span></td><td data-label="Thao tác"><button type="button" className="action-button" onClick={() => { setEditingLevel(level); setLevelCode(level.code); setLevelName(level.name); setLevelDescription(level.description ?? ""); setLevelOrder(String(level.displayOrder)); }}>Sửa</button> <button type="button" className="action-button" disabled={removeLevel.isPending} onClick={() => removeLevel.mutate(level.id)}>Xóa</button></td></tr>)}</tbody></table></div>}
    </section>

    <div className="form-actions"><Link className="button secondary" to="/courses">Quay lại danh sách</Link></div>
  </main>;
}
