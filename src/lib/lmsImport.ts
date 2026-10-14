import type {
  CalendarEvent,
  ClassMeeting,
  Course,
  LmsCourseAttempt,
  LmsImportSummary,
  LmsSemesterSummary,
  PlannerState,
  Task,
} from '../types';
import { generateStudyBlocks } from './scheduler';

type JsonObject = Record<string, unknown>;
type RawCourse = JsonObject & {
  course_id?: string;
  course_name?: string;
  course_code?: string;
  course_credits?: string | number;
  semester_id?: string;
  semester_name?: string | null;
  final_mark?: string | number | null;
  final_added_marks?: string | number | null;
  points?: string | number | null;
  grade?: string | null;
  finish_status?: string | null;
  register_status?: string | null;
  exam_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  room_name?: string | null;
};
type RawSemester = JsonObject & {
  semester_id?: string;
  semester_name?: string;
  courses?: RawCourse[];
};
type RawStatusSemester = JsonObject & {
  semester_name?: string;
  start_level_name?: string;
  gpa_points?: string | number;
  gpa_percent?: string | number;
  end_agpa_points?: string | number;
  end_agpa_percent?: string | number;
  semester_pass_credits?: string | number;
  end_total_in_credits?: string | number;
};
type RawExamPeriod = JsonObject & {
  exam_name_id?: string;
  exam_name?: string;
  courses?: RawCourse[];
};
type RawLectureCourse = RawCourse & {
  sat?: string;
  sun?: string;
  mon?: string;
  tus?: string;
  wed?: string;
  thu?: string;
  fri?: string;
};

interface LmsDocuments {
  transcript: JsonObject & { semesters: RawSemester[] };
  status: JsonObject & { semesters: RawStatusSemester[]; degree_name?: string; degree?: string };
  current: JsonObject & { courses: RawCourse[]; semester_id?: string; semester_name?: string };
  exams: JsonObject & { exams: RawExamPeriod[] };
  lectures: JsonObject & { courses: RawLectureCourse[]; instructors?: JsonObject[] };
}

export interface LmsImportResult {
  state: PlannerState;
  coursesImported: number;
  examsImported: number;
  meetingsImported: number;
  attemptsPreserved: number;
}

const DAY_FIELDS: Array<{ key: keyof RawLectureCourse; dayOfWeek: number }> = [
  { key: 'sun', dayOfWeek: 0 },
  { key: 'mon', dayOfWeek: 1 },
  { key: 'tus', dayOfWeek: 2 },
  { key: 'wed', dayOfWeek: 3 },
  { key: 'thu', dayOfWeek: 4 },
  { key: 'fri', dayOfWeek: 5 },
  { key: 'sat', dayOfWeek: 6 },
];

function asObject(value: unknown): JsonObject | null {
  if (Array.isArray(value)) return value.length && value[0] && typeof value[0] === 'object' ? value[0] as JsonObject : null;
  return value && typeof value === 'object' ? value as JsonObject : null;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function numberOrUndefined(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function classifyDocument(value: unknown): { kind: keyof LmsDocuments; data: JsonObject } | null {
  const data = asObject(value);
  if (!data) return null;
  if (Array.isArray(data.instructors) && Array.isArray(data.courses)) return { kind: 'lectures', data };
  if (Array.isArray(data.exams)) return { kind: 'exams', data };
  if (Array.isArray(data.courses)) return { kind: 'current', data };
  if (Array.isArray(data.semesters)) {
    const semesters = asArray<JsonObject>(data.semesters);
    if (semesters.some((semester) => Array.isArray(semester.courses))) return { kind: 'transcript', data };
    return { kind: 'status', data };
  }
  return null;
}

async function readDocuments(files: File[]): Promise<LmsDocuments> {
  const docs: Partial<Record<keyof LmsDocuments, JsonObject>> = {};
  const failures: string[] = [];
  for (const file of files) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text()) as unknown;
    } catch {
      failures.push(`${file.name} is not valid JSON`);
      continue;
    }
    const classified = classifyDocument(parsed);
    if (!classified) {
      failures.push(`${file.name} does not match a supported LMS export`);
      continue;
    }
    docs[classified.kind] = classified.data;
  }
  const required: Array<keyof LmsDocuments> = ['transcript', 'status', 'current', 'exams', 'lectures'];
  const missing = required.filter((key) => !docs[key]);
  if (missing.length) {
    const expected: Record<keyof LmsDocuments, string> = {
      transcript: 'historical transcript (semester list with course attempts)',
      status: 'student academic status / cumulative GPA',
      current: 'current-semester registered courses',
      exams: 'exam table',
      lectures: 'lecture timetable',
    };
    throw new Error(`Select all five LMS JSON exports. Missing: ${missing.map((key) => expected[key]).join('; ')}.${failures.length ? ` ${failures.join('; ')}.` : ''}`);
  }

  return {
    transcript: docs.transcript as LmsDocuments['transcript'],
    status: docs.status as LmsDocuments['status'],
    current: docs.current as LmsDocuments['current'],
    exams: docs.exams as LmsDocuments['exams'],
    lectures: docs.lectures as LmsDocuments['lectures'],
  };
}

function yearNumber(semesterName: string, statusSemesters: RawStatusSemester[], semesterId?: string): number {
  const summary = statusSemesters.find((item) => normalizeName(text(item.semester_name)) === normalizeName(semesterName));
  const level = text(summary?.start_level_name).toLowerCase();
  if (level.includes('first')) return 1;
  if (level.includes('second')) return 2;
  if (level.includes('third')) return 3;
  if (level.includes('fourth')) return 4;
  const idYear = Number((semesterId || '').slice(0, 4));
  if (idYear >= 2024 && idYear <= 2040) return Math.max(1, idYear - 2023);
  const match = semesterName.match(/(20\d{2})/);
  return match ? Math.max(1, Number(match[1]) - 2023) : 1;
}

function makeAttempt(course: RawCourse, semesterName: string): LmsCourseAttempt {
  return {
    semesterName,
    markPercent: numberOrUndefined(course.final_mark ?? course.final_added_marks),
    letterGrade: text(course.grade) || undefined,
    points: numberOrUndefined(course.points),
    finishStatus: text(course.finish_status) || undefined,
  };
}

function buildCourses(docs: LmsDocuments): { courses: Course[]; attemptsPreserved: number; currentCredits: number } {
  const attemptsByCourse = new Map<string, LmsCourseAttempt[]>();
  const latest = new Map<string, { course: RawCourse; semesterName: string; semesterId: string; current: boolean }>();

  for (const semester of docs.transcript.semesters) {
    const semesterName = text(semester.semester_name) || `Semester ${text(semester.semester_id)}`;
    for (const course of asArray<RawCourse>(semester.courses)) {
      const courseId = text(course.course_id);
      if (!courseId || !text(course.course_name)) continue;
      const list = attemptsByCourse.get(courseId) || [];
      list.push(makeAttempt(course, semesterName));
      attemptsByCourse.set(courseId, list);
      latest.set(courseId, { course, semesterName, semesterId: text(semester.semester_id), current: false });
    }
  }

  const currentSemesterName = text(docs.current.semester_name)
    || text(docs.transcript.semesters.find((semester) => text(semester.semester_id) === text(docs.current.semester_id))?.semester_name)
    || 'Current semester';
  let currentCredits = 0;
  for (const course of docs.current.courses) {
    const courseId = text(course.course_id);
    if (!courseId || !text(course.course_name)) continue;
    currentCredits += numberOrUndefined(course.course_credits) || 0;
    latest.set(courseId, { course, semesterName: currentSemesterName, semesterId: text(docs.current.semester_id), current: true });
  }

  const statusSemesters = docs.status.semesters;
  const courses: Course[] = [];
  for (const [courseId, record] of latest) {
    const raw = record.course;
    const wasPassed = text(raw.finish_status).toUpperCase() === 'P';
    const credits = numberOrUndefined(raw.course_credits) || 0;
    const officialPoints = numberOrUndefined(raw.points);
    const status: Course['status'] = record.current ? 'in-progress' : wasPassed ? 'passed' : 'planned';
    courses.push({
      id: `lms-${courseId}`,
      sourceCourseId: courseId,
      code: text(raw.course_code) || courseId,
      title: text(raw.course_name) || courseId,
      credits,
      grade: wasPassed && !record.current ? officialPoints : undefined,
      markPercent: numberOrUndefined(raw.final_mark ?? raw.final_added_marks),
      letterGrade: text(raw.grade) || undefined,
      officialPoints,
      semester: record.semesterName,
      semesterOrder: Number(record.semesterId) || undefined,
      year: yearNumber(record.semesterName, statusSemesters, record.semesterId),
      status,
      prerequisites: [],
      lmsManaged: true,
      attempts: attemptsByCourse.get(courseId) || [],
    });
  }

  courses.sort((a, b) => a.year - b.year || (a.semesterOrder ?? 0) - (b.semesterOrder ?? 0) || a.code.localeCompare(b.code));
  const attemptsPreserved = [...attemptsByCourse.values()].reduce((sum, items) => sum + items.length, 0);
  return { courses, attemptsPreserved, currentCredits };
}

function parseDmy(value: unknown): Date | null {
  const match = text(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function parseTime(value: unknown): { hour: number; minute: number } | null {
  const match = text(value).match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = (match[3] || '').toUpperCase();
  if (minute < 0 || minute > 59 || hour < 0 || hour > 23) return null;
  if (meridiem === 'AM') hour = hour === 12 ? 0 : hour;
  else if (meridiem === 'PM') hour = hour === 12 ? 12 : hour + 12;
  return { hour, minute };
}

function isoAt(date: Date, time: unknown): string | null {
  const parsed = parseTime(time);
  if (!parsed) return null;
  const local = new Date(date);
  local.setHours(parsed.hour, parsed.minute, 0, 0);
  return local.toISOString();
}

function buildExams(docs: LmsDocuments, courses: Course[]): { tasks: Task[]; events: CalendarEvent[] } {
  const courseBySourceId = new Map(courses.map((course) => [course.sourceCourseId || '', course]));
  const tasks: Task[] = [];
  const events: CalendarEvent[] = [];

  for (const period of docs.exams.exams) {
    const periodId = text(period.exam_name_id) || normalizeName(text(period.exam_name)) || 'exam-period';
    const periodName = text(period.exam_name) || 'Exam';
    for (const raw of asArray<RawCourse>(period.courses)) {
      const examDate = parseDmy(raw.exam_date);
      if (!examDate) continue;
      const start = isoAt(examDate, raw.start_time);
      const end = isoAt(examDate, raw.end_time);
      if (!start || !end || new Date(end).getTime() <= new Date(start).getTime()) continue;
      const sourceCourseId = text(raw.course_id);
      const course = courseBySourceId.get(sourceCourseId);
      const idSuffix = `${periodId}-${sourceCourseId}-${examDate.getFullYear()}${String(examDate.getMonth() + 1).padStart(2, '0')}${String(examDate.getDate()).padStart(2, '0')}`;
      const title = `${text(raw.course_name) || course?.title || sourceCourseId} · ${periodName}`;
      const room = text(raw.room_name);
      const description = `Imported from the university LMS exam table. Exam period: ${periodName}.${room && room !== '---' ? ` Room: ${room}.` : ' The LMS export does not specify a room.'}`;
      events.push({
        id: `lms-exam-event-${idSuffix}`,
        title,
        start,
        end,
        type: 'exam',
        source: 'local',
        courseId: course?.id,
        description,
        lmsManaged: true,
        updatedAt: new Date().toISOString(),
      });
      tasks.push({
        id: `lms-exam-task-${idSuffix}`,
        title,
        courseId: course?.id,
        dueDate: start,
        estimatedMinutes: 180,
        priority: 'high',
        status: 'todo',
        category: 'exam',
        description: `${description} CampusOS default study estimate: 3 hours; this estimate was generated by CampusOS and was not supplied by the LMS.`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lmsManaged: true,
      });
    }
  }
  return { tasks, events };
}

function timetableTime(value: string): { startTime: string; endTime: string } | null {
  const parse = (clock: string): { hour: number; minute: number } | null => {
    const parts = clock.split(':').map(Number);
    if (parts.length !== 2 || parts.some((part) => !Number.isFinite(part))) return null;
    let hour = parts[0];
    const minute = parts[1];
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    // This LMS omits AM/PM in the lecture table. Its 01:00–04:20 slots are afternoon periods.
    if (hour >= 1 && hour <= 7) hour += 12;
    return { hour, minute };
  };
  const match = value.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
  if (!match) return null;
  const start = parse(match[1]);
  const end = parse(match[2]);
  if (!start || !end) return null;
  const startMinutes = start.hour * 60 + start.minute;
  let endMinutes = end.hour * 60 + end.minute;
  if (endMinutes <= startMinutes) endMinutes += 12 * 60;
  if (endMinutes > 24 * 60) return null;
  const format = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  return { startTime: format(startMinutes), endTime: format(endMinutes) };
}

function buildClassSchedule(docs: LmsDocuments, courses: Course[]): ClassMeeting[] {
  const courseBySourceId = new Map(courses.map((course) => [course.sourceCourseId || '', course]));
  const instructorRows = asArray<JsonObject>(docs.lectures.instructors);
  const meetings: ClassMeeting[] = [];
  for (const raw of docs.lectures.courses) {
    const sourceCourseId = text(raw.course_id);
    const course = courseBySourceId.get(sourceCourseId);
    const instructor = instructorRows.find((row) => text(row.course_id) === sourceCourseId);
    for (const dayField of DAY_FIELDS) {
      const value = text(raw[dayField.key]);
      if (!value || value === '-') continue;
      const regex = /([TP])\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/gi;
      const matches = [...value.matchAll(regex)];
      matches.forEach((match, index) => {
        const time = timetableTime(`${match[2]}-${match[3]}`);
        if (!time || match.index === undefined) return;
        const sliceStart = match.index + match[0].length;
        const sliceEnd = index + 1 < matches.length && matches[index + 1].index !== undefined ? matches[index + 1].index! : value.length;
        const remainder = value.slice(sliceStart, sliceEnd).replace(/<br\s*\/?\s*>/gi, ' ').trim();
        const location = remainder.split(/\s+/).filter(Boolean)[0]?.replace(/[TP]$/i, '') || '';
        const lessonType = match[1].toUpperCase();
        const teacher = lessonType === 'T' ? text(instructor?.t_instructor_name) : text(instructor?.p_instructor_name);
        meetings.push({
          id: `lms-class-${sourceCourseId}-${dayField.dayOfWeek}-${index}`,
          title: `${course?.title || text(raw.course_name) || sourceCourseId} · ${lessonType === 'T' ? 'Lecture' : 'Practical'}`,
          courseId: course?.id,
          dayOfWeek: dayField.dayOfWeek,
          startTime: time.startTime,
          endTime: time.endTime,
          location: location && location !== '---' ? location : undefined,
          instructor: teacher || undefined,
          lmsManaged: true,
        });
      });
    }
  }
  return meetings.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));
}

function buildSemesterSummaries(docs: LmsDocuments): LmsSemesterSummary[] {
  const statusByName = new Map(docs.status.semesters.map((item) => [normalizeName(text(item.semester_name)), item]));
  return docs.transcript.semesters.filter((semester) => text(semester.semester_id) !== 'all').map((semester) => {
    const name = text(semester.semester_name) || `Semester ${text(semester.semester_id)}`;
    const official = statusByName.get(normalizeName(name));
    return {
      semesterId: text(semester.semester_id),
      semesterName: name,
      year: yearNumber(name, docs.status.semesters, text(semester.semester_id)),
      registeredCredits: numberOrUndefined(semester.semester_reg_credits),
      passedCredits: numberOrUndefined(semester.semester_pass_credits),
      cumulativePassedCredits: numberOrUndefined(semester.end_total_in_credits),
      semesterGpaPoints: numberOrUndefined(official?.gpa_points ?? semester.gpa_points),
      semesterGpaPercent: numberOrUndefined(official?.gpa_percent ?? semester.gpa_percent),
      cumulativeGpaPoints: numberOrUndefined(official?.end_agpa_points ?? semester.end_agpa_points),
      cumulativeGpaPercent: numberOrUndefined(official?.end_agpa_percent ?? semester.end_agpa_percent),
    };
  });
}

const DEMO_COURSE_IDS = new Set(['cs101', 'math101', 'cs201', 'stat201', 'cs301', 'ux202', 'capstone']);
const DEMO_TASK_IDS = new Set(['task-paper', 'task-algo', 'task-stats', 'task-reading']);

export async function importUniversityLmsFiles(files: File[], existing: PlannerState): Promise<LmsImportResult> {
  if (!files.length) throw new Error('Choose the LMS JSON files first.');
  const docs = await readDocuments(files);
  const { courses, attemptsPreserved, currentCredits } = buildCourses(docs);
  const { tasks: examTasks, events: examEvents } = buildExams(docs, courses);
  const classMeetings = buildClassSchedule(docs, courses);
  const now = new Date().toISOString();
  const semesterSummaries = buildSemesterSummaries(docs);
  const latestStatus = [...docs.status.semesters].reverse().find((semester) => numberOrUndefined(semester.end_agpa_points) !== undefined);
  const currentSemesterName = text(docs.current.semester_name)
    || text(docs.transcript.semesters.find((semester) => text(semester.semester_id) === text(docs.current.semester_id))?.semester_name)
    || 'Current semester';
  const transcriptSemesters = docs.transcript.semesters.filter((semester) => text(semester.semester_id) !== 'all');
  const finalTranscriptSemester = transcriptSemesters[transcriptSemesters.length - 1];
  const totalPassed = numberOrUndefined(latestStatus?.end_total_in_credits)
    ?? numberOrUndefined(finalTranscriptSemester?.end_total_in_credits);
  const registeredCreditsFromSemester = numberOrUndefined(docs.transcript.semesters.find((semester) => text(semester.semester_id) === text(docs.current.semester_id))?.semester_reg_credits);
  const summary: LmsImportSummary = {
    degreeName: text(docs.status.degree) || text(docs.status.degree_name).replace(/\s*\(\d+\)\s*$/, '') || undefined,
    importedAt: now,
    officialGpaPoints: numberOrUndefined(latestStatus?.end_agpa_points),
    officialGpaPercent: numberOrUndefined(latestStatus?.end_agpa_percent),
    totalPassedCredits: totalPassed,
    currentSemesterName,
    currentRegisteredCredits: registeredCreditsFromSemester ?? currentCredits,
    coursesImported: courses.length,
    examsImported: examEvents.length,
    classMeetingsImported: classMeetings.length,
    courseAttemptsPreserved: attemptsPreserved,
    semesterSummaries,
  };

  const replacedTaskIds = new Set(existing.tasks.filter((task) => task.lmsManaged || DEMO_TASK_IDS.has(task.id)).map((task) => task.id));
  const priorLmsTaskEvents = existing.tasks.filter((task) => task.lmsManaged).map((task) => task.googleEventId);
  const priorLmsCalendarEvents = existing.calendarEvents.filter((event) => event.lmsManaged).map((event) => event.googleEventId);
  const removedBlockEvents = existing.studyBlocks.filter((block) => replacedTaskIds.has(block.taskId)).map((block) => block.googleEventId);
  const remoteDeletes = [...priorLmsTaskEvents, ...priorLmsCalendarEvents, ...removedBlockEvents].filter((id): id is string => Boolean(id));
  let next: PlannerState = {
    ...existing,
    courses: [...existing.courses.filter((course) => !course.lmsManaged && !DEMO_COURSE_IDS.has(course.id)), ...courses],
    tasks: [...existing.tasks.filter((task) => !task.lmsManaged && !DEMO_TASK_IDS.has(task.id)), ...examTasks],
    studyBlocks: existing.studyBlocks.filter((block) => !replacedTaskIds.has(block.taskId)),
    calendarEvents: [...existing.calendarEvents.filter((event) => !event.lmsManaged), ...examEvents],
    classSchedule: [
      ...existing.classSchedule.filter((meeting) => !meeting.lmsManaged && !/^class-\d+$/.test(meeting.id)),
      ...classMeetings,
    ],
    deletedGoogleEventIds: [...new Set([...existing.deletedGoogleEventIds, ...remoteDeletes])],
    lmsSummary: summary,
  };
  const planningHorizon = Date.now() + 7 * 24 * 60 * 60 * 1000;
  for (const task of examTasks) {
    // Avoid front-loading study blocks for exams months away. The app's rolling
    // scheduler will plan these automatically as they enter the next 7 days.
    if (new Date(task.dueDate).getTime() <= planningHorizon) {
      next = { ...next, studyBlocks: [...next.studyBlocks, ...generateStudyBlocks(next, task)] };
    }
  }

  return {
    state: next,
    coursesImported: courses.length,
    examsImported: examEvents.length,
    meetingsImported: classMeetings.length,
    attemptsPreserved,
  };
}
