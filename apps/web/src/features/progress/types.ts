export type AssessmentType = "SIMPLE" | "RUBRIC";
export type AssessmentStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export type Assessment = {
  id: string;
  classId: string;
  title: string;
  description?: string | null;
  type: AssessmentType;
  status: AssessmentStatus;
  assessmentDate?: string | null;
  criteria?: AssessmentCriterion[];
  createdAt?: string;
  updatedAt?: string;
};

export type AssessmentCriterion = { id?: string; name: string; description?: string | null; maxScore: number };
export type GradebookStudent = { studentId: string; studentCode?: string; studentName: string; score?: number | null; feedback?: string | null; resultId?: string };
export type Gradebook = { assessment: Assessment; students: GradebookStudent[] };
export type ProgressNote = { id: string; content: string; authorName?: string | null; createdAt: string };
export type ProgressReport = { id: string; studentId: string; title: string; content?: string | null; status: "DRAFT" | "PUBLISHED" | "REPLACED"; publishedAt?: string | null; createdAt: string; updatedAt?: string };
export type StudentProgress = { summary?: { averageScore?: number | null; assessmentCount?: number; publishedCount?: number }; assessments?: Array<{ id: string; title: string; className?: string; assessmentDate?: string | null; score?: number | null; maxScore?: number | null; feedback?: string | null }>; notes?: ProgressNote[]; reports?: ProgressReport[] };
export type PortalProgress = StudentProgress & { student?: { id: string; fullName: string }; reports?: ProgressReport[] };
