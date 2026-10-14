import type { ClassMeeting, PlannerState, StudyBlock, Task } from '../types';

const MINUTE = 60_000;
const BLOCK_STEP_MINUTES = 30;

export const makeId = (prefix = 'id') => `${prefix}-${crypto.randomUUID()}`;

function atLocalTime(date: Date, time: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const value = new Date(date);
  value.setHours(hours, minutes, 0, 0);
  return value;
}

function overlaps(start: number, end: number, otherStart: number, otherEnd: number): boolean {
  return start < otherEnd && end > otherStart;
}

function classIntervalOnDate(meeting: ClassMeeting, date: Date): { start: number; end: number } | null {
  if (meeting.dayOfWeek !== date.getDay()) return null;
  return {
    start: atLocalTime(date, meeting.startTime).getTime(),
    end: atLocalTime(date, meeting.endTime).getTime(),
  };
}

function effectiveTrackedMinutes(state: PlannerState, taskId: string): number {
  const sessionMinutes = state.studySessions.filter((session) => session.taskId === taskId)
    .reduce((total, session) => total + session.durationMinutes, 0);
  const completedBlockMinutes = state.studyBlocks.filter((block) => block.taskId === taskId && block.status === 'completed')
    .reduce((total, block) => total + block.minutes, 0);
  return Math.max(sessionMinutes, completedBlockMinutes);
}

function getBusyIntervals(state: PlannerState, date: Date, excludeTaskId: string): Array<{ start: number; end: number }> {
  const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date); dayEnd.setHours(23, 59, 59, 999);
  const startBound = dayStart.getTime();
  const endBound = dayEnd.getTime();
  const busy: Array<{ start: number; end: number }> = [];

  for (const meeting of state.classSchedule) {
    const interval = classIntervalOnDate(meeting, date);
    if (interval) busy.push(interval);
  }
  for (const event of state.calendarEvents) {
    const start = new Date(event.start).getTime();
    const end = new Date(event.end).getTime();
    if (start < endBound && end > startBound) busy.push({ start, end });
  }
  for (const block of state.studyBlocks) {
    if (block.taskId === excludeTaskId || block.status === 'missed') continue;
    const start = new Date(block.start).getTime();
    const end = new Date(block.end).getTime();
    if (start < endBound && end > startBound) busy.push({ start, end });
  }
  return busy.sort((a, b) => a.start - b.start);
}

export function generateStudyBlocks(state: PlannerState, task: Task, now = new Date()): StudyBlock[] {
  const existingForTask = state.studyBlocks.filter((block) => block.taskId === task.id);
  const completed = existingForTask.filter((block) => block.status === 'completed');
  const retained = state.studyBlocks.filter((block) => block.taskId !== task.id);
  const tracked = effectiveTrackedMinutes({ ...state, studyBlocks: completed }, task.id);
  let remaining = Math.max(0, task.estimatedMinutes - tracked);
  if (task.status === 'done' || remaining <= 0) return [];

  const due = new Date(task.dueDate);
  due.setHours(23, 59, 0, 0);
  if (due.getTime() <= now.getTime()) return [];

  const blockTarget = Math.max(90, Math.min(120, state.settings.preferredBlockMinutes || 90));
  const endOfWindow = Math.min(due.getTime(), now.getTime() + 7 * 24 * 60 * MINUTE);
  const days: Date[] = [];
  const cursor = new Date(now); cursor.setHours(0, 0, 0, 0);
  while (cursor.getTime() <= endOfWindow) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  const minutesAlreadyByDay = new Map<string, number>();
  for (const block of retained) {
    if (block.status !== 'scheduled') continue;
    const key = new Date(block.start).toDateString();
    minutesAlreadyByDay.set(key, (minutesAlreadyByDay.get(key) || 0) + block.minutes);
  }

  const candidates: Array<{ start: number; end: number; dayKey: string }> = [];
  for (const day of days) {
    const key = day.toDateString();
    const windowStart = atLocalTime(day, state.settings.dayStart || '08:00').getTime();
    const windowEnd = atLocalTime(day, state.settings.dayEnd || '20:00').getTime();
    const busy = getBusyIntervals({ ...state, studyBlocks: retained }, day, task.id);
    const dailyLimit = Math.max(blockTarget, state.settings.maxStudyMinutesPerDay || 240);
    if ((minutesAlreadyByDay.get(key) || 0) >= dailyLimit) continue;

    for (let slotStart = windowStart; slotStart + Math.min(blockTarget, remaining) * MINUTE <= windowEnd; slotStart += BLOCK_STEP_MINUTES * MINUTE) {
      if (slotStart < now.getTime() + 10 * MINUTE) continue;
      if (slotStart + blockTarget * MINUTE > endOfWindow + 1) continue;
      if (busy.some((interval) => overlaps(slotStart, slotStart + blockTarget * MINUTE, interval.start, interval.end))) continue;
      const scheduledThatDay = (minutesAlreadyByDay.get(key) || 0) + candidates.filter((item) => item.dayKey === key).length * blockTarget;
      if (scheduledThatDay >= dailyLimit) break;
      candidates.push({ start: slotStart, end: slotStart + blockTarget * MINUTE, dayKey: key });
      // Keep at most two possible starts per day; later choose the least-loaded day.
      if (candidates.filter((item) => item.dayKey === key).length >= 2) break;
    }
  }

  const created: StudyBlock[] = [];
  // Spread blocks across days by repeatedly picking the available day with the least load.
  while (remaining > 0 && candidates.length > 0) {
    candidates.sort((a, b) => {
      const loadA = minutesAlreadyByDay.get(a.dayKey) || 0;
      const loadB = minutesAlreadyByDay.get(b.dayKey) || 0;
      return loadA - loadB || a.start - b.start;
    });
    const chosen = candidates.shift();
    if (!chosen) break;
    const duration = Math.min(blockTarget, remaining);
    const adjustedEnd = chosen.start + duration * MINUTE;
    const chosenDay = new Date(chosen.start).toDateString();
    const busyNow = getBusyIntervals({ ...state, studyBlocks: [...retained, ...created] }, new Date(chosen.start), task.id);
    if (busyNow.some((interval) => overlaps(chosen.start, adjustedEnd, interval.start, interval.end))) continue;
    created.push({
      id: makeId('block'), taskId: task.id,
      start: new Date(chosen.start).toISOString(), end: new Date(adjustedEnd).toISOString(),
      minutes: duration, status: 'scheduled',
    });
    minutesAlreadyByDay.set(chosenDay, (minutesAlreadyByDay.get(chosenDay) || 0) + duration);
    remaining -= duration;
    // Avoid duplicate or overlapping candidates for the same day after selecting a slot.
    for (let i = candidates.length - 1; i >= 0; i -= 1) {
      if (candidates[i].dayKey === chosenDay && overlaps(candidates[i].start, candidates[i].end, chosen.start, adjustedEnd)) candidates.splice(i, 1);
    }
  }
  return created;
}

export function rescheduleTaskBlocks(state: PlannerState, taskId: string, now = new Date()): PlannerState {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return state;
  const completed = state.studyBlocks.filter((block) => block.taskId === taskId && block.status === 'completed');
  const missed = state.studyBlocks.filter((block) => block.taskId === taskId && block.status === 'missed');
  const replacedBlocks = state.studyBlocks.filter((block) => block.taskId === taskId && block.status === 'scheduled');
  const withoutFutureForTask = state.studyBlocks.filter((block) => block.taskId !== taskId || (block.status !== 'scheduled' && block.status !== 'missed'));
  const replacedGoogleIds = replacedBlocks.map((block) => block.googleEventId).filter((id): id is string => Boolean(id));
  const base = {
    ...state,
    deletedGoogleEventIds: [...new Set([...state.deletedGoogleEventIds, ...replacedGoogleIds])],
    studyBlocks: [...withoutFutureForTask, ...completed, ...missed],
  };
  const newBlocks = generateStudyBlocks(base, task, now);
  return { ...base, studyBlocks: [...base.studyBlocks, ...newBlocks] };
}

export function refreshMissedBlocks(state: PlannerState, now = new Date()): PlannerState {
  let next = { ...state, studyBlocks: [...state.studyBlocks] };
  const overdue = next.studyBlocks.filter((block) => block.status === 'scheduled' && new Date(block.end).getTime() < now.getTime());
  const taskIds = new Set<string>();
  next.studyBlocks = next.studyBlocks.map((block) => {
    if (block.status === 'scheduled' && new Date(block.end).getTime() < now.getTime()) {
      taskIds.add(block.taskId);
      if (block.googleEventId) next.deletedGoogleEventIds = [...new Set([...next.deletedGoogleEventIds, block.googleEventId])];
      return { ...block, status: 'missed' as const, updatedAt: now.toISOString() };
    }
    return block;
  });
  for (const id of taskIds) next = rescheduleTaskBlocks(next, id, now);
  void overdue;
  return next;
}

export function getHighStressTaskIds(tasks: Task[]): Set<string> {
  const major = tasks.filter((task) => task.status !== 'done' && (task.category === 'exam' || task.category === 'project' || task.priority === 'high'));
  const highlighted = new Set<string>();
  for (let i = 0; i < major.length; i += 1) {
    for (let j = i + 1; j < major.length; j += 1) {
      const distance = Math.abs(new Date(major[i].dueDate).getTime() - new Date(major[j].dueDate).getTime());
      if (distance <= 48 * 60 * MINUTE) {
        highlighted.add(major[i].id);
        highlighted.add(major[j].id);
      }
    }
  }
  return highlighted;
}

export function getNextUpTask(state: PlannerState): Task | undefined {
  const open = state.tasks.filter((task) => task.status !== 'done');
  return open.map((task) => {
    const hoursToDue = Math.max(1, (new Date(task.dueDate).getTime() - Date.now()) / (60 * MINUTE));
    const urgency = Math.min(100, 200 / Math.sqrt(hoursToDue));
    const priority = task.priority === 'high' ? 35 : task.priority === 'medium' ? 20 : 8;
    const effortFit = task.estimatedMinutes <= 90 ? 12 : task.estimatedMinutes <= 180 ? 6 : 0;
    const started = task.status === 'in-progress' ? 10 : 0;
    return { task, score: urgency + priority + effortFit + started };
  }).sort((a, b) => b.score - a.score)[0]?.task;
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h${mins ? ` ${mins}m` : ''}` : `${mins}m`;
}

export function weekStart(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
}
