import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Link, useParams } from "react-router-dom";
import { courseClassQueryKey, courseQueryKey, getCourse, listCourseClasses } from "./api.js";

export function CourseDetail() {
  const { id } = useParams();
  const course = useQuery({ queryKey: [...courseQueryKey(), id], queryFn: () => getCourse(id!), enabled: Boolean(id) });
  const classes = useQuery({ queryKey: courseClassQueryKey(id ?? ""), queryFn: () => listCourseClasses(id!), enabled: Boolean(id) });

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

    <div className="form-actions"><Link className="button secondary" to="/courses">Quay lại danh sách</Link></div>
  </main>;
}
