import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  Activity,
  AlarmClock,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Cloud,
  Download,
  FileLock2,
  Filter,
  Flame,
  GraduationCap,
  LayoutDashboard,
  ListTodo,
  LockKeyhole,
  Moon,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  TimerReset,
  Trash2,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";
import { Badge, Button, Card, Progress, SectionHeading } from "./components/ui";
import { decryptState, encryptState } from "./lib/crypto";
import {
  connectAndSyncCalendar,
  disconnectCalendar,
} from "./lib/googleCalendar";
import { importUniversityLmsFiles } from "./lib/lmsImport";
import {
  formatDuration,
  generateStudyBlocks,
  getHighStressTaskIds,
  getNextUpTask,
  makeId,
  refreshMissedBlocks,
  rescheduleTaskBlocks,
  weekStart,
} from "./lib/scheduler";
import { loadState, saveState } from "./lib/storage";
import type {
  ClassMeeting,
  Course,
  PlannerState,
  StudyBlock,
  StudySession,
  Task,
  TaskCategory,
  TaskStatus,
} from "./types";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as
  string | undefined;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function futureDate(days: number, hour = 23, minute = 59): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function initialState(): PlannerState {
  const now = new Date();
  const courseList: Course[] = [
    {
      id: "cs101",
      code: "CS101",
      title: "Programming Fundamentals",
      credits: 6,
      grade: 3.7,
      semester: "Fall",
      year: 1,
      status: "passed",
      prerequisites: [],
    },
    {
      id: "math101",
      code: "MATH101",
      title: "Discrete Mathematics",
      credits: 6,
      grade: 3.3,
      semester: "Fall",
      year: 1,
      status: "passed",
      prerequisites: [],
    },
    {
      id: "cs201",
      code: "CS201",
      title: "Data Structures",
      credits: 6,
      semester: "Spring",
      year: 1,
      status: "in-progress",
      prerequisites: ["cs101"],
    },
    {
      id: "stat201",
      code: "STAT201",
      title: "Statistics for Computing",
      credits: 5,
      semester: "Spring",
      year: 1,
      status: "planned",
      prerequisites: ["math101"],
    },
    {
      id: "cs301",
      code: "CS301",
      title: "Algorithms & Complexity",
      credits: 6,
      semester: "Fall",
      year: 2,
      status: "planned",
      prerequisites: ["cs201", "math101"],
    },
    {
      id: "ux202",
      code: "UX202",
      title: "Human-Centred Design",
      credits: 5,
      semester: "Fall",
      year: 2,
      status: "planned",
      prerequisites: [],
    },
    {
      id: "capstone",
      code: "CAP401",
      title: "Graduation Project",
      credits: 12,
      semester: "Spring",
      year: 3,
      status: "planned",
      prerequisites: ["cs301"],
    },
  ];
  const tasks: Task[] = [
    {
      id: "task-paper",
      title: "Research paper outline",
      courseId: "cs201",
      dueDate: futureDate(7),
      estimatedMinutes: 360,
      priority: "high",
      status: "in-progress",
      category: "project",
      description: "Build a clear thesis, source map, and section outline.",
      createdAt: now.toISOString(),
    },
    {
      id: "task-algo",
      title: "Algorithm problem set",
      courseId: "cs201",
      dueDate: futureDate(3),
      estimatedMinutes: 150,
      priority: "high",
      status: "todo",
      category: "assignment",
      description: "Complete and review the weekly problem set.",
      createdAt: now.toISOString(),
    },
    {
      id: "task-stats",
      title: "Statistics midterm",
      courseId: "stat201",
      dueDate: futureDate(4),
      estimatedMinutes: 240,
      priority: "medium",
      status: "todo",
      category: "exam",
      description: "Review distributions, inference, and practice problems.",
      createdAt: now.toISOString(),
    },
    {
      id: "task-reading",
      title: "Read design research",
      courseId: "ux202",
      dueDate: futureDate(2),
      estimatedMinutes: 60,
      priority: "low",
      status: "todo",
      category: "reading",
      createdAt: now.toISOString(),
    },
  ];
  const classSchedule: ClassMeeting[] = [
    {
      id: "class-1",
      title: "Data Structures Lecture",
      courseId: "cs201",
      dayOfWeek: 1,
      startTime: "10:00",
      endTime: "12:00",
      location: "B.2.14",
    },
    {
      id: "class-2",
      title: "Algorithms Lab",
      courseId: "cs201",
      dayOfWeek: 2,
      startTime: "14:00",
      endTime: "16:00",
      location: "Lab 3",
    },
    {
      id: "class-3",
      title: "Statistics Tutorial",
      courseId: "stat201",
      dayOfWeek: 3,
      startTime: "09:00",
      endTime: "10:30",
      location: "A.1.05",
    },
    {
      id: "class-4",
      title: "Design Studio",
      courseId: "ux202",
      dayOfWeek: 4,
      startTime: "13:00",
      endTime: "15:00",
      location: "Studio 2",
    },
    {
      id: "class-5",
      title: "Data Structures Workshop",
      courseId: "cs201",
      dayOfWeek: 5,
      startTime: "11:00",
      endTime: "12:30",
      location: "B.2.14",
    },
  ];
  const state: PlannerState = {
    courses: courseList,
    tasks,
    studyBlocks: [],
    calendarEvents: [],
    classSchedule,
    studySessions: [],
    deletedGoogleEventIds: [],
    settings: {
      theme: "dark",
      dayStart: "08:00",
      dayEnd: "20:00",
      preferredBlockMinutes: 90,
      maxStudyMinutesPerDay: 240,
      googleCalendarConnected: false,
    },
  };
  for (const task of tasks)
    state.studyBlocks.push(...generateStudyBlocks(state, task, now));
  return state;
}

type Page = "overview" | "degree" | "planner" | "focus" | "settings";
type ModalKind = "task" | "course" | null;
type CalendarMode = "day" | "week" | "month";

function isLocked(course: Course, courses: Course[]): boolean {
  return course.prerequisites.some(
    (id) => courses.find((item) => item.id === id)?.status !== "passed",
  );
}

function gpa(courses: Course[]): number {
  const graded = courses.filter(
    (course) => course.status === "passed" && typeof course.grade === "number",
  );
  const credits = graded.reduce((sum, course) => sum + course.credits, 0);
  return credits
    ? graded.reduce(
        (sum, course) => sum + (course.grade || 0) * course.credits,
        0,
      ) / credits
    : 0;
}

function daysUntil(dateString: string): number {
  return Math.ceil(
    (new Date(dateString).getTime() - Date.now()) / (24 * 60 * 60 * 1000),
  );
}

function formatDate(
  date: Date,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
): string {
  return new Intl.DateTimeFormat(undefined, options).format(date);
}

function formatTime(dateString: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(dateString));
}

function courseStatusTone(
  status: Course["status"],
): "green" | "blue" | "neutral" {
  if (status === "passed") return "green";
  if (status === "in-progress") return "blue";
  return "neutral";
}

function taskTone(priority: Task["priority"]): "red" | "amber" | "neutral" {
  if (priority === "high") return "red";
  if (priority === "medium") return "amber";
  return "neutral";
}

function CourseDependencyGraph({
  courses,
  onSelect,
}: {
  courses: Course[];
  onSelect: (id: string) => void;
}) {
  const nodes = useMemo(
    () =>
      courses.map((course, index) => ({
        course,
        x: 40 + (index % 3) * 270,
        y: 32 + Math.floor(index / 3) * 142,
      })),
    [courses],
  );
  const nodeMap = new Map(nodes.map((node) => [node.course.id, node]));
  return (
    <div className="dependency-graph-wrap">
      <div className="graph-legend">
        <span>
          <i className="legend-dot passed" /> Passed
        </span>
        <span>
          <i className="legend-dot progress" /> In progress
        </span>
        <span>
          <i className="legend-dot locked" /> Prerequisite locked
        </span>
      </div>
      <svg
        className="dependency-graph"
        viewBox={`0 0 850 ${Math.max(340, Math.ceil(courses.length / 3) * 142 + 35)}`}
        role="img"
        aria-label="Course prerequisite dependency graph"
      >
        <defs>
          <marker
            id="arrowhead"
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 6 3, 0 6" fill="currentColor" />
          </marker>
        </defs>
        {nodes.map(({ course, x, y }) =>
          course.prerequisites.map((prerequisiteId) => {
            const prerequisite = nodeMap.get(prerequisiteId);
            if (!prerequisite) return null;
            const startX = prerequisite.x + 192;
            const startY = prerequisite.y + 43;
            const endX = x;
            const endY = y + 43;
            return (
              <path
                key={`${prerequisiteId}-${course.id}`}
                d={`M ${startX} ${startY} C ${startX + 44} ${startY}, ${endX - 44} ${endY}, ${endX} ${endY}`}
                className="graph-edge"
                markerEnd="url(#arrowhead)"
              />
            );
          }),
        )}
        {nodes.map(({ course, x, y }) => {
          const locked = isLocked(course, courses);
          return (
            <g
              key={course.id}
              className={`graph-node ${locked ? "is-locked" : `status-${course.status}`}`}
              onClick={() => onSelect(course.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) =>
                event.key === "Enter" && onSelect(course.id)
              }
            >
              <rect x={x} y={y} width="192" height="86" rx="12" />
              <text x={x + 14} y={y + 23} className="graph-code">
                {course.code}
              </text>
              <text x={x + 14} y={y + 44} className="graph-title">
                {course.title.length > 22
                  ? `${course.title.slice(0, 21)}…`
                  : course.title}
              </text>
              <text x={x + 14} y={y + 67} className="graph-subtitle">
                {locked
                  ? "Prerequisite locked"
                  : `${course.credits} credits · ${course.status}`}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function App() {
  const [state, setState] = useState<PlannerState>(() => initialState());
  const [hydrated, setHydrated] = useState(false);
  const [page, setPage] = useState<Page>("overview");
  const [modal, setModal] = useState<ModalKind>(null);
  const [toast, setToast] = useState("");
  const [degreeTab, setDegreeTab] = useState<"canvas" | "graph">("canvas");
  const [plannerTab, setPlannerTab] = useState<"kanban" | "calendar">(
    "calendar",
  );
  const [calendarMode, setCalendarMode] = useState<CalendarMode>("week");
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [focusTaskId, setFocusTaskId] = useState<string>("");
  const [pomodoroSeconds, setPomodoroSeconds] = useState(25 * 60);
  const [pomodoroRunning, setPomodoroRunning] = useState(false);
  const [timerCompleted, setTimerCompleted] = useState(false);
  const [timerKind, setTimerKind] = useState<"focus" | "short" | "long">(
    "focus",
  );
  const [search, setSearch] = useState("");
  const [newCourse, setNewCourse] = useState({
    code: "",
    title: "",
    credits: 5,
    year: 1,
    semester: "Fall",
    prerequisites: [] as string[],
  });
  const [newTask, setNewTask] = useState({
    title: "",
    courseId: "",
    dueDate: futureDate(7).slice(0, 10),
    estimatedHours: 3,
    priority: "medium" as Task["priority"],
    category: "assignment" as TaskCategory,
    description: "",
  });
  const [passphrase, setPassphrase] = useState("");
  const [importPassphrase, setImportPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [meetingForm, setMeetingForm] = useState({
    title: "",
    dayOfWeek: 1,
    startTime: "10:00",
    endTime: "11:30",
    location: "",
  });
  const importFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    loadState().then((saved) => {
      if (!active) return;
      if (saved) setState(refreshMissedBlocks(saved));
      setHydrated(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveState(state).catch((error: Error) => setToast(error.message));
  }, [state, hydrated]);

  useEffect(() => {
    const root = document.documentElement;
    const useDark =
      state.settings.theme === "dark" ||
      (state.settings.theme === "system" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    root.classList.toggle("dark", useDark);
  }, [state.settings.theme]);

  useEffect(() => {
    const id = window.setInterval(
      () =>
        setState((previous) => {
          let next = refreshMissedBlocks(previous);
          // Imported exams can be months away. Generate their first study plan once they enter the next-week window.
          for (const task of next.tasks) {
            if (task.status === "done") continue;
            if (
              next.studyBlocks.some(
                (block) =>
                  block.taskId === task.id && block.status === "scheduled",
              )
            )
              continue;
            const generated = generateStudyBlocks(next, task);
            if (generated.length)
              next = {
                ...next,
                studyBlocks: [...next.studyBlocks, ...generated],
              };
          }
          return next;
        }),
      60_000,
    );
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!pomodoroRunning) return;
    const id = window.setInterval(
      () =>
        setPomodoroSeconds((seconds) => {
          if (seconds <= 1) {
            window.clearInterval(id);
            setPomodoroRunning(false);
            setTimerCompleted(true);
            return 0;
          }
          return seconds - 1;
        }),
      1000,
    );
    return () => window.clearInterval(id);
  }, [pomodoroRunning]);

  useEffect(() => {
    if (!timerCompleted) return;
    if (timerKind !== "focus" || !focusTaskId) {
      setTimerCompleted(false);
      return;
    }
    const end = new Date();
    const start = new Date(end.getTime() - 25 * 60_000);
    const session: StudySession = {
      id: makeId("session"),
      taskId: focusTaskId,
      start: start.toISOString(),
      end: end.toISOString(),
      durationMinutes: 25,
      kind: "pomodoro",
    };
    setState((previous) => ({
      ...previous,
      studySessions: [...previous.studySessions, session],
      tasks: previous.tasks.map((task) =>
        task.id === focusTaskId && task.status === "todo"
          ? { ...task, status: "in-progress" }
          : task,
      ),
    }));
    setTimerCompleted(false);
    setToast("Pomodoro logged · 25 minutes added to your focus history.");
  }, [timerCompleted, focusTaskId, timerKind]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), 3600);
    return () => window.clearTimeout(id);
  }, [toast]);

  const activeTasks = useMemo(
    () => state.tasks.filter((task) => task.status !== "done"),
    [state.tasks],
  );
  const passedCredits = state.courses
    .filter((course) => course.status === "passed")
    .reduce((total, course) => total + course.credits, 0);
  const totalCredits = state.courses.reduce(
    (total, course) => total + course.credits,
    0,
  );
  const nextUp = useMemo(() => getNextUpTask(state), [state]);
  const stressIds = useMemo(
    () => getHighStressTaskIds(state.tasks),
    [state.tasks],
  );
  const totalTrackedMinutes = state.studySessions.reduce(
    (sum, session) => sum + session.durationMinutes,
    0,
  );
  const focusTask =
    state.tasks.find((task) => task.id === focusTaskId) || nextUp;
  const focusBlocks = state.studyBlocks.filter(
    (block) => block.taskId === focusTask?.id,
  );

  const goToFocus = (taskId?: string) => {
    const targetId = taskId || nextUp?.id || state.tasks[0]?.id || "";
    setFocusTaskId(targetId);
    setPage("focus");
    setPomodoroRunning(false);
    setTimerKind("focus");
    setPomodoroSeconds(25 * 60);
  };

  const updateTaskStatus = (taskId: string, status: TaskStatus) => {
    setState((previous) => {
      const currentTask = previous.tasks.find((task) => task.id === taskId);
      let next = {
        ...previous,
        tasks: previous.tasks.map((task) =>
          task.id === taskId
            ? {
                ...task,
                status,
                updatedAt: new Date().toISOString(),
                googleEventId:
                  status === "done" ? undefined : task.googleEventId,
              }
            : task,
        ),
      };
      if (status === "done") {
        const scheduledToRemove = next.studyBlocks.filter(
          (block) => block.taskId === taskId && block.status === "scheduled",
        );
        const remoteIds = [
          currentTask?.googleEventId,
          ...scheduledToRemove.map((block) => block.googleEventId),
        ].filter((id): id is string => Boolean(id));
        next = {
          ...next,
          studyBlocks: next.studyBlocks.filter(
            (block) => block.taskId !== taskId || block.status !== "scheduled",
          ),
          deletedGoogleEventIds: [
            ...new Set([...next.deletedGoogleEventIds, ...remoteIds]),
          ],
        };
      } else next = rescheduleTaskBlocks(next, taskId);
      return next;
    });
  };

  const createTask = (event: FormEvent) => {
    event.preventDefault();
    if (!newTask.title.trim()) return;
    const task: Task = {
      id: makeId("task"),
      title: newTask.title.trim(),
      courseId: newTask.courseId || undefined,
      dueDate: new Date(`${newTask.dueDate}T23:59:00`).toISOString(),
      estimatedMinutes: Math.max(30, Number(newTask.estimatedHours) * 60),
      priority: newTask.priority,
      status: "todo",
      category: newTask.category,
      description: newTask.description.trim() || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setState((previous) => {
      const withTask = { ...previous, tasks: [...previous.tasks, task] };
      return {
        ...withTask,
        studyBlocks: [
          ...previous.studyBlocks,
          ...generateStudyBlocks(withTask, task),
        ],
      };
    });
    setNewTask({
      title: "",
      courseId: "",
      dueDate: futureDate(7).slice(0, 10),
      estimatedHours: 3,
      priority: "medium",
      category: "assignment",
      description: "",
    });
    setModal(null);
    setToast("Assignment created and smart blocks scheduled.");
  };

  const createCourse = (event: FormEvent) => {
    event.preventDefault();
    if (!newCourse.code.trim() || !newCourse.title.trim()) return;
    const course: Course = {
      id: makeId("course"),
      code: newCourse.code.trim().toUpperCase(),
      title: newCourse.title.trim(),
      credits: Number(newCourse.credits),
      semester: newCourse.semester,
      year: Number(newCourse.year),
      status: "planned",
      prerequisites: newCourse.prerequisites,
    };
    setState((previous) => ({
      ...previous,
      courses: [...previous.courses, course],
    }));
    setNewCourse({
      code: "",
      title: "",
      credits: 5,
      year: 1,
      semester: "Fall",
      prerequisites: [],
    });
    setModal(null);
    setToast("Course added to your degree canvas.");
  };

  const setCourseStatus = (course: Course, status: Course["status"]) => {
    if (status === "passed" && isLocked(course, state.courses)) {
      setToast("This course is locked until all prerequisites are passed.");
      return;
    }
    setState((previous) => ({
      ...previous,
      courses: previous.courses.map((item) =>
        item.id === course.id
          ? {
              ...item,
              status,
              grade: status === "passed" ? (item.grade ?? 3.0) : item.grade,
            }
          : item,
      ),
    }));
  };

  const setCourseGrade = (courseId: string, grade: number | undefined) => {
    setState((previous) => ({
      ...previous,
      courses: previous.courses.map((item) =>
        item.id === courseId ? { ...item, grade } : item,
      ),
    }));
  };

  const markBlock = (block: StudyBlock, status: StudyBlock["status"]) => {
    setState((previous) => {
      const marked = {
        ...previous,
        studyBlocks: previous.studyBlocks.map((item) =>
          item.id === block.id
            ? { ...item, status, updatedAt: new Date().toISOString() }
            : item,
        ),
        deletedGoogleEventIds:
          (status === "missed" || status === "completed") && block.googleEventId
            ? [
                ...new Set([
                  ...previous.deletedGoogleEventIds,
                  block.googleEventId,
                ]),
              ]
            : previous.deletedGoogleEventIds,
      };
      if (status === "missed")
        return rescheduleTaskBlocks(marked, block.taskId);
      if (status === "completed") {
        const session: StudySession = {
          id: makeId("session"),
          taskId: block.taskId,
          start: block.start,
          end: block.end,
          durationMinutes: block.minutes,
          kind: "block",
        };
        return { ...marked, studySessions: [...marked.studySessions, session] };
      }
      return marked;
    });
    setToast(
      status === "missed"
        ? "Missed block moved; the remaining time has been redistributed."
        : "Study block updated.",
    );
  };

  const addClassMeeting = (event: FormEvent) => {
    event.preventDefault();
    if (!meetingForm.title.trim()) return;
    const meeting: ClassMeeting = {
      id: makeId("class"),
      ...meetingForm,
      title: meetingForm.title.trim(),
      dayOfWeek: Number(meetingForm.dayOfWeek),
    };
    setState((previous) => ({
      ...previous,
      classSchedule: [...previous.classSchedule, meeting],
    }));
    setMeetingForm({
      title: "",
      dayOfWeek: 1,
      startTime: "10:00",
      endTime: "11:30",
      location: "",
    });
    setToast("Recurring class time added to your availability.");
  };

  const exportBackup = async () => {
    try {
      setBusy(true);
      const blob = await encryptState(state, passphrase);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `campusos-backup-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setToast("Encrypted backup downloaded. Keep the passphrase safe.");
    } catch (error) {
      setToast(
        error instanceof Error ? error.message : "Backup export failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const importBackup = async (file?: File) => {
    if (!file) return;
    try {
      setBusy(true);
      const imported = await decryptState(file, importPassphrase);
      setState(imported);
      setToast("Encrypted backup restored successfully.");
      setImportPassphrase("");
    } catch (error) {
      setToast(
        error instanceof Error ? error.message : "Backup import failed.",
      );
    } finally {
      setBusy(false);
      if (importFileRef.current) importFileRef.current.value = "";
    }
  };

  const importLmsFiles = async (files: File[]) => {
    if (!files.length) return;
    try {
      setBusy(true);
      const result = await importUniversityLmsFiles(files, state);
      setState(result.state);
      setToast(
        `LMS import complete · ${result.coursesImported} courses, ${result.examsImported} exams, ${result.meetingsImported} recurring meetings. ${result.attemptsPreserved} transcript attempts retained.`,
      );
      setPage("overview");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "LMS import failed.");
    } finally {
      setBusy(false);
    }
  };

  const syncGoogle = async () => {
    if (!GOOGLE_CLIENT_ID) {
      setToast(
        "Add VITE_GOOGLE_CLIENT_ID to .env.local to enable Google Calendar sync.",
      );
      return;
    }
    try {
      setBusy(true);
      const synced = await connectAndSyncCalendar(GOOGLE_CLIENT_ID, state);
      setState(synced);
      setToast(
        "Google Calendar synced. Imported events and updated planner events.",
      );
    } catch (error) {
      setToast(
        error instanceof Error ? error.message : "Google Calendar sync failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const previousCalendar = () => {
    setCalendarDate((current) => {
      const value = new Date(current);
      if (calendarMode === "day") value.setDate(value.getDate() - 1);
      else if (calendarMode === "week") value.setDate(value.getDate() - 7);
      else value.setMonth(value.getMonth() - 1);
      return value;
    });
  };
  const nextCalendar = () => {
    setCalendarDate((current) => {
      const value = new Date(current);
      if (calendarMode === "day") value.setDate(value.getDate() + 1);
      else if (calendarMode === "week") value.setDate(value.getDate() + 7);
      else value.setMonth(value.getMonth() + 1);
      return value;
    });
  };

  const moveCalendarItem = (
    type: "task" | "block" | "event",
    sourceId: string,
    targetDate: Date,
  ) => {
    if (type === "task") {
      setState((previous) => {
        const updated = {
          ...previous,
          tasks: previous.tasks.map((task) =>
            task.id === sourceId
              ? {
                  ...task,
                  dueDate: new Date(
                    targetDate.getFullYear(),
                    targetDate.getMonth(),
                    targetDate.getDate(),
                    23,
                    59,
                    0,
                  ).toISOString(),
                  updatedAt: new Date().toISOString(),
                }
              : task,
          ),
        };
        return rescheduleTaskBlocks(updated, sourceId);
      });
      setToast("Deadline moved; study blocks recalculated.");
      return;
    }
    if (type === "event") {
      const calendarEvent = state.calendarEvents.find(
        (item) => item.id === sourceId,
      );
      if (!calendarEvent) return;
      const oldStart = new Date(calendarEvent.start);
      const duration =
        new Date(calendarEvent.end).getTime() - oldStart.getTime();
      const newStart = new Date(targetDate);
      newStart.setHours(oldStart.getHours(), oldStart.getMinutes(), 0, 0);
      const newEnd = new Date(newStart.getTime() + duration);
      const overlapEvent = (a: number, b: number, c: number, d: number) =>
        a < d && b > c;
      const classConflict = state.classSchedule.some((meeting) => {
        if (meeting.dayOfWeek !== newStart.getDay()) return false;
        const [sh, sm] = meeting.startTime.split(":").map(Number);
        const [eh, em] = meeting.endTime.split(":").map(Number);
        const meetingStart = new Date(newStart);
        meetingStart.setHours(sh, sm, 0, 0);
        const meetingEnd = new Date(newStart);
        meetingEnd.setHours(eh, em, 0, 0);
        return overlapEvent(
          newStart.getTime(),
          newEnd.getTime(),
          meetingStart.getTime(),
          meetingEnd.getTime(),
        );
      });
      const otherEventConflict = state.calendarEvents.some(
        (item) =>
          item.id !== calendarEvent.id &&
          overlapEvent(
            newStart.getTime(),
            newEnd.getTime(),
            new Date(item.start).getTime(),
            new Date(item.end).getTime(),
          ),
      );
      const blockConflict = state.studyBlocks.some(
        (item) =>
          item.status === "scheduled" &&
          overlapEvent(
            newStart.getTime(),
            newEnd.getTime(),
            new Date(item.start).getTime(),
            new Date(item.end).getTime(),
          ),
      );
      if (classConflict || otherEventConflict || blockConflict) {
        setToast(
          "That slot conflicts with a class, event, or another study block.",
        );
        return;
      }
      setState((previous) => ({
        ...previous,
        calendarEvents: previous.calendarEvents.map((item) =>
          item.id === calendarEvent.id
            ? {
                ...item,
                start: newStart.toISOString(),
                end: newEnd.toISOString(),
                updatedAt: new Date().toISOString(),
                syncDirty: true,
              }
            : item,
        ),
      }));
      setToast(
        "Calendar event moved. It will sync on your next Google Calendar sync.",
      );
      return;
    }
    const block = state.studyBlocks.find((item) => item.id === sourceId);
    if (!block) return;
    const oldStart = new Date(block.start);
    const newStart = new Date(targetDate);
    newStart.setHours(oldStart.getHours(), oldStart.getMinutes(), 0, 0);
    const newEnd = new Date(newStart.getTime() + block.minutes * 60_000);
    const overlapsInterval = (a: number, b: number, c: number, d: number) =>
      a < d && b > c;
    const classConflict = state.classSchedule.some((meeting) => {
      if (meeting.dayOfWeek !== newStart.getDay()) return false;
      const [sh, sm] = meeting.startTime.split(":").map(Number);
      const [eh, em] = meeting.endTime.split(":").map(Number);
      const start = new Date(newStart);
      start.setHours(sh, sm, 0, 0);
      const end = new Date(newStart);
      end.setHours(eh, em, 0, 0);
      return overlapsInterval(
        newStart.getTime(),
        newEnd.getTime(),
        start.getTime(),
        end.getTime(),
      );
    });
    const eventConflict = state.calendarEvents.some((event) =>
      overlapsInterval(
        newStart.getTime(),
        newEnd.getTime(),
        new Date(event.start).getTime(),
        new Date(event.end).getTime(),
      ),
    );
    const blockConflict = state.studyBlocks.some(
      (other) =>
        other.id !== block.id &&
        other.status === "scheduled" &&
        overlapsInterval(
          newStart.getTime(),
          newEnd.getTime(),
          new Date(other.start).getTime(),
          new Date(other.end).getTime(),
        ),
    );
    if (classConflict || eventConflict || blockConflict) {
      setToast(
        "That slot conflicts with a class, event, or another study block.",
      );
      return;
    }
    setState((previous) => ({
      ...previous,
      studyBlocks: previous.studyBlocks.map((item) =>
        item.id === block.id
          ? {
              ...item,
              start: newStart.toISOString(),
              end: newEnd.toISOString(),
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    }));
    setToast("Study block moved.");
  };

  const deleteTask = (taskId: string) => {
    setState((previous) => {
      const task = previous.tasks.find((item) => item.id === taskId);
      const blocks = previous.studyBlocks.filter(
        (item) => item.taskId === taskId,
      );
      const ids = [
        task?.googleEventId,
        ...blocks.map((item) => item.googleEventId),
      ].filter((id): id is string => Boolean(id));
      return {
        ...previous,
        tasks: previous.tasks.filter((item) => item.id !== taskId),
        studyBlocks: previous.studyBlocks.filter(
          (item) => item.taskId !== taskId,
        ),
        studySessions: previous.studySessions.filter(
          (item) => item.taskId !== taskId,
        ),
        deletedGoogleEventIds: [
          ...new Set([...previous.deletedGoogleEventIds, ...ids]),
        ],
      };
    });
    setToast(
      "Task deleted. Any linked Google Calendar events will be removed on the next sync.",
    );
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <GraduationCap size={21} />
          </div>
          <div>
            <strong>CampusOS</strong>
            <span>Academic workspace</span>
          </div>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          <NavItem
            icon={<LayoutDashboard size={18} />}
            label="Overview"
            active={page === "overview"}
            onClick={() => setPage("overview")}
          />
          <NavItem
            icon={<GraduationCap size={18} />}
            label="Degree plan"
            active={page === "degree"}
            onClick={() => setPage("degree")}
            extra={`${state.courses.filter((course) => course.status === "passed").length}/${state.courses.length}`}
          />
          <NavItem
            icon={<CalendarDays size={18} />}
            label="Planner"
            active={page === "planner"}
            onClick={() => setPage("planner")}
            extra={String(activeTasks.length)}
          />
          <NavItem
            icon={<AlarmClock size={18} />}
            label="Deep work"
            active={page === "focus"}
            onClick={() => goToFocus(focusTask?.id)}
          />
        </nav>
        <div className="sidebar-divider" />
        <div className="workspace-label">PREFERENCES</div>
        <nav className="main-nav">
          <NavItem
            icon={<Settings2 size={18} />}
            label="Settings & backup"
            active={page === "settings"}
            onClick={() => setPage("settings")}
          />
        </nav>
        <div className="sidebar-spacer" />
        <div className="privacy-card">
          <div className="privacy-icon">
            <ShieldCheck size={17} />
          </div>
          <div>
            <strong>Your data stays yours</strong>
            <p>Stored locally on this device. Cloud sync is optional.</p>
          </div>
        </div>
        <button className="profile-row" onClick={() => setPage("settings")}>
          <div className="avatar">S</div>
          <div className="profile-details">
            <strong>Student workspace</strong>
            <span>Local profile</span>
          </div>
          <MoreHorizontal size={17} />
        </button>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>
              {
                {
                  overview: "Overview",
                  degree: "Degree plan",
                  planner: "Planner",
                  focus: "Deep work",
                  settings: "Settings & backup",
                }[page]
              }
            </strong>
          </div>
          <div className="topbar-actions">
            <span className="local-pill">
              <span /> Local-first mode
            </span>
            <button
              className="icon-button"
              aria-label="Toggle theme"
              onClick={() =>
                setState((previous) => ({
                  ...previous,
                  settings: {
                    ...previous.settings,
                    theme:
                      previous.settings.theme === "dark" ? "light" : "dark",
                  },
                }))
              }
            >
              {state.settings.theme === "dark" ? (
                <Sun size={17} />
              ) : (
                <Moon size={17} />
              )}
            </button>
            <button
              className="add-button"
              onClick={() => {
                setModal("task");
                setPage("planner");
              }}
            >
              <Plus size={17} /> New task
            </button>
          </div>
        </header>
        <div className="page-content">
          {page === "overview" && (
            <OverviewPage
              state={state}
              nextUp={nextUp}
              passedCredits={passedCredits}
              totalCredits={totalCredits}
              totalTrackedMinutes={totalTrackedMinutes}
              stressIds={stressIds}
              onFocus={goToFocus}
              onPage={setPage}
              onCreate={() => {
                setModal("task");
                setPage("planner");
              }}
            />
          )}
          {page === "degree" && (
            <DegreePage
              state={state}
              tab={degreeTab}
              setTab={setDegreeTab}
              search={search}
              setSearch={setSearch}
              onAdd={() => setModal("course")}
              onStatus={setCourseStatus}
              onGrade={setCourseGrade}
              onToast={setToast}
            />
          )}
          {page === "planner" && (
            <PlannerPage
              state={state}
              tab={plannerTab}
              setTab={setPlannerTab}
              mode={calendarMode}
              setMode={setCalendarMode}
              date={calendarDate}
              setDate={setCalendarDate}
              previous={previousCalendar}
              next={nextCalendar}
              onAdd={() => setModal("task")}
              onTaskStatus={updateTaskStatus}
              onFocus={goToFocus}
              onBlockStatus={markBlock}
              stressIds={stressIds}
              onDeleteTask={deleteTask}
              onMoveItem={moveCalendarItem}
            />
          )}
          {page === "focus" && (
            <FocusPage
              state={state}
              focusTask={focusTask}
              focusTaskId={focusTaskId || focusTask?.id || ""}
              setFocusTaskId={(id) => {
                setFocusTaskId(id);
                setPomodoroRunning(false);
                setPomodoroSeconds(25 * 60);
              }}
              seconds={pomodoroSeconds}
              running={pomodoroRunning}
              setRunning={setPomodoroRunning}
              setSeconds={setPomodoroSeconds}
              setState={setState}
              timerKind={timerKind}
              setTimerKind={setTimerKind}
              focusBlocks={focusBlocks}
              onBlockStatus={markBlock}
              onTaskStatus={updateTaskStatus}
            />
          )}
          {page === "settings" && (
            <SettingsPage
              state={state}
              setState={setState}
              passphrase={passphrase}
              setPassphrase={setPassphrase}
              importPassphrase={importPassphrase}
              setImportPassphrase={setImportPassphrase}
              importFileRef={importFileRef}
              onExport={exportBackup}
              onImport={importBackup}
              onImportLms={importLmsFiles}
              onSync={syncGoogle}
              busy={busy}
              meetingForm={meetingForm}
              setMeetingForm={setMeetingForm}
              onAddMeeting={addClassMeeting}
              onDisconnect={() => {
                setState((previous) => disconnectCalendar(previous));
                setToast("Google Calendar disconnected for this session.");
              }}
            />
          )}
        </div>
        <footer className="app-footer">
          <span>
            <LockKeyhole size={13} /> Private by default
          </span>
          <span>
            CampusOS <i>·</i> Study smarter, not longer
          </span>
          <span>
            IndexedDB <i>·</i> Local storage active
          </span>
        </footer>
      </main>

      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setModal(null)
          }
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">PLANNER SETUP</span>
                <h2 id="modal-title">
                  {modal === "task"
                    ? "Create an assignment"
                    : "Add a degree course"}
                </h2>
                <p>
                  {modal === "task"
                    ? "Your free time will be scanned for study blocks."
                    : "Add a course to a year and semester in your canvas."}
                </p>
              </div>
              <button
                className="icon-button"
                onClick={() => setModal(null)}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>
            {modal === "task" ? (
              <form className="form-stack" onSubmit={createTask}>
                <label>
                  Assignment name
                  <input
                    autoFocus
                    required
                    value={newTask.title}
                    onChange={(event) =>
                      setNewTask({ ...newTask, title: event.target.value })
                    }
                    placeholder="e.g. Research paper"
                  />
                </label>
                <div className="form-grid">
                  <label>
                    Due date
                    <input
                      required
                      type="date"
                      min={new Date().toISOString().slice(0, 10)}
                      value={newTask.dueDate}
                      onChange={(event) =>
                        setNewTask({ ...newTask, dueDate: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Estimated effort (hours)
                    <input
                      required
                      type="number"
                      min="0.5"
                      max="200"
                      step="0.5"
                      value={newTask.estimatedHours}
                      onChange={(event) =>
                        setNewTask({
                          ...newTask,
                          estimatedHours: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                </div>
                <div className="form-grid">
                  <label>
                    Course
                    <select
                      value={newTask.courseId}
                      onChange={(event) =>
                        setNewTask({ ...newTask, courseId: event.target.value })
                      }
                    >
                      <option value="">No course selected</option>
                      {state.courses.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.code} · {course.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Type
                    <select
                      value={newTask.category}
                      onChange={(event) =>
                        setNewTask({
                          ...newTask,
                          category: event.target.value as TaskCategory,
                        })
                      }
                    >
                      <option value="assignment">Assignment</option>
                      <option value="exam">Exam</option>
                      <option value="project">Project / major deadline</option>
                      <option value="reading">Reading</option>
                    </select>
                  </label>
                </div>
                <label>
                  Priority
                  <select
                    value={newTask.priority}
                    onChange={(event) =>
                      setNewTask({
                        ...newTask,
                        priority: event.target.value as Task["priority"],
                      })
                    }
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </label>
                <label>
                  Notes <span className="optional">(optional)</span>
                  <textarea
                    value={newTask.description}
                    onChange={(event) =>
                      setNewTask({
                        ...newTask,
                        description: event.target.value,
                      })
                    }
                    rows={2}
                    placeholder="What should you accomplish?"
                  />
                </label>
                <div className="smart-preview">
                  <WandSparkles size={17} />
                  <div>
                    <strong>Smart blocking enabled</strong>
                    <p>
                      CampusOS will reserve 90-minute windows before the
                      deadline, avoiding classes, calendar events, and other
                      study blocks.
                    </p>
                  </div>
                </div>
                <div className="modal-actions">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setModal(null)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">
                    <Plus size={16} /> Create & schedule
                  </Button>
                </div>
              </form>
            ) : (
              <form className="form-stack" onSubmit={createCourse}>
                <div className="form-grid">
                  <label>
                    Course code
                    <input
                      autoFocus
                      required
                      value={newCourse.code}
                      onChange={(event) =>
                        setNewCourse({ ...newCourse, code: event.target.value })
                      }
                      placeholder="CS301"
                    />
                  </label>
                  <label>
                    University credits
                    <input
                      required
                      type="number"
                      min="1"
                      max="60"
                      value={newCourse.credits}
                      onChange={(event) =>
                        setNewCourse({
                          ...newCourse,
                          credits: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                </div>
                <label>
                  Course title
                  <input
                    required
                    value={newCourse.title}
                    onChange={(event) =>
                      setNewCourse({ ...newCourse, title: event.target.value })
                    }
                    placeholder="Algorithms & Complexity"
                  />
                </label>
                <div className="form-grid">
                  <label>
                    Year
                    <select
                      value={newCourse.year}
                      onChange={(event) =>
                        setNewCourse({
                          ...newCourse,
                          year: Number(event.target.value),
                        })
                      }
                    >
                      {[1, 2, 3, 4, 5, 6].map((year) => (
                        <option key={year} value={year}>
                          Year {year}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Semester
                    <select
                      value={newCourse.semester}
                      onChange={(event) =>
                        setNewCourse({
                          ...newCourse,
                          semester: event.target.value,
                        })
                      }
                    >
                      <option>Fall</option>
                      <option>Spring</option>
                      <option>Summer</option>
                      <option>Winter</option>
                    </select>
                  </label>
                </div>
                <label>
                  Prerequisites{" "}
                  <span className="optional">
                    (all must be passed to unlock)
                  </span>
                  <div className="prerequisite-picker">
                    {state.courses.map((course) => (
                      <label className="check-row" key={course.id}>
                        <input
                          type="checkbox"
                          checked={newCourse.prerequisites.includes(course.id)}
                          onChange={(event) =>
                            setNewCourse({
                              ...newCourse,
                              prerequisites: event.target.checked
                                ? [...newCourse.prerequisites, course.id]
                                : newCourse.prerequisites.filter(
                                    (id) => id !== course.id,
                                  ),
                            })
                          }
                        />
                        <span>
                          {course.code} · {course.title}
                        </span>
                        <small>
                          {course.status === "passed"
                            ? "Passed"
                            : course.status === "in-progress"
                              ? "In progress"
                              : "Planned"}
                        </small>
                      </label>
                    ))}
                  </div>
                </label>
                <div className="modal-actions">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setModal(null)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">
                    <Plus size={16} /> Add course
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={17} />
          <span>{toast}</span>
          <button
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function NavItem({
  icon,
  label,
  active,
  onClick,
  extra,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  extra?: string;
}) {
  return (
    <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick}>
      {icon}
      <span>{label}</span>
      {extra && <small>{extra}</small>}
    </button>
  );
}

function OverviewPage({
  state,
  nextUp,
  passedCredits,
  totalCredits,
  totalTrackedMinutes,
  stressIds,
  onFocus,
  onPage,
  onCreate,
}: {
  state: PlannerState;
  nextUp?: Task;
  passedCredits: number;
  totalCredits: number;
  totalTrackedMinutes: number;
  stressIds: Set<string>;
  onFocus: (id?: string) => void;
  onPage: (page: Page) => void;
  onCreate: () => void;
}) {
  const tasksThisWeek = state.tasks.filter(
    (task) =>
      task.status !== "done" &&
      daysUntil(task.dueDate) >= 0 &&
      daysUntil(task.dueDate) <= 7,
  ).length;
  const upcoming = [...state.tasks]
    .filter((task) => task.status !== "done")
    .sort(
      (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
    )
    .slice(0, 4);
  const blocks = state.studyBlocks
    .filter(
      (block) =>
        block.status === "scheduled" &&
        new Date(block.start).getTime() > Date.now(),
    )
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 4);
  const firstName = "there";
  return (
    <div className="page-stack">
      <div className="welcome-row">
        <div>
          <div className="eyebrow">
            {new Intl.DateTimeFormat(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })
              .format(new Date())
              .toUpperCase()}
          </div>
          <h1>
            Good afternoon, {firstName}
            <span className="heading-period">.</span>
          </h1>
          <p>Here’s your academic pulse. Small, consistent sessions add up.</p>
        </div>
        <Button variant="secondary" onClick={() => onPage("planner")}>
          <CalendarDays size={16} /> View schedule
        </Button>
      </div>
      <div className="stat-grid">
        <StatCard
          icon={<GraduationCap size={18} />}
          iconTone="lavender"
          label={
            state.lmsSummary ? "University credits passed" : "Degree progress"
          }
          value={
            state.lmsSummary
              ? String(state.lmsSummary.totalPassedCredits ?? passedCredits)
              : `${passedCredits} / ${totalCredits}`
          }
          suffix={state.lmsSummary ? "earned" : "credits earned"}
          footer={
            state.lmsSummary ? (
              <span className="stat-trend">
                <CheckCircle2 size={14} /> Official transcript total
              </span>
            ) : (
              <Progress
                value={totalCredits ? (passedCredits / totalCredits) * 100 : 0}
              />
            )
          }
          detail={
            state.lmsSummary
              ? `${state.lmsSummary.currentRegisteredCredits ?? 0} credits registered this semester`
              : `${Math.round(totalCredits ? (passedCredits / totalCredits) * 100 : 0)}% of mapped course credits`
          }
        />
        <StatCard
          icon={<ListTodo size={18} />}
          iconTone="mint"
          label="Due this week"
          value={String(tasksThisWeek).padStart(2, "0")}
          suffix="open items"
          footer={
            <span className="stat-trend">
              <ArrowDownRight size={14} /> Stay ahead of deadlines
            </span>
          }
          detail={`${state.tasks.filter((task) => task.status === "done").length} tasks completed`}
        />
        <StatCard
          icon={<AlarmClock size={18} />}
          iconTone="peach"
          label="Focus time"
          value={formatDuration(totalTrackedMinutes)}
          suffix="logged total"
          footer={
            <span className="stat-trend">
              <Activity size={14} /> Keep the streak going
            </span>
          }
          detail={`${state.studySessions.length} sessions recorded`}
        />
        <StatCard
          icon={<BarChart3 size={18} />}
          iconTone="blue"
          label={
            state.lmsSummary
              ? "Weighted GPA · imported courses"
              : "Weighted GPA"
          }
          value={gpa(state.courses).toFixed(2)}
          suffix="on a 4.0 scale"
          footer={
            <span className="gpa-caption">
              <span /> Based on graded courses
            </span>
          }
          detail={
            state.lmsSummary?.officialGpaPoints !== undefined
              ? `Official LMS AGPA ${state.lmsSummary.officialGpaPoints.toFixed(2)} / 4.00 · ${state.lmsSummary.officialGpaPercent?.toFixed(2) ?? "—"}%`
              : `${state.courses.filter((course) => course.status === "passed" && course.grade !== undefined).length} graded courses`
          }
        />
      </div>
      <div className="dashboard-grid">
        <Card className="next-up-card">
          <div className="card-topline">
            <div className="section-kicker">
              <Sparkles size={15} /> YOUR NEXT BEST MOVE
            </div>
            <Badge tone="purple">Smart pick</Badge>
          </div>
          {nextUp ? (
            <>
              <div className="next-up-main">
                <div className="next-icon">
                  <Target size={22} />
                </div>
                <div className="next-task-text">
                  <h2>{nextUp.title}</h2>
                  <p>
                    {nextUp.courseId
                      ? state.courses.find(
                          (course) => course.id === nextUp.courseId,
                        )?.code
                      : "Independent study"}{" "}
                    <span>·</span> {nextUp.estimatedMinutes / 60}h estimated
                  </p>
                </div>
              </div>
              <div className="next-meta">
                <span>
                  <Clock3 size={14} /> Due{" "}
                  {daysUntil(nextUp.dueDate) <= 0
                    ? "today"
                    : `in ${daysUntil(nextUp.dueDate)} days`}
                </span>
                <Badge tone={taskTone(nextUp.priority)}>
                  {nextUp.priority} priority
                </Badge>
                {stressIds.has(nextUp.id) && (
                  <Badge tone="red">
                    <AlertTriangle size={12} /> High stress week
                  </Badge>
                )}
              </div>
              <div className="recommendation-note">
                <WandSparkles size={16} />
                <span>
                  Best next step: start with a focused 25-minute session, then
                  review your progress.
                </span>
              </div>
              <div className="next-actions">
                <Button onClick={() => onFocus(nextUp.id)}>
                  <AlarmClock size={16} /> Start focus session
                </Button>
                <Button variant="secondary" onClick={() => onPage("planner")}>
                  Open task <ArrowRight size={15} />
                </Button>
              </div>
            </>
          ) : (
            <EmptyState
              icon={<CheckCircle2 />}
              title="All caught up"
              description="You have no open tasks. Enjoy the breathing room."
            />
          )}
        </Card>
        <Card className="week-card">
          <div className="card-heading">
            <div>
              <h3>This week’s focus</h3>
              <p>Upcoming smart study blocks</p>
            </div>
            <button className="subtle-link" onClick={() => onPage("planner")}>
              Full calendar <ArrowRight size={14} />
            </button>
          </div>
          {blocks.length ? (
            <div className="upcoming-block-list">
              {blocks.map((block) => {
                const task = state.tasks.find(
                  (item) => item.id === block.taskId,
                );
                return (
                  <div className="upcoming-block" key={block.id}>
                    <div className="block-date">
                      <strong>
                        {formatDate(new Date(block.start), { day: "2-digit" })}
                      </strong>
                      <span>
                        {formatDate(new Date(block.start), { month: "short" })}
                      </span>
                    </div>
                    <div className="block-description">
                      <strong>{task?.title || "Study session"}</strong>
                      <span>
                        {formatTime(block.start)} – {formatTime(block.end)}
                      </span>
                    </div>
                    <span className="block-minutes">{block.minutes}m</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={<CalendarDays />}
              title="No blocks scheduled"
              description="Add a task to generate study blocks around your calendar."
            />
          )}
          <button className="wide-text-action" onClick={onCreate}>
            <Plus size={15} /> Add assignment and auto-plan time
          </button>
        </Card>
      </div>
      <div className="dashboard-grid lower-grid">
        <Card>
          <div className="card-heading">
            <div>
              <h3>Deadlines coming up</h3>
              <p>Your next deliverables</p>
            </div>
            <button
              className="icon-text-button"
              onClick={() => onPage("planner")}
            >
              See planner <ArrowRight size={14} />
            </button>
          </div>
          <div className="deadline-list">
            {upcoming.map((task) => (
              <div className="deadline-row" key={task.id}>
                <div className={`deadline-type type-${task.category}`}>
                  <CalendarDays size={16} />
                </div>
                <div className="deadline-copy">
                  <strong>{task.title}</strong>
                  <span>
                    {task.courseId
                      ? state.courses.find(
                          (course) => course.id === task.courseId,
                        )?.code
                      : "Personal task"}{" "}
                    · {formatDate(new Date(task.dueDate))}
                  </span>
                </div>
                <Badge tone={taskTone(task.priority)}>{task.priority}</Badge>
              </div>
            ))}
            {upcoming.length === 0 && (
              <p className="empty-line">No open deadlines. Nice work.</p>
            )}
          </div>
        </Card>
        <Card>
          <div className="card-heading">
            <div>
              <h3>
                {state.lmsSummary
                  ? "Imported courses at a glance"
                  : "Degree at a glance"}
              </h3>
              <p>
                {state.lmsSummary
                  ? "Course status snapshot · not full degree completion"
                  : "Course status snapshot"}
              </p>
            </div>
            <button
              className="icon-text-button"
              onClick={() => onPage("degree")}
            >
              Degree plan <ArrowRight size={14} />
            </button>
          </div>
          <div className="degree-snapshot">
            <div
              className="ring-progress"
              style={
                {
                  "--progress": `${totalCredits ? (passedCredits / totalCredits) * 100 : 0}%`,
                } as CSSProperties
              }
            >
              <div>
                <strong>
                  {Math.round(
                    totalCredits ? (passedCredits / totalCredits) * 100 : 0,
                  )}
                  %
                </strong>
                <span>{state.lmsSummary ? "courses passed" : "complete"}</span>
              </div>
            </div>
            <div className="snapshot-stats">
              <div>
                <span className="snapshot-dot passed" />
                <div>
                  <strong>
                    {
                      state.courses.filter(
                        (course) => course.status === "passed",
                      ).length
                    }
                  </strong>
                  <span>Passed courses</span>
                </div>
              </div>
              <div>
                <span className="snapshot-dot ongoing" />
                <div>
                  <strong>
                    {
                      state.courses.filter(
                        (course) => course.status === "in-progress",
                      ).length
                    }
                  </strong>
                  <span>In progress</span>
                </div>
              </div>
              <div>
                <span className="snapshot-dot planned" />
                <div>
                  <strong>
                    {
                      state.courses.filter((course) =>
                        isLocked(course, state.courses),
                      ).length
                    }
                  </strong>
                  <span>Prerequisite locked</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  iconTone,
  label,
  value,
  suffix,
  footer,
  detail,
}: {
  icon: ReactNode;
  iconTone: string;
  label: string;
  value: string;
  suffix: string;
  footer: ReactNode;
  detail: string;
}) {
  return (
    <Card className="stat-card">
      <div className={`stat-icon ${iconTone}`}>{icon}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">
        {value}
        <span>{suffix}</span>
      </div>
      <div className="stat-footer">{footer}</div>
      <div className="stat-detail">{detail}</div>
    </Card>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

function DegreePage({
  state,
  tab,
  setTab,
  search,
  setSearch,
  onAdd,
  onStatus,
  onGrade,
  onToast,
}: {
  state: PlannerState;
  tab: "canvas" | "graph";
  setTab: (tab: "canvas" | "graph") => void;
  search: string;
  setSearch: (query: string) => void;
  onAdd: () => void;
  onStatus: (course: Course, status: Course["status"]) => void;
  onGrade: (courseId: string, grade: number | undefined) => void;
  onToast: (message: string) => void;
}) {
  const years = [...new Set(state.courses.map((course) => course.year))].sort(
    (a, b) => a - b,
  );
  const visibleCourses = state.courses.filter((course) =>
    `${course.code} ${course.title}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const earned = state.courses
    .filter((course) => course.status === "passed")
    .reduce((sum, course) => sum + course.credits, 0);
  const total = state.courses.reduce((sum, course) => sum + course.credits, 0);
  return (
    <div className="page-stack">
      <SectionHeading
        title="Degree plan"
        subtitle={
          state.lmsSummary
            ? "Imported LMS courses grouped by academic year and semester. These exports do not include your full degree catalogue or prerequisite rules."
            : "Map your academic journey, track credits, and unlock courses as prerequisites are met."
        }
        action={
          <Button onClick={onAdd}>
            <Plus size={16} /> Add course
          </Button>
        }
      />
      {state.lmsSummary && (
        <Card className="lms-degree-note">
          <div>
            <strong>
              {state.lmsSummary.degreeName || "Imported university degree"}
            </strong>
            <span>
              Official cumulative GPA{" "}
              {state.lmsSummary.officialGpaPoints?.toFixed(2) ?? "—"} / 4.00 ·{" "}
              {state.lmsSummary.officialGpaPercent?.toFixed(2) ?? "—"}% ·{" "}
              {state.lmsSummary.totalPassedCredits ?? "—"} credits passed
            </span>
            <span>
              {state.lmsSummary.currentSemesterName || "Current semester"} ·{" "}
              {state.lmsSummary.currentRegisteredCredits ?? "—"} credits
              registered
            </span>
          </div>
          <Badge tone="green">LMS data</Badge>
        </Card>
      )}
      <div className="degree-summary-grid">
        <Card className="degree-summary-card">
          <div className="summary-top">
            <span className="summary-icon lavender">
              <GraduationCap size={18} />
            </span>
            <span>
              {state.lmsSummary
                ? "University credits passed"
                : "Credits earned"}
            </span>
          </div>
          <strong>
            {state.lmsSummary?.totalPassedCredits ?? earned}
            {!state.lmsSummary && <small> / {total} credits</small>}
          </strong>
          {!state.lmsSummary && (
            <Progress value={total ? (earned / total) * 100 : 0} />
          )}
          <p>
            {state.lmsSummary
              ? "Official passed-credit total. The full degree curriculum was not part of the export."
              : `${Math.round(total ? (earned / total) * 100 : 0)}% of your mapped degree`}
          </p>
        </Card>
        <Card className="degree-summary-card">
          <div className="summary-top">
            <span className="summary-icon mint">
              <CheckCircle2 size={18} />
            </span>
            <span>Completed courses</span>
          </div>
          <strong>
            {
              state.courses.filter((course) => course.status === "passed")
                .length
            }
            <small> courses</small>
          </strong>
          <p>
            Weighted GPA: <b>{gpa(state.courses).toFixed(2)}</b> / 4.00
          </p>
        </Card>
        <Card className="degree-summary-card">
          <div className="summary-top">
            <span className="summary-icon peach">
              <LockKeyhole size={18} />
            </span>
            <span>Prerequisites</span>
          </div>
          <strong>
            {
              state.courses.filter((course) => isLocked(course, state.courses))
                .length
            }
            <small> locked</small>
          </strong>
          <p>
            {state.lmsSummary
              ? "Prerequisite rules were not included in the LMS exports."
              : "Courses unlock automatically when required classes are passed."}
          </p>
        </Card>
      </div>
      <div className="degree-toolbar">
        <div className="segmented-tabs">
          <button
            className={tab === "canvas" ? "selected" : ""}
            onClick={() => setTab("canvas")}
          >
            <LayoutDashboard size={15} /> Semester canvas
          </button>
          <button
            className={tab === "graph" ? "selected" : ""}
            onClick={() => setTab("graph")}
          >
            <Activity size={15} /> Dependency graph
          </button>
        </div>
        <label className="search-field">
          <Search size={15} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find a course…"
          />
        </label>
      </div>
      {tab === "canvas" ? (
        <div className="degree-years">
          {years.map((year) => {
            const yearCourses = state.courses.filter(
              (course) => course.year === year,
            );
            const semesterNames = [
              ...new Set(yearCourses.map((course) => course.semester)),
            ];
            return (
              <div className="year-row" key={year}>
                <div className="year-label">
                  <span>YEAR {year}</span>
                  <strong>
                    {yearCourses.reduce(
                      (sum, course) => sum + course.credits,
                      0,
                    )}{" "}
                    <small>credits</small>
                  </strong>
                  <i />
                </div>
                <div className="semester-grid">
                  {semesterNames.map((semester) => {
                    const courses = visibleCourses.filter(
                      (course) =>
                        course.year === year && course.semester === semester,
                    );
                    const termSummary =
                      state.lmsSummary?.semesterSummaries.find(
                        (item) => item.semesterName === semester,
                      );
                    return (
                      <div className="semester-column" key={semester}>
                        <div className="semester-heading">
                          <strong>{semester}</strong>
                          <span>
                            {courses.reduce(
                              (sum, course) => sum + course.credits,
                              0,
                            )}{" "}
                            credits
                            {termSummary?.semesterGpaPoints !== undefined &&
                            (termSummary.passedCredits ?? 0) > 0
                              ? ` · GPA ${termSummary.semesterGpaPoints.toFixed(2)}`
                              : ""}
                          </span>
                        </div>
                        {courses.length ? (
                          courses.map((course) => (
                            <CourseTile
                              key={course.id}
                              course={course}
                              allCourses={state.courses}
                              onStatus={onStatus}
                              onToast={onToast}
                            />
                          ))
                        ) : (
                          <div className="semester-empty">
                            No matching courses
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <button className="add-semester-course" onClick={onAdd}>
            <Plus size={15} /> Add another course to your degree
          </button>
        </div>
      ) : (
        <Card className="graph-card">
          <div className="graph-title-row">
            <div>
              <h3>Prerequisite dependency map</h3>
              <p>Select a course to inspect its current unlock status.</p>
            </div>
            <Badge tone="blue">Live dependencies</Badge>
          </div>
          <CourseDependencyGraph
            courses={visibleCourses}
            onSelect={(id) => {
              const course = state.courses.find((item) => item.id === id);
              if (course)
                onToast(
                  `${course.code}: ${isLocked(course, state.courses) ? `Locked — pass ${course.prerequisites.map((pre) => state.courses.find((item) => item.id === pre)?.code || pre).join(", ")} first.` : "No unmet prerequisites."}`,
                );
            }}
          />
        </Card>
      )}
      <Card className="gpa-table-card">
        <div className="card-heading">
          <div>
            <h3>GPA by course</h3>
            <p>
              Credit-weighted calculation using graded, passed courses only.
            </p>
          </div>
          <div className="gpa-total">
            <span>Current GPA</span>
            <strong>
              {gpa(state.courses).toFixed(2)}
              <small> / 4.00</small>
            </strong>
          </div>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Course</th>
                <th>Status</th>
                <th>Credits</th>
                <th>Grade (4.0)</th>
                <th>Prerequisites</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visibleCourses.map((course) => (
                <tr key={course.id}>
                  <td>
                    <strong>{course.code}</strong>
                    <span>{course.title}</span>
                    {course.markPercent !== undefined && (
                      <small>
                        {course.markPercent}%
                        {course.letterGrade ? ` · ${course.letterGrade}` : ""}
                      </small>
                    )}
                    {(course.attempts?.length || 0) > 1 && (
                      <small
                        title={course.attempts
                          ?.map(
                            (attempt) =>
                              `${attempt.semesterName}: ${attempt.markPercent ?? "—"}% ${attempt.letterGrade || ""} ${attempt.points !== undefined ? `(${attempt.points.toFixed(2)} pts)` : ""}`,
                          )
                          .join("\n")}
                      >
                        {course.attempts?.length} transcript attempts · history
                        retained
                      </small>
                    )}
                  </td>
                  <td>
                    <Badge tone={courseStatusTone(course.status)}>
                      {course.status === "in-progress"
                        ? "In progress"
                        : course.status}
                    </Badge>
                  </td>
                  <td>{course.credits}</td>
                  <td>
                    {course.status === "passed" ? (
                      <input
                        className="grade-input"
                        aria-label={`Grade for ${course.code}`}
                        type="number"
                        min="0"
                        max="4"
                        step="0.01"
                        value={course.grade ?? ""}
                        onChange={(event) =>
                          onGrade(
                            course.id,
                            event.target.value === ""
                              ? undefined
                              : Math.max(
                                  0,
                                  Math.min(4, Number(event.target.value)),
                                ),
                          )
                        }
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {course.prerequisites.length
                      ? course.prerequisites
                          .map(
                            (id) =>
                              state.courses.find((item) => item.id === id)
                                ?.code || id,
                          )
                          .join(", ")
                      : "None"}
                  </td>
                  <td>
                    {isLocked(course, state.courses) ? (
                      <span className="locked-cell">
                        <LockKeyhole size={14} /> Locked
                      </span>
                    ) : (
                      <select
                        className="status-select"
                        value={course.status}
                        aria-label={`Status for ${course.code}`}
                        onChange={(event) =>
                          onStatus(
                            course,
                            event.target.value as Course["status"],
                          )
                        }
                      >
                        <option value="planned">Planned</option>
                        <option value="in-progress">In progress</option>
                        <option value="passed">Passed</option>
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function CourseTile({
  course,
  allCourses,
  onStatus,
  onToast,
}: {
  course: Course;
  allCourses: Course[];
  onStatus: (course: Course, status: Course["status"]) => void;
  onToast: (message: string) => void;
}) {
  const locked = isLocked(course, allCourses);
  const prereqNames = course.prerequisites.map(
    (id) => allCourses.find((item) => item.id === id)?.code || id,
  );
  return (
    <div className={`course-tile ${locked ? "locked" : ""}`}>
      <div className="course-tile-top">
        <strong>{course.code}</strong>
        {locked ? (
          <LockKeyhole size={14} />
        ) : course.status === "passed" ? (
          <CheckCircle2 size={15} />
        ) : (
          <MoreHorizontal size={15} />
        )}
      </div>
      <div className="course-tile-title">{course.title}</div>
      <div className="course-tile-footer">
        <span>{course.credits} credits</span>
        <Badge tone={courseStatusTone(course.status)}>
          {course.status === "in-progress" ? "In progress" : course.status}
        </Badge>
      </div>
      {course.prerequisites.length > 0 && (
        <button
          className="prereq-hint"
          onClick={() =>
            onToast(
              locked
                ? `Locked until passed: ${prereqNames.join(", ")}`
                : `Prerequisites fulfilled: ${prereqNames.join(", ")}`,
            )
          }
        >
          <ArrowDownRight size={12} /> {prereqNames.join(" · ")}
        </button>
      )}
      <div className="tile-action-row">
        {locked ? (
          <span className="tile-lock-label">
            <LockKeyhole size={12} /> Locked
          </span>
        ) : (
          <select
            value={course.status}
            aria-label={`Update ${course.code}`}
            onChange={(event) =>
              onStatus(course, event.target.value as Course["status"])
            }
          >
            <option value="planned">Planned</option>
            <option value="in-progress">In progress</option>
            <option value="passed">Passed</option>
          </select>
        )}
        <span>
          {course.markPercent !== undefined
            ? `${course.markPercent}%${course.letterGrade ? ` · ${course.letterGrade}` : ""}`
            : course.grade !== undefined && course.status === "passed"
              ? `Points ${course.grade.toFixed(2)}`
              : `Year ${course.year}`}
        </span>
      </div>
    </div>
  );
}

interface CalendarItem {
  id: string;
  title: string;
  start: string;
  end: string;
  type: "class" | "event" | "task" | "block";
  sourceId?: string;
  status?: string;
  priority?: Task["priority"];
  allDay?: boolean;
}

function buildCalendarItems(
  state: PlannerState,
  start: Date,
  end: Date,
): CalendarItem[] {
  const min = start.getTime();
  const max = end.getTime();
  const items: CalendarItem[] = [];
  for (const event of state.calendarEvents) {
    const eventStart = new Date(event.start).getTime();
    if (eventStart >= min && eventStart < max)
      items.push({
        id: event.id,
        title: event.title,
        start: event.start,
        end: event.end,
        type: "event",
        sourceId: event.id,
        allDay: event.allDay,
      });
  }
  for (const task of state.tasks.filter(
    (item) => item.status !== "done" && !item.lmsManaged,
  )) {
    const due = new Date(task.dueDate);
    due.setHours(9, 0, 0, 0);
    if (due.getTime() >= min && due.getTime() < max)
      items.push({
        id: `due-${task.id}`,
        title: `Due: ${task.title}`,
        start: due.toISOString(),
        end: new Date(due.getTime() + 30 * 60_000).toISOString(),
        type: "task",
        sourceId: task.id,
        priority: task.priority,
        allDay: true,
      });
  }
  for (const block of state.studyBlocks.filter(
    (item) => item.status === "scheduled",
  )) {
    const blockStart = new Date(block.start).getTime();
    if (blockStart >= min && blockStart < max) {
      const task = state.tasks.find((item) => item.id === block.taskId);
      items.push({
        id: block.id,
        title: `Study: ${task?.title || "Assignment"}`,
        start: block.start,
        end: block.end,
        type: "block",
        sourceId: block.id,
        status: block.status,
      });
    }
  }
  for (
    const date = new Date(start);
    date.getTime() < max;
    date.setDate(date.getDate() + 1)
  ) {
    for (const meeting of state.classSchedule.filter(
      (item) => item.dayOfWeek === date.getDay(),
    )) {
      const [sh, sm] = meeting.startTime.split(":").map(Number);
      const [eh, em] = meeting.endTime.split(":").map(Number);
      const meetingStart = new Date(date);
      meetingStart.setHours(sh, sm, 0, 0);
      const meetingEnd = new Date(date);
      meetingEnd.setHours(eh, em, 0, 0);
      if (meetingStart.getTime() >= min && meetingStart.getTime() < max)
        items.push({
          id: `${meeting.id}-${date.toISOString().slice(0, 10)}`,
          title: meeting.title,
          start: meetingStart.toISOString(),
          end: meetingEnd.toISOString(),
          type: "class",
          sourceId: meeting.id,
        });
    }
  }
  return items.sort((a, b) => a.start.localeCompare(b.start));
}

function PlannerPage({
  state,
  tab,
  setTab,
  mode,
  setMode,
  date,
  setDate,
  previous,
  next,
  onAdd,
  onTaskStatus,
  onFocus,
  onBlockStatus,
  stressIds,
  onDeleteTask,
  onMoveItem,
}: {
  state: PlannerState;
  tab: "kanban" | "calendar";
  setTab: (tab: "kanban" | "calendar") => void;
  mode: CalendarMode;
  setMode: (mode: CalendarMode) => void;
  date: Date;
  setDate: (date: Date) => void;
  previous: () => void;
  next: () => void;
  onAdd: () => void;
  onTaskStatus: (taskId: string, status: TaskStatus) => void;
  onFocus: (taskId?: string) => void;
  onBlockStatus: (block: StudyBlock, status: StudyBlock["status"]) => void;
  stressIds: Set<string>;
  onDeleteTask: (taskId: string) => void;
  onMoveItem: (
    type: "task" | "block" | "event",
    sourceId: string,
    targetDate: Date,
  ) => void;
}) {
  const [filter, setFilter] = useState<"all" | "high" | "exam">("all");
  const tasks = state.tasks.filter(
    (task) =>
      filter === "all" ||
      (filter === "high" && task.priority === "high") ||
      (filter === "exam" && task.category === "exam"),
  );
  const start =
    mode === "day"
      ? new Date(date)
      : mode === "week"
        ? weekStart(date)
        : new Date(date.getFullYear(), date.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  if (mode === "month")
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const days = mode === "day" ? 1 : mode === "week" ? 7 : 42;
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  const calendarItems = buildCalendarItems(state, start, end);
  const highStressDates = new Set<string>();
  const highStressWeeks = new Set<string>();
  for (const task of state.tasks.filter((item) => stressIds.has(item.id))) {
    const due = new Date(task.dueDate);
    highStressDates.add(due.toDateString());
    highStressWeeks.add(weekStart(due).toDateString());
  }
  const dateLabel =
    mode === "day"
      ? formatDate(date, {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })
      : mode === "week"
        ? `${formatDate(start, { month: "short", day: "numeric" })} – ${formatDate(new Date(end.getTime() - 1), { month: "short", day: "numeric", year: "numeric" })}`
        : formatDate(date, { month: "long", year: "numeric" });
  const completedCount = state.tasks.filter(
    (task) => task.status === "done",
  ).length;
  const progress = state.tasks.length
    ? (completedCount / state.tasks.length) * 100
    : 0;
  return (
    <div className="page-stack">
      <SectionHeading
        title="Planner"
        subtitle="Tasks, classes, deadlines, and smart study blocks in one place."
        action={
          <Button onClick={onAdd}>
            <Plus size={16} /> Add assignment
          </Button>
        }
      />
      <div className="planner-summary-row">
        <div className="planner-mini-stat">
          <span className="summary-icon blue">
            <ListTodo size={17} />
          </span>
          <div>
            <strong>
              {state.tasks.filter((task) => task.status !== "done").length}
            </strong>
            <span>Open tasks</span>
          </div>
        </div>
        <div className="planner-mini-stat">
          <span className="summary-icon mint">
            <CheckCircle2 size={17} />
          </span>
          <div>
            <strong>{completedCount}</strong>
            <span>Completed</span>
          </div>
        </div>
        <div className="planner-progress">
          <div>
            <span>Overall task progress</span>
            <strong>{Math.round(progress)}%</strong>
          </div>
          <Progress value={progress} />
        </div>
        <div className="planner-mini-stat">
          <span className="summary-icon peach">
            <Flame size={17} />
          </span>
          <div>
            <strong>{stressIds.size}</strong>
            <span>High-stress deadlines</span>
          </div>
        </div>
      </div>
      <div className="planner-toolbar">
        <div className="segmented-tabs">
          <button
            className={tab === "calendar" ? "selected" : ""}
            onClick={() => setTab("calendar")}
          >
            <CalendarDays size={15} /> Calendar
          </button>
          <button
            className={tab === "kanban" ? "selected" : ""}
            onClick={() => setTab("kanban")}
          >
            <ListTodo size={15} /> Task board
          </button>
        </div>
        {tab === "kanban" ? (
          <label className="filter-select">
            <Filter size={15} />
            <select
              value={filter}
              onChange={(event) =>
                setFilter(event.target.value as typeof filter)
              }
            >
              <option value="all">All tasks</option>
              <option value="high">High priority</option>
              <option value="exam">Exams only</option>
            </select>
          </label>
        ) : (
          <div className="calendar-controls">
            <button
              className="today-button"
              onClick={() => setDate(new Date())}
            >
              Today
            </button>
            <button
              className="icon-button"
              aria-label="Previous period"
              onClick={previous}
            >
              <ChevronLeft size={17} />
            </button>
            <button
              className="icon-button"
              aria-label="Next period"
              onClick={next}
            >
              <ChevronRight size={17} />
            </button>
            <strong>{dateLabel}</strong>
            <div className="view-switcher">
              {(["day", "week", "month"] as CalendarMode[]).map((item) => (
                <button
                  key={item}
                  className={mode === item ? "active" : ""}
                  onClick={() => setMode(item)}
                >
                  {item[0].toUpperCase() + item.slice(1)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {tab === "kanban" ? (
        <div className="kanban-board">
          {[
            { status: "todo" as const, title: "To do" },
            { status: "in-progress" as const, title: "In progress" },
            { status: "done" as const, title: "Done" },
          ].map((column) => (
            <div
              key={column.status}
              className="kanban-column"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                const taskId = event.dataTransfer.getData("text/plain");
                if (taskId) onTaskStatus(taskId, column.status);
              }}
            >
              <div className="kanban-column-heading">
                <span className={`column-dot ${column.status}`} />
                <strong>{column.title}</strong>
                <span className="column-count">
                  {tasks.filter((task) => task.status === column.status).length}
                </span>
                {column.status === "todo" && (
                  <button onClick={onAdd} aria-label="Add task">
                    <Plus size={15} />
                  </button>
                )}
              </div>
              <div className="kanban-card-list">
                {tasks
                  .filter((task) => task.status === column.status)
                  .map((task) => (
                    <TaskBoardCard
                      key={task.id}
                      task={task}
                      course={state.courses.find(
                        (course) => course.id === task.courseId,
                      )}
                      stress={stressIds.has(task.id)}
                      onFocus={() => onFocus(task.id)}
                      onDelete={() => onDeleteTask(task.id)}
                    />
                  ))}
                {tasks.filter((task) => task.status === column.status)
                  .length === 0 && (
                  <div className="kanban-empty">Drop a task here</div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Card className="calendar-card">
          <div className="calendar-heading-row">
            <div className="calendar-legend">
              <span>
                <i className="cal-dot class" /> Class
              </span>
              <span>
                <i className="cal-dot study" /> Study block
              </span>
              <span>
                <i className="cal-dot due" /> Deadline
              </span>
              <span>
                <i className="cal-dot external" /> Calendar event
              </span>
            </div>
            <div className="conflict-flag">
              <AlertTriangle size={14} />{" "}
              {stressIds.size
                ? `${stressIds.size} deadlines within 48h pairs`
                : "No 48-hour deadline collisions"}
            </div>
          </div>
          {mode === "month" ? (
            <div className="month-calendar">
              <div className="month-weekdays">
                {WEEKDAYS.map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>
              <div className="month-grid">
                {Array.from({ length: 42 }, (_, index) => {
                  const current = new Date(start);
                  current.setDate(current.getDate() + index);
                  const key = current.toDateString();
                  const dayItems = calendarItems.filter(
                    (item) => new Date(item.start).toDateString() === key,
                  );
                  const outsideMonth = current.getMonth() !== date.getMonth();
                  return (
                    <button
                      key={key}
                      className={`month-cell ${outsideMonth ? "outside" : ""} ${current.toDateString() === new Date().toDateString() ? "today" : ""} ${highStressDates.has(key) ? "high-stress" : ""} ${highStressWeeks.has(weekStart(current).toDateString()) ? "high-stress-week" : ""}`}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        try {
                          const payload = JSON.parse(
                            event.dataTransfer.getData(
                              "application/x-campusos-item",
                            ),
                          ) as { type: "task" | "block" | "event"; id: string };
                          onMoveItem(payload.type, payload.id, current);
                        } catch {
                          /* ignore non-calendar drags */
                        }
                      }}
                      onClick={() => {
                        setDate(current);
                        setMode("day");
                      }}
                    >
                      <span className="month-day-num">{current.getDate()}</span>
                      {highStressDates.has(key) && (
                        <span
                          className="stress-mark"
                          title="High stress deadline cluster"
                        >
                          !
                        </span>
                      )}
                      {dayItems.slice(0, 3).map((item) => (
                        <span
                          className={`month-item ${item.type}`}
                          key={item.id}
                          draggable={
                            item.type === "task" ||
                            item.type === "block" ||
                            item.type === "event"
                          }
                          onDragStart={(event) => {
                            if (
                              item.sourceId &&
                              (item.type === "task" ||
                                item.type === "block" ||
                                item.type === "event")
                            )
                              event.dataTransfer.setData(
                                "application/x-campusos-item",
                                JSON.stringify({
                                  type: item.type,
                                  id: item.sourceId,
                                }),
                              );
                          }}
                        >
                          {item.title}
                        </span>
                      ))}
                      {dayItems.length > 3 && (
                        <span className="more-events">
                          +{dayItems.length - 3} more
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div
              className={`agenda-grid ${mode === "day" ? "single-day" : ""}`}
            >
              {Array.from({ length: days }, (_, index) => {
                const current = new Date(start);
                current.setDate(start.getDate() + index);
                const key = current.toDateString();
                const dayItems = calendarItems.filter(
                  (item) => new Date(item.start).toDateString() === key,
                );
                return (
                  <div
                    key={key}
                    className={`agenda-day ${highStressDates.has(key) ? "high-stress" : ""} ${highStressWeeks.has(weekStart(current).toDateString()) ? "high-stress-week" : ""}`}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      try {
                        const payload = JSON.parse(
                          event.dataTransfer.getData(
                            "application/x-campusos-item",
                          ),
                        ) as { type: "task" | "block" | "event"; id: string };
                        onMoveItem(payload.type, payload.id, current);
                      } catch {
                        /* ignore non-calendar drags */
                      }
                    }}
                  >
                    <div className="agenda-day-head">
                      <div className="agenda-day-date">
                        <span>{formatDate(current, { weekday: "short" })}</span>
                        <strong
                          className={
                            current.toDateString() === new Date().toDateString()
                              ? "today-num"
                              : ""
                          }
                        >
                          {current.getDate()}
                        </strong>
                      </div>
                      {highStressDates.has(key) && (
                        <Badge tone="red">
                          <AlertTriangle size={11} /> High stress
                        </Badge>
                      )}
                    </div>
                    <div className="agenda-items">
                      {dayItems.map((item) => (
                        <CalendarItemRow
                          key={item.id}
                          item={item}
                          state={state}
                          onBlockStatus={onBlockStatus}
                          onTaskStatus={onTaskStatus}
                          onFocus={onFocus}
                        />
                      ))}
                      {dayItems.length === 0 && (
                        <div className="agenda-empty">No events scheduled</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="calendar-bottom-note">
            <Sparkles size={15} />
            <span>
              Smart blocks are auto-scheduled around your classes and calendar
              events. Mark a missed block to redistribute its time before the
              deadline.
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}

function TaskBoardCard({
  task,
  course,
  stress,
  onFocus,
  onDelete,
}: {
  task: Task;
  course?: Course;
  stress: boolean;
  onFocus: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div
      className="task-board-card"
      draggable
      onDragStart={(event) => event.dataTransfer.setData("text/plain", task.id)}
    >
      <div className="task-card-top">
        <Badge tone={taskTone(task.priority)}>{task.priority}</Badge>
        <div className="task-menu-wrap">
          <button
            className="icon-button mini"
            aria-label="Task actions"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <MoreHorizontal size={15} />
          </button>
          {menuOpen && (
            <div className="task-menu">
              <button
                onClick={() => {
                  onFocus();
                  setMenuOpen(false);
                }}
              >
                <AlarmClock size={14} /> Focus this task
              </button>
              <button
                className="delete-action"
                onClick={() => {
                  onDelete();
                  setMenuOpen(false);
                }}
              >
                <Trash2 size={14} /> Delete task
              </button>
            </div>
          )}
        </div>
      </div>
      <h4>{task.title}</h4>
      {course && (
        <span className="task-course-tag">
          {course.code} · {course.title}
        </span>
      )}
      {task.description && (
        <p className="task-description">{task.description}</p>
      )}
      <div className="task-card-meta">
        <span className={daysUntil(task.dueDate) <= 2 ? "due-soon" : ""}>
          <CalendarDays size={13} />{" "}
          {daysUntil(task.dueDate) <= 0
            ? "Due today"
            : `Due ${formatDate(new Date(task.dueDate))}`}
        </span>
        <span>
          <Clock3 size={13} /> {formatDuration(task.estimatedMinutes)}
        </span>
      </div>
      {stress && (
        <div className="task-stress-note">
          <AlertTriangle size={12} /> Deadline cluster within 48h
        </div>
      )}
      <button className="task-focus-action" onClick={onFocus}>
        <AlarmClock size={14} /> Start deep work
      </button>
    </div>
  );
}

function CalendarItemRow({
  item,
  state,
  onBlockStatus,
  onTaskStatus,
  onFocus,
}: {
  item: CalendarItem;
  state: PlannerState;
  onBlockStatus: (block: StudyBlock, status: StudyBlock["status"]) => void;
  onTaskStatus: (taskId: string, status: TaskStatus) => void;
  onFocus: (taskId?: string) => void;
}) {
  const block =
    item.type === "block"
      ? state.studyBlocks.find((candidate) => candidate.id === item.sourceId)
      : undefined;
  const dueTask =
    item.type === "task"
      ? state.tasks.find((task) => task.id === item.sourceId)
      : undefined;
  const linkedEvent =
    item.type === "event"
      ? state.calendarEvents.find((event) => event.id === item.sourceId)
      : undefined;
  const actionTaskId = block?.taskId || dueTask?.id;
  return (
    <div
      className={`calendar-item-row ${item.type}`}
      draggable={Boolean(
        block || dueTask || (linkedEvent && !linkedEvent.lmsManaged),
      )}
      onDragStart={(event) => {
        if (block)
          event.dataTransfer.setData(
            "application/x-campusos-item",
            JSON.stringify({ type: "block", id: block.id }),
          );
        else if (dueTask)
          event.dataTransfer.setData(
            "application/x-campusos-item",
            JSON.stringify({ type: "task", id: dueTask.id }),
          );
        else if (linkedEvent && !linkedEvent.lmsManaged)
          event.dataTransfer.setData(
            "application/x-campusos-item",
            JSON.stringify({ type: "event", id: linkedEvent.id }),
          );
      }}
    >
      <div className="cal-item-time">
        {item.allDay
          ? "Due date"
          : `${formatTime(item.start)}${item.type === "class" || item.type === "event" ? ` – ${formatTime(item.end)}` : ""}`}
      </div>
      <div className="cal-item-body">
        <strong>{item.title}</strong>
        {item.type === "class" && <span>Recurring class</span>}
        {item.type === "event" && (
          <span>
            {linkedEvent?.type === "exam"
              ? "Exam · imported from your LMS"
              : "Calendar event"}
          </span>
        )}
        {item.type === "block" && <span>Auto-planned study session</span>}
      </div>
      {block && (
        <div className="cal-item-actions">
          <button
            title="Mark complete"
            onClick={() => onBlockStatus(block, "completed")}
          >
            <Check size={13} />
          </button>
          <button
            title="Mark missed and reschedule"
            onClick={() => onBlockStatus(block, "missed")}
          >
            <RefreshCw size={13} />
          </button>
        </div>
      )}
      {dueTask && (
        <button className="cal-open-task" onClick={() => onFocus(dueTask.id)}>
          Focus <ArrowRight size={12} />
        </button>
      )}
      {actionTaskId && item.type === "task" && dueTask && (
        <button
          className="cal-complete-task"
          title="Mark task complete"
          onClick={() => onTaskStatus(dueTask.id, "done")}
        >
          <Check size={13} />
        </button>
      )}
    </div>
  );
}

function FocusPage({
  state,
  focusTask,
  focusTaskId,
  setFocusTaskId,
  seconds,
  running,
  setRunning,
  setSeconds,
  setState,
  timerKind: globalTimerKind,
  setTimerKind: setGlobalTimerKind,
  focusBlocks,
  onBlockStatus,
  onTaskStatus,
}: {
  state: PlannerState;
  focusTask?: Task;
  focusTaskId: string;
  setFocusTaskId: (id: string) => void;
  seconds: number;
  running: boolean;
  setRunning: (running: boolean) => void;
  setSeconds: (seconds: number) => void;
  setState: Dispatch<SetStateAction<PlannerState>>;
  timerKind: "focus" | "short" | "long";
  setTimerKind: (mode: "focus" | "short" | "long") => void;
  focusBlocks: StudyBlock[];
  onBlockStatus: (block: StudyBlock, status: StudyBlock["status"]) => void;
  onTaskStatus: (taskId: string, status: TaskStatus) => void;
}) {
  const timerMode = globalTimerKind;
  const setTimerMode = setGlobalTimerKind;
  const activeTaskId = focusTaskId || focusTask?.id || "";
  const activeTask =
    state.tasks.find((task) => task.id === activeTaskId) || focusTask;
  const durationByMode = { focus: 25 * 60, short: 5 * 60, long: 15 * 60 };
  const handleMode = (mode: typeof timerMode) => {
    setTimerMode(mode);
    setRunning(false);
    setSeconds(durationByMode[mode]);
  };
  const timerLabel = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const progress = 1 - seconds / durationByMode[timerMode];
  const sessions = state.studySessions
    .filter((session) => session.taskId === activeTaskId)
    .sort((a, b) => b.start.localeCompare(a.start));
  const plannedMinutes = focusBlocks
    .filter((block) => block.status === "scheduled")
    .reduce((sum, block) => sum + block.minutes, 0);
  const trackedMinutes = sessions.reduce(
    (sum, session) => sum + session.durationMinutes,
    0,
  );
  const taskRemaining = activeTask
    ? Math.max(0, activeTask.estimatedMinutes - trackedMinutes)
    : 0;
  const addManualSession = (minutes: number) => {
    if (!activeTask) return;
    const end = new Date();
    const start = new Date(end.getTime() - minutes * 60_000);
    const session: StudySession = {
      id: makeId("session"),
      taskId: activeTask.id,
      start: start.toISOString(),
      end: end.toISOString(),
      durationMinutes: minutes,
      kind: "manual",
    };
    setState((previous) => ({
      ...previous,
      studySessions: [...previous.studySessions, session],
      tasks: previous.tasks.map((task) =>
        task.id === activeTask.id && task.status === "todo"
          ? { ...task, status: "in-progress" }
          : task,
      ),
    }));
  };
  return (
    <div className="page-stack">
      <SectionHeading
        title="Deep work hub"
        subtitle="One task, one timer, and a clear record of focused time."
        action={
          <Badge tone="green">
            <span className="live-dot" /> Local focus log
          </Badge>
        }
      />
      <div className="focus-layout">
        <div className="focus-main-column">
          <Card className="focus-task-card">
            <div className="focus-card-top">
              <div className="section-kicker">
                <Target size={15} /> CURRENT FOCUS
              </div>
              {activeTask && (
                <Badge tone={taskTone(activeTask.priority)}>
                  {activeTask.priority} priority
                </Badge>
              )}
            </div>
            {activeTask ? (
              <>
                <label className="focus-task-picker">
                  Working on
                  <select
                    value={activeTask.id}
                    onChange={(event) => setFocusTaskId(event.target.value)}
                  >
                    {state.tasks
                      .filter((task) => task.status !== "done")
                      .map((task) => (
                        <option value={task.id} key={task.id}>
                          {task.title}
                        </option>
                      ))}
                  </select>
                  <ChevronDown size={15} />
                </label>
                <h2>{activeTask.title}</h2>
                <p className="focus-task-course">
                  {activeTask.courseId
                    ? state.courses.find(
                        (course) => course.id === activeTask.courseId,
                      )?.code
                    : "Independent task"}{" "}
                  <span>·</span> Due{" "}
                  {formatDate(new Date(activeTask.dueDate), {
                    month: "short",
                    day: "numeric",
                  })}
                </p>
                {activeTask.description && (
                  <p className="focus-description">{activeTask.description}</p>
                )}
                <div className="focus-task-progress">
                  <div>
                    <span>Estimated work remaining</span>
                    <strong>{formatDuration(taskRemaining)}</strong>
                  </div>
                  <Progress
                    value={
                      activeTask.estimatedMinutes
                        ? (trackedMinutes / activeTask.estimatedMinutes) * 100
                        : 0
                    }
                  />
                  <div className="focus-progress-foot">
                    <span>{formatDuration(trackedMinutes)} logged</span>
                    <span>
                      {formatDuration(activeTask.estimatedMinutes)} estimated
                    </span>
                  </div>
                </div>
                <div className="focus-quick-actions">
                  <Button
                    variant="secondary"
                    onClick={() => addManualSession(30)}
                  >
                    <Plus size={15} /> Log 30 min
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => onTaskStatus(activeTask.id, "done")}
                  >
                    <CheckCircle2 size={15} /> Mark complete
                  </Button>
                </div>
              </>
            ) : (
              <EmptyState
                icon={<CheckCircle2 />}
                title="No tasks to focus on"
                description="Create an assignment to get started."
              />
            )}
          </Card>
          <Card className="session-history-card">
            <div className="card-heading">
              <div>
                <h3>Recent focus sessions</h3>
                <p>Time logged against this assignment</p>
              </div>
              <Badge>{sessions.length} sessions</Badge>
            </div>
            {sessions.length ? (
              <div className="session-history-list">
                {sessions.slice(0, 6).map((session) => (
                  <div className="session-row" key={session.id}>
                    <div className={`session-kind-icon ${session.kind}`}>
                      <Clock3 size={15} />
                    </div>
                    <div>
                      <strong>
                        {session.kind === "pomodoro"
                          ? "Pomodoro session"
                          : session.kind === "block"
                            ? "Planned study block"
                            : "Manual time log"}
                      </strong>
                      <span>
                        {formatDate(new Date(session.start), {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}{" "}
                        · {formatTime(session.start)}
                      </span>
                    </div>
                    <strong className="session-duration">
                      {formatDuration(session.durationMinutes)}
                    </strong>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<TimerReset />}
                title="Your focus log starts here"
                description="Complete a Pomodoro or add a manual session to track time spent."
              />
            )}
          </Card>
        </div>
        <div className="focus-side-column">
          <Card className="pomodoro-card">
            <div className="pomodoro-header">
              <div>
                <div className="section-kicker">
                  <AlarmClock size={15} /> POMODORO TIMER
                </div>
                <p>Protect your attention. Take breaks.</p>
              </div>
              <button
                className="icon-button"
                aria-label="Reset timer"
                onClick={() => {
                  setRunning(false);
                  setSeconds(durationByMode[timerMode]);
                }}
              >
                <TimerReset size={16} />
              </button>
            </div>
            <div className="timer-mode-tabs">
              {(["focus", "short", "long"] as const).map((mode) => (
                <button
                  key={mode}
                  className={timerMode === mode ? "active" : ""}
                  onClick={() => handleMode(mode)}
                >
                  {mode === "focus"
                    ? "Focus"
                    : mode === "short"
                      ? "Short break"
                      : "Long break"}
                </button>
              ))}
            </div>
            <div
              className="timer-dial"
              style={
                { "--timer-progress": `${progress * 100}%` } as CSSProperties
              }
            >
              <div className="timer-dial-inner">
                <span className="timer-status">
                  {running
                    ? "FOCUSING"
                    : seconds === durationByMode[timerMode]
                      ? "READY WHEN YOU ARE"
                      : "PAUSED"}
                </span>
                <strong>{timerLabel}</strong>
                <span className="timer-task-label">
                  {timerMode === "focus"
                    ? activeTask?.title || "Select a task"
                    : timerMode === "short"
                      ? "Take a breather"
                      : "Reset your mind"}
                </span>
              </div>
            </div>
            <Button
              className="timer-primary"

              onClick={() => {
                if (seconds === 0) setSeconds(durationByMode[timerMode]);
                setRunning(!running);
              }}
            >
              <span>
                {running
                  ? "Pause timer"
                  : seconds === 0
                    ? "Start again"
                    : "Start timer"}
              </span>
              {running ? <TimerReset size={17} /> : <ArrowRight size={17} />}
            </Button>
            <div className="timer-session-count">
              <span>
                <CheckCircle2 size={14} />{" "}
                {
                  sessions.filter((session) => session.kind === "pomodoro")
                    .length
                }{" "}
                pomodoros logged
              </span>
              <span>Goal: 4 per day</span>
            </div>
          </Card>
          <Card className="focus-blocks-card">
            <div className="card-heading">
              <div>
                <h3>Scheduled study blocks</h3>
                <p>Planned for this task</p>
              </div>
              <Badge tone="blue">{formatDuration(plannedMinutes)}</Badge>
            </div>
            {focusBlocks
              .filter(
                (block) =>
                  block.status === "scheduled" || block.status === "missed",
              )
              .sort((a, b) => a.start.localeCompare(b.start))
              .slice(0, 5)
              .map((block) => (
                <div
                  className={`focus-block-row ${block.status}`}
                  key={block.id}
                >
                  <div className="focus-block-date">
                    <strong>
                      {formatDate(new Date(block.start), { day: "2-digit" })}
                    </strong>
                    <span>
                      {formatDate(new Date(block.start), { month: "short" })}
                    </span>
                  </div>
                  <div className="focus-block-info">
                    <strong>
                      {formatTime(block.start)} – {formatTime(block.end)}
                    </strong>
                    <span>
                      {block.status === "missed"
                        ? "Missed · rescheduled"
                        : `${block.minutes} minutes reserved`}
                    </span>
                  </div>
                  {block.status === "scheduled" && (
                    <button
                      className="block-check"
                      title="Mark block complete"
                      onClick={() => onBlockStatus(block, "completed")}
                    >
                      <Check size={14} />
                    </button>
                  )}
                </div>
              ))}
            {focusBlocks.filter(
              (block) =>
                block.status === "scheduled" || block.status === "missed",
            ).length === 0 && (
              <p className="empty-line">
                No blocks reserved. Add effort to a task to generate them.
              </p>
            )}
            <div className="smart-replan-note">
              <WandSparkles size={15} />
              <p>
                Miss a block? Mark it missed in the calendar. CampusOS
                redistributes the remaining time across available days before
                the deadline.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SettingsPage({
  state,
  setState,
  passphrase,
  setPassphrase,
  importPassphrase,
  setImportPassphrase,
  importFileRef,
  onExport,
  onImport,
  onImportLms,
  onSync,
  busy,
  meetingForm,
  setMeetingForm,
  onAddMeeting,
  onDisconnect,
}: {
  state: PlannerState;
  setState: Dispatch<SetStateAction<PlannerState>>;
  passphrase: string;
  setPassphrase: (value: string) => void;
  importPassphrase: string;
  setImportPassphrase: (value: string) => void;
  importFileRef: RefObject<HTMLInputElement>;
  onExport: () => void;
  onImport: (file?: File) => void;
  onImportLms: (files: File[]) => void;
  onSync: () => void;
  busy: boolean;
  meetingForm: {
    title: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    location: string;
  };
  setMeetingForm: (form: typeof meetingForm) => void;
  onAddMeeting: (event: FormEvent) => void;
  onDisconnect: () => void;
}) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const lmsImportFileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="page-stack">
      <SectionHeading
        title="Settings & privacy"
        subtitle="Your planner data stays on this device unless you explicitly choose to sync."
      />
      <div className="settings-grid">
        <div className="settings-main-column">
          <Card className="settings-card">
            <div className="settings-card-heading">
              <div className="settings-card-icon lavender">
                <ShieldCheck size={19} />
              </div>
              <div>
                <h3>Privacy & local storage</h3>
                <p>
                  Data is stored in this browser using IndexedDB. No account is
                  required.
                </p>
              </div>
              <Badge tone="green">Local-first</Badge>
            </div>
            <div className="privacy-detail-grid">
              <div>
                <LockKeyhole size={16} />
                <div>
                  <strong>On-device by default</strong>
                  <span>
                    Courses, assignments, schedules, and session logs remain
                    local.
                  </span>
                </div>
              </div>
              <div>
                <FileLock2 size={16} />
                <div>
                  <strong>Encrypted backups</strong>
                  <span>
                    Exports use AES-256-GCM with a passphrase-derived key.
                  </span>
                </div>
              </div>
              <div>
                <Cloud size={16} />
                <div>
                  <strong>Optional cloud sync</strong>
                  <span>
                    Google Calendar only runs after you initiate OAuth consent.
                  </span>
                </div>
              </div>
            </div>
          </Card>
          <Card className="settings-card">
            <div className="settings-card-heading">
              <div className="settings-card-icon blue">
                <GraduationCap size={19} />
              </div>
              <div>
                <h3>Import university LMS exports</h3>
                <p>
                  Bring your transcript, current registration, exams, and weekly
                  timetable into CampusOS.
                </p>
              </div>
              <Badge tone={state.lmsSummary ? "green" : "neutral"}>
                {state.lmsSummary ? "Imported" : "Local import"}
              </Badge>
            </div>
            <div className="backup-section">
              <div className="backup-step">
                <span className="step-number">1</span>
                <div>
                  <strong>Select all five JSON exports together</strong>
                  <p>
                    Choose transcript-semesters.json, status.json,
                    transcript-current-semester.json, exam-table.json, and
                    lectures-table.json. Parsing happens in your browser; the
                    LMS student number is ignored. Exam dates use DD/MM/YYYY.
                    The lecture export omits AM/PM, so 01:00–04:20 slots are
                    interpreted as afternoon times; verify them after import.
                  </p>
                  <div className="backup-form-row">
                    <Button
                      onClick={() => lmsImportFileRef.current?.click()}
                      disabled={busy}
                    >
                      <Upload size={15} />{" "}
                      {busy ? "Importing…" : "Choose LMS JSON files"}
                    </Button>
                    <input
                      ref={lmsImportFileRef}
                      type="file"
                      accept="application/json,.json"
                      multiple
                      hidden
                      onChange={(event) => {
                        const files = Array.from(event.target.files || []);
                        if (files.length) onImportLms(files);
                        event.currentTarget.value = "";
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="backup-warning">
              <CircleHelp size={15} />
              <span>
                Replaces earlier LMS-managed records and the built-in demo
                courses/timetable. Your personal tasks, focus logs, theme, and
                other non-LMS items are kept. Course prerequisites are not
                included in these exports, so none are inferred.
              </span>
            </div>
            {state.lmsSummary && (
              <div className="lms-import-summary">
                <strong>
                  {state.lmsSummary.degreeName || "University degree"}
                </strong>
                <span>
                  {state.lmsSummary.coursesImported} courses ·{" "}
                  {state.lmsSummary.courseAttemptsPreserved} transcript attempts
                  · {state.lmsSummary.examsImported} dated exams ·{" "}
                  {state.lmsSummary.classMeetingsImported} recurring meetings
                </span>
                <span>
                  Official cumulative GPA:{" "}
                  {state.lmsSummary.officialGpaPoints?.toFixed(2) ?? "—"} / 4.00
                  {state.lmsSummary.officialGpaPercent !== undefined
                    ? ` · ${state.lmsSummary.officialGpaPercent.toFixed(2)}%`
                    : ""}{" "}
                  · Passed credits: {state.lmsSummary.totalPassedCredits ?? "—"}
                </span>
                <span>
                  Current semester:{" "}
                  {state.lmsSummary.currentSemesterName || "—"} ·{" "}
                  {state.lmsSummary.currentRegisteredCredits ?? "—"} registered
                  credits
                </span>
              </div>
            )}
          </Card>
          <Card className="settings-card">
            <div className="settings-card-heading">
              <div className="settings-card-icon mint">
                <FileLock2 size={19} />
              </div>
              <div>
                <h3>Encrypted import / export</h3>
                <p>
                  Move your entire planner state with one encrypted JSON file.
                </p>
              </div>
            </div>
            <div className="backup-section">
              <div className="backup-step">
                <span className="step-number">1</span>
                <div>
                  <strong>Export an encrypted backup</strong>
                  <p>
                    Choose a strong passphrase. You’ll need it to restore the
                    file later.
                  </p>
                  <div className="backup-form-row">
                    <input
                      type="password"
                      minLength={10}
                      value={passphrase}
                      onChange={(event) => setPassphrase(event.target.value)}
                      placeholder="Passphrase (10+ characters)"
                    />
                    <Button
                      onClick={onExport}
                      disabled={busy || passphrase.length < 10}
                    >
                      <Download size={15} /> Export JSON
                    </Button>
                  </div>
                </div>
              </div>
              <div className="backup-separator" />
              <div className="backup-step">
                <span className="step-number">2</span>
                <div>
                  <strong>Import an encrypted backup</strong>
                  <p>
                    Restoring replaces the planner state currently in this
                    browser.
                  </p>
                  <div className="backup-form-row">
                    <input
                      type="password"
                      value={importPassphrase}
                      onChange={(event) =>
                        setImportPassphrase(event.target.value)
                      }
                      placeholder="Backup passphrase"
                    />
                    <Button
                      variant="secondary"
                      onClick={() => importFileRef.current?.click()}
                      disabled={busy || importPassphrase.length < 1}
                    >
                      <Upload size={15} /> Choose file
                    </Button>
                    <input
                      ref={importFileRef}
                      type="file"
                      accept="application/json,.json"
                      hidden
                      onChange={(event) => onImport(event.target.files?.[0])}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="backup-warning">
              <CircleHelp size={15} />
              <span>
                Your passphrase is never stored. If you lose it, an encrypted
                backup cannot be recovered.
              </span>
            </div>
          </Card>
          <Card className="settings-card">
            <div className="settings-card-heading">
              <div className="settings-card-icon blue">
                <CalendarDays size={19} />
              </div>
              <div>
                <h3>Google Calendar sync</h3>
                <p>
                  Import existing events and publish tasks and study blocks to
                  your primary calendar.
                </p>
              </div>
              <Badge
                tone={
                  state.settings.googleCalendarConnected ? "green" : "neutral"
                }
              >
                {state.settings.googleCalendarConnected
                  ? "Connected"
                  : "Optional"}
              </Badge>
            </div>
            <div className="google-sync-panel">
              <div className="google-sync-copy">
                <div className="google-calendar-logo">31</div>
                <div>
                  <strong>
                    {state.settings.googleCalendarConnected
                      ? "Calendar connected for this session"
                      : "Connect Google Calendar"}
                  </strong>
                  <span>
                    {state.settings.googleLastSyncedAt
                      ? `Last synced ${formatDate(new Date(state.settings.googleLastSyncedAt), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                      : "Client-side OAuth · No server required"}
                  </span>
                </div>
              </div>
              <div className="google-sync-actions">
                <Button onClick={onSync} disabled={busy}>
                  <RefreshCw size={15} className={busy ? "spin" : ""} />{" "}
                  {busy ? "Syncing…" : "Connect & sync"}
                </Button>
                {state.settings.googleCalendarConnected && (
                  <Button variant="secondary" onClick={onDisconnect}>
                    Disconnect
                  </Button>
                )}
              </div>
            </div>
            <div className="integration-footnote">
              <LockKeyhole size={13} /> Requires a Google OAuth Web Client ID
              and the Google Calendar API enabled in Google Cloud Console. Set{" "}
              <code>VITE_GOOGLE_CLIENT_ID</code> in <code>.env.local</code>{" "}
              before running locally.
            </div>
          </Card>
          <Card className="settings-card">
            <div className="settings-card-heading">
              <div className="settings-card-icon peach">
                <Clock3 size={19} />
              </div>
              <div>
                <h3>Class schedule & available hours</h3>
                <p>
                  Recurring classes are treated as busy time by the smart
                  scheduler.
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCalendarOpen(!calendarOpen)}
              >
                <Plus size={14} /> {calendarOpen ? "Close" : "Add class"}
              </Button>
            </div>
            {calendarOpen && (
              <form className="class-meeting-form" onSubmit={onAddMeeting}>
                <label>
                  Class title
                  <input
                    required
                    value={meetingForm.title}
                    onChange={(event) =>
                      setMeetingForm({
                        ...meetingForm,
                        title: event.target.value,
                      })
                    }
                    placeholder="Lecture or seminar"
                  />
                </label>
                <div className="form-grid">
                  <label>
                    Day
                    <select
                      value={meetingForm.dayOfWeek}
                      onChange={(event) =>
                        setMeetingForm({
                          ...meetingForm,
                          dayOfWeek: Number(event.target.value),
                        })
                      }
                    >
                      {DAYS.map((day, index) => (
                        <option key={day} value={index}>
                          {day}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Location
                    <input
                      value={meetingForm.location}
                      onChange={(event) =>
                        setMeetingForm({
                          ...meetingForm,
                          location: event.target.value,
                        })
                      }
                      placeholder="Room (optional)"
                    />
                  </label>
                </div>
                <div className="form-grid">
                  <label>
                    Start
                    <input
                      type="time"
                      value={meetingForm.startTime}
                      onChange={(event) =>
                        setMeetingForm({
                          ...meetingForm,
                          startTime: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    End
                    <input
                      type="time"
                      value={meetingForm.endTime}
                      onChange={(event) =>
                        setMeetingForm({
                          ...meetingForm,
                          endTime: event.target.value,
                        })
                      }
                    />
                  </label>
                </div>
                <Button type="submit">
                  <Plus size={14} /> Save recurring class
                </Button>
              </form>
            )}
            <div className="class-schedule-list">
              {state.classSchedule.map((meeting) => (
                <div className="class-schedule-row" key={meeting.id}>
                  <div className="class-day-chip">
                    {DAYS[meeting.dayOfWeek]}
                  </div>
                  <div className="class-schedule-copy">
                    <strong>{meeting.title}</strong>
                    <span>
                      {meeting.startTime}–{meeting.endTime}
                      {meeting.location ? ` · ${meeting.location}` : ""}
                      {meeting.instructor ? ` · ${meeting.instructor}` : ""}
                    </span>
                  </div>
                  <button
                    className="icon-button mini"
                    title="Remove class"
                    onClick={() =>
                      setState((previous) => ({
                        ...previous,
                        classSchedule: previous.classSchedule.filter(
                          (item) => item.id !== meeting.id,
                        ),
                      }))
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {state.classSchedule.length === 0 && (
                <p className="empty-line">
                  No recurring classes. Add them to improve smart scheduling.
                </p>
              )}
            </div>
          </Card>
        </div>
        <div className="settings-side-column">
          <Card className="settings-card appearance-card">
            <div className="settings-card-heading">
              <div className="settings-card-icon lavender">
                <Sun size={18} />
              </div>
              <div>
                <h3>Appearance</h3>
                <p>Choose your workspace theme.</p>
              </div>
            </div>
            <div className="theme-options">
              {[
                {
                  value: "light" as const,
                  title: "Light",
                  icon: <Sun size={17} />,
                },
                {
                  value: "dark" as const,
                  title: "Dark",
                  icon: <Moon size={17} />,
                },
                {
                  value: "system" as const,
                  title: "System",
                  icon: <Settings2 size={17} />,
                },
              ].map((theme) => (
                <button
                  key={theme.value}
                  className={`theme-option ${state.settings.theme === theme.value ? "selected" : ""}`}
                  onClick={() =>
                    setState((previous) => ({
                      ...previous,
                      settings: { ...previous.settings, theme: theme.value },
                    }))
                  }
                >
                  {theme.icon}
                  <span>{theme.title}</span>
                  {state.settings.theme === theme.value && <Check size={14} />}
                </button>
              ))}
            </div>
          </Card>
          <Card className="settings-card scheduler-settings">
            <div className="settings-card-heading">
              <div className="settings-card-icon mint">
                <WandSparkles size={18} />
              </div>
              <div>
                <h3>Smart scheduling</h3>
                <p>Personalize when study blocks can be placed.</p>
              </div>
            </div>
            <div className="settings-field">
              <label>Study day starts</label>
              <input
                type="time"
                value={state.settings.dayStart}
                onChange={(event) =>
                  setState((previous) => ({
                    ...previous,
                    settings: {
                      ...previous.settings,
                      dayStart: event.target.value,
                    },
                  }))
                }
              />
            </div>
            <div className="settings-field">
              <label>Study day ends</label>
              <input
                type="time"
                value={state.settings.dayEnd}
                onChange={(event) =>
                  setState((previous) => ({
                    ...previous,
                    settings: {
                      ...previous.settings,
                      dayEnd: event.target.value,
                    },
                  }))
                }
              />
            </div>
            <div className="settings-field">
              <label>Preferred block length</label>
              <select
                value={state.settings.preferredBlockMinutes}
                onChange={(event) =>
                  setState((previous) => ({
                    ...previous,
                    settings: {
                      ...previous.settings,
                      preferredBlockMinutes: Number(event.target.value),
                    },
                  }))
                }
              >
                <option value={90}>90 minutes</option>
                <option value={120}>2 hours</option>
              </select>
            </div>
            <div className="settings-field">
              <label>Maximum study time per day</label>
              <select
                value={state.settings.maxStudyMinutesPerDay}
                onChange={(event) =>
                  setState((previous) => ({
                    ...previous,
                    settings: {
                      ...previous.settings,
                      maxStudyMinutesPerDay: Number(event.target.value),
                    },
                  }))
                }
              >
                <option value={120}>2 hours</option>
                <option value={180}>3 hours</option>
                <option value={240}>4 hours</option>
                <option value={360}>6 hours</option>
              </select>
            </div>
            <div className="settings-tip">
              <Sparkles size={15} />
              <p>
                Changes apply to new tasks and when missed blocks are
                rescheduled. Existing blocks are not automatically removed.
              </p>
            </div>
          </Card>
          <Card className="settings-card about-card">
            <div className="about-logo">
              <GraduationCap size={21} />
            </div>
            <h3>CampusOS</h3>
            <p>Academic lifecycle, in one calm workspace.</p>
            <div className="about-facts">
              <span>
                Version <strong>0.1.0</strong>
              </span>
              <span>
                Storage <strong>IndexedDB</strong>
              </span>
              <span>
                Encryption <strong>AES-256-GCM</strong>
              </span>
              <span>
                Mode <strong>Local-first</strong>
              </span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default App;
