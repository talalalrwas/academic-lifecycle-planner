export type CourseStatus = 'planned' | 'in-progress' | 'passed';
export type TaskStatus = 'todo' | 'in-progress' | 'done';
export type Priority = 'low' | 'medium' | 'high';
export type TaskCategory = 'assignment' | 'exam' | 'project' | 'reading';
export type BlockStatus = 'scheduled' | 'completed' | 'missed';

export interface LmsCourseAttempt {
  semesterName: string;
  markPercent?: number;
  letterGrade?: string;
  points?: number;
  finishStatus?: string;
}

export interface LmsSemesterSummary {
  semesterId: string;
  semesterName: string;
  year: number;
  registeredCredits?: number;
  passedCredits?: number;
  cumulativePassedCredits?: number;
  semesterGpaPoints?: number;
  semesterGpaPercent?: number;
  cumulativeGpaPoints?: number;
  cumulativeGpaPercent?: number;
}

export interface LmsImportSummary {
  degreeName?: string;
  importedAt: string;
  officialGpaPoints?: number;
  officialGpaPercent?: number;
  totalPassedCredits?: number;
  currentSemesterName?: string;
  currentRegisteredCredits?: number;
  coursesImported: number;
  examsImported: number;
  classMeetingsImported: number;
  courseAttemptsPreserved: number;
  semesterSummaries: LmsSemesterSummary[];
}

export interface Course {
  id: string;
  code: string;
  title: string;
  credits: number;
  grade?: number;
  semester: string;
  semesterOrder?: number;
  year: number;
  status: CourseStatus;
  prerequisites: string[];
  sourceCourseId?: string;
  markPercent?: number;
  letterGrade?: string;
  officialPoints?: number;
  attempts?: LmsCourseAttempt[];
  lmsManaged?: boolean;
}

export interface Task {
  id: string;
  title: string;
  courseId?: string;
  dueDate: string;
  estimatedMinutes: number;
  priority: Priority;
  status: TaskStatus;
  category: TaskCategory;
  description?: string;
  googleEventId?: string;
  createdAt: string;
  updatedAt?: string;
  lmsManaged?: boolean;
}

export interface StudyBlock {
  id: string;
  taskId: string;
  start: string;
  end: string;
  minutes: number;
  status: BlockStatus;
  googleEventId?: string;
  updatedAt?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  type: 'class' | 'event' | 'exam' | 'deadline';
  source: 'local' | 'google';
  googleEventId?: string;
  courseId?: string;
  description?: string;
  allDay?: boolean;
  updatedAt?: string;
  syncDirty?: boolean;
  lmsManaged?: boolean;
}

export interface ClassMeeting {
  id: string;
  title: string;
  courseId?: string;
  dayOfWeek: number; // 0 = Sunday
  startTime: string; // HH:mm
  endTime: string;
  location?: string;
  instructor?: string;
  lmsManaged?: boolean;
}

export interface StudySession {
  id: string;
  taskId: string;
  start: string;
  end: string;
  durationMinutes: number;
  kind: 'pomodoro' | 'manual' | 'block';
}

export interface PlannerSettings {
  theme: 'dark' | 'light' | 'system';
  dayStart: string;
  dayEnd: string;
  preferredBlockMinutes: number;
  maxStudyMinutesPerDay: number;
  googleCalendarConnected: boolean;
  googleLastSyncedAt?: string;
}

export interface PlannerState {
  courses: Course[];
  tasks: Task[];
  studyBlocks: StudyBlock[];
  calendarEvents: CalendarEvent[];
  classSchedule: ClassMeeting[];
  studySessions: StudySession[];
  deletedGoogleEventIds: string[];
  settings: PlannerSettings;
  lmsSummary?: LmsImportSummary;
}
