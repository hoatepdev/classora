export type AssessmentType = "QUIZ" | "TEST" | "EXAM" | "HOMEWORK" | "PROJECT" | "ORAL" | "OTHER";
export type ScoringMode = "SIMPLE" | "RUBRIC";
export type AssessmentStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type ResultStatus = "GRADED" | "EXEMPT";

export type AssessmentCriterion = { id?: string; name: string; description?: string | null; maxScore: string };
export type Assessment = { id: string; classId: string; title: string; description?: string | null; type: AssessmentType; scoringMode: ScoringMode; maxScore: string; status: AssessmentStatus; assessmentDate?: string | null; criteria?: AssessmentCriterion[]; createdAt?: string; updatedAt?: string };
export type CriterionScore = { criterionId: string; score: string; comment?: string | null };
export type GradebookResult = { id?: string | null; studentId: string; enrollmentId: string; studentCode?: string; studentName: string; enrollmentStatus?: string; status: ResultStatus | null; score?: string | null; criterionScores?: CriterionScore[]; comment?: string | null };
export type Gradebook = { assessment: Assessment; criteria: AssessmentCriterion[]; results: GradebookResult[] };
export type GradebookInput = { studentId: string; enrollmentId?: string; status: ResultStatus; score?: string; criterionScores?: CriterionScore[]; comment?: string | null };

export type ProgressNote = { id: string; content: string; authorName?: string | null; createdAt: string };
export type ReportNarrative = { title: string; teacherComment?: string | null; strengths?: string | null; areasForImprovement?: string | null; nextSteps?: string | null };
export type ReportSnapshot = {
  version: number;
  generatedAt: string;
  context?: { studentName?: string; studentCode?: string; className?: string; classCode?: string; courseName?: string | null; courseLevelName?: string | null };
  period: { start: string; end: string };
  narrative: ReportNarrative;
  summary: StudentProgressSummary;
  assessments: Array<{ id: string; title: string; type: AssessmentType; assessmentDate?: string | null; score?: string | null; maxScore: string; status: ResultStatus; comment?: string | null }>;
};
export type ProgressReport = { id: string; studentId: string; enrollmentId: string; classId: string; title: string; periodStart: string; periodEnd: string; teacherComment?: string | null; strengths?: string | null; areasForImprovement?: string | null; nextSteps?: string | null; snapshot?: ReportSnapshot | null; supersedesReportId?: string | null; status: "DRAFT" | "PUBLISHED" | "SUPERSEDED"; publishedAt?: string | null; createdAt: string; updatedAt?: string };
export type ProgressReportInput = { title: string; periodStart: string; periodEnd: string; teacherComment?: string | null; strengths?: string | null; areasForImprovement?: string | null; nextSteps?: string | null };
export type StudentProgressSummary = { attendanceRate?: number | null; assessmentAverage?: number | null; gradedAssessmentCount?: number; completedSessions?: number; totalOperationalSessions?: number };
export type ProgressAssessment = { assessmentId: string; assessmentStatus: AssessmentStatus; resultId: string; resultStatus: ResultStatus; title: string; assessmentDate?: string | null; score?: string | null; maxScore?: string | null; comment?: string | null };
export type StudentProgress = { summary: StudentProgressSummary; assessments: ProgressAssessment[] };
export type PortalProgress = { summary: StudentProgressSummary; assessments: Array<{ id: string; assessmentId: string; title: string; type: AssessmentType; assessmentDate?: string | null; score?: string | null; maxScore?: string | null; status: ResultStatus; comment?: string | null }>; reports: Array<{ id: string; title: string; periodStart: string; periodEnd: string; snapshot: ReportSnapshot; publishedAt?: string | null; supersedesReportId?: string | null }> };
