import type { CalendarEvent, PlannerState } from '../types';
import { generateStudyBlocks } from './scheduler';

const GOOGLE_SCRIPT = 'https://accounts.google.com/gsi/client';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const SCOPES = 'https://www.googleapis.com/auth/calendar.events';

type TokenResponse = { access_token?: string; error?: string; expires_in?: number };
type TokenClient = { requestAccessToken: (config?: { prompt?: string }) => void };
type GoogleIdentity = { oauth2: { initTokenClient: (config: Record<string, unknown>) => TokenClient } };
declare global { interface Window { google?: GoogleIdentity } }

let accessToken: string | undefined;

function loadGoogleScript(): Promise<void> {
  if (window.google?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Could not load Google sign-in.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = GOOGLE_SCRIPT;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Google sign-in. Check your network connection.'));
    document.head.appendChild(script);
  });
}

async function requestToken(clientId: string): Promise<string> {
  await loadGoogleScript();
  if (!window.google?.oauth2) throw new Error('Google Identity Services did not initialize.');
  return new Promise((resolve, reject) => {
    const tokenClient = window.google!.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (response: TokenResponse) => {
        if (response.error || !response.access_token) reject(new Error(response.error || 'Google authorization failed.'));
        else { accessToken = response.access_token; resolve(response.access_token); }
      },
      error_callback: (error: { message?: string }) => reject(new Error(error.message || 'Google authorization popup was blocked.')),
    });
    tokenClient.requestAccessToken({ prompt: 'consent' });
  });
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!accessToken) throw new Error('Connect Google Calendar first.');
  const response = await fetch(`${CALENDAR_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Google Calendar error (${response.status}): ${detail.slice(0, 180)}`);
  }
  return response.status === 204 ? ({} as T) : response.json() as Promise<T>;
}

interface GoogleEvent {
  id: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  extendedProperties?: { private?: Record<string, string> };
  status?: string;
  updated?: string;
}
interface EventList { items?: GoogleEvent[]; nextPageToken?: string }

function localISOFromDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  return parsed.toISOString();
}

function toGooglePayload(item: { title: string; start: string; end: string; description?: string; id: string; kind: string }) {
  return {
    summary: item.title,
    description: item.description || `Managed by CampusOS · ${item.kind}`,
    start: { dateTime: new Date(item.start).toISOString() },
    end: { dateTime: new Date(item.end).toISOString() },
    extendedProperties: { private: { campusosId: item.id, campusosKind: item.kind } },
  };
}

async function upsertGoogleEvent(item: { title: string; start: string; end: string; description?: string; id: string; kind: string }, googleEventId?: string): Promise<string> {
  const payload = toGooglePayload(item);
  const result = googleEventId
    ? await apiRequest<GoogleEvent>(`/calendars/primary/events/${encodeURIComponent(googleEventId)}`, { method: 'PUT', body: JSON.stringify(payload) })
    : await apiRequest<GoogleEvent>('/calendars/primary/events', { method: 'POST', body: JSON.stringify(payload) });
  return result.id;
}

function validEventDate(event: GoogleEvent, edge: 'start' | 'end'): string | undefined {
  const value = event[edge]?.dateTime;
  if (value) return new Date(value).toISOString();
  const date = event[edge]?.date;
  if (date) return localISOFromDate(date);
  return undefined;
}

export async function connectAndSyncCalendar(clientId: string, initialState: PlannerState): Promise<PlannerState> {
  await requestToken(clientId);
  const now = new Date();
  const timeMin = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
  let pageToken = '';
  const pulled: GoogleEvent[] = [];
  do {
    const query = new URLSearchParams({ timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '250' });
    if (pageToken) query.set('pageToken', pageToken);
    const page = await apiRequest<EventList>(`/calendars/primary/events?${query.toString()}`);
    pulled.push(...(page.items || []));
    pageToken = page.nextPageToken || '';
  } while (pageToken);

  const lastSyncedMs = initialState.settings.googleLastSyncedAt ? new Date(initialState.settings.googleLastSyncedAt).getTime() : 0;
  let next: PlannerState = {
    ...initialState,
    tasks: initialState.tasks.map((item) => ({ ...item })),
    studyBlocks: initialState.studyBlocks.map((item) => ({ ...item })),
    calendarEvents: initialState.calendarEvents.map((item) => ({ ...item })),
  };
  const seenIds = new Set<string>();
  const tasksNeedingReplan = new Set<string>();
  for (const googleEvent of pulled) {
    if (!googleEvent.id || googleEvent.status === 'cancelled') continue;
    const start = validEventDate(googleEvent, 'start');
    const end = validEventDate(googleEvent, 'end');
    if (!start || !end) continue;
    seenIds.add(googleEvent.id);
    const remoteUpdatedMs = googleEvent.updated ? new Date(googleEvent.updated).getTime() : 0;
    const task = next.tasks.find((item) => item.googleEventId === googleEvent.id);
    const block = next.studyBlocks.find((item) => item.googleEventId === googleEvent.id);
    const calendarEvent = next.calendarEvents.find((item) => item.googleEventId === googleEvent.id);
    if (task) {
      const localUpdatedMs = task.updatedAt ? new Date(task.updatedAt).getTime() : 0;
      if (remoteUpdatedMs > lastSyncedMs && remoteUpdatedMs > localUpdatedMs) {
        const due = new Date(start); due.setHours(23, 59, 0, 0);
        const nextTitle = (googleEvent.summary || task.title).replace(/^Deadline:\s*/i, '');
        const dueChanged = new Date(task.dueDate).toDateString() !== due.toDateString();
        next.tasks = next.tasks.map((item) => item.id === task.id ? {
          ...item, title: nextTitle, dueDate: due.toISOString(), description: googleEvent.description || item.description, updatedAt: googleEvent.updated,
        } : item);
        if (dueChanged) tasksNeedingReplan.add(task.id);
      }
      continue;
    }
    if (block) {
      const localUpdatedMs = block.updatedAt ? new Date(block.updatedAt).getTime() : 0;
      if (remoteUpdatedMs > lastSyncedMs && remoteUpdatedMs > localUpdatedMs) {
        const minutes = Math.max(15, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000));
        next.studyBlocks = next.studyBlocks.map((item) => item.id === block.id ? { ...item, start, end, minutes, updatedAt: googleEvent.updated } : item);
      }
      continue;
    }
    if (calendarEvent) {
      const localUpdatedMs = calendarEvent.updatedAt ? new Date(calendarEvent.updatedAt).getTime() : 0;
      if (remoteUpdatedMs > lastSyncedMs && remoteUpdatedMs > localUpdatedMs || localUpdatedMs <= lastSyncedMs) {
        next.calendarEvents = next.calendarEvents.map((item) => item.id === calendarEvent.id ? {
          ...item, title: googleEvent.summary || 'Untitled event', start, end, description: googleEvent.description, updatedAt: googleEvent.updated || new Date().toISOString(),
        } : item);
      }
    } else {
      const isOurs = Boolean(googleEvent.extendedProperties?.private?.campusosId);
      if (isOurs) continue;
      next.calendarEvents.push({
        id: `google-${googleEvent.id}`, title: googleEvent.summary || 'Untitled event', start, end,
        type: 'event', source: 'google', googleEventId: googleEvent.id, description: googleEvent.description,
        allDay: Boolean(googleEvent.start?.date), updatedAt: googleEvent.updated || new Date().toISOString(),
      });
    }
  }

  // If a task/block event was deleted remotely inside the fetched window, clear its stale id so it can be recreated.
  const lowerBound = new Date(timeMin).getTime();
  const upperBound = new Date(timeMax).getTime();
  next.tasks = next.tasks.map((task) => {
    const dueAt = new Date(task.dueDate).getTime();
    if (task.googleEventId && dueAt >= lowerBound && dueAt <= upperBound && !seenIds.has(task.googleEventId)) return { ...task, googleEventId: undefined };
    return task;
  });
  next.studyBlocks = next.studyBlocks.map((block) => {
    const blockAt = new Date(block.start).getTime();
    if (block.googleEventId && blockAt >= lowerBound && blockAt <= upperBound && !seenIds.has(block.googleEventId)) return { ...block, googleEventId: undefined };
    return block;
  });

  // Deleted synced calendar events are removed locally to keep external changes reflected.
  next.calendarEvents = next.calendarEvents.filter((event) => { if (event.source !== 'google' || !event.googleEventId) return true; const time = new Date(event.start).getTime(); return time < lowerBound || time > upperBound || seenIds.has(event.googleEventId); });

  // Include blocks made unavailable by newly imported/changed Google events in the same rescheduling pass.
  for (const block of next.studyBlocks.filter((item) => item.status === 'scheduled')) {
    const startMs = new Date(block.start).getTime(); const endMs = new Date(block.end).getTime();
    const eventConflict = next.calendarEvents.some((event) => startMs < new Date(event.end).getTime() && endMs > new Date(event.start).getTime());
    const classConflict = next.classSchedule.some((meeting) => {
      if (meeting.dayOfWeek !== new Date(block.start).getDay()) return false;
      const day = new Date(block.start); const [sh, sm] = meeting.startTime.split(':').map(Number); const [eh, em] = meeting.endTime.split(':').map(Number);
      const classStart = new Date(day); classStart.setHours(sh, sm, 0, 0); const classEnd = new Date(day); classEnd.setHours(eh, em, 0, 0);
      return startMs < classEnd.getTime() && endMs > classStart.getTime();
    });
    if (eventConflict || classConflict) tasksNeedingReplan.add(block.taskId);
  }

  // If a linked deadline moves in Google Calendar, recalculate only its future blocks.
  for (const taskId of tasksNeedingReplan) {
    const oldBlocks = next.studyBlocks.filter((block) => block.taskId === taskId && block.status === 'scheduled');
    next.deletedGoogleEventIds = [...new Set([...next.deletedGoogleEventIds, ...oldBlocks.map((block) => block.googleEventId).filter((id): id is string => Boolean(id))])];
    next.studyBlocks = next.studyBlocks.filter((block) => block.taskId !== taskId || block.status !== 'scheduled');
    const updatedTask = next.tasks.find((task) => task.id === taskId);
    if (updatedTask) next.studyBlocks.push(...generateStudyBlocks(next, updatedTask));
  }

  for (const task of next.tasks) {
    // LMS exam tasks are paired with timed calendar events; syncing both would create duplicate Google events.
    if (task.status === 'done' || task.lmsManaged) continue;
    const start = new Date(task.dueDate);
    start.setHours(9, 0, 0, 0);
    const end = new Date(start.getTime() + 30 * 60_000);
    task.googleEventId = await upsertGoogleEvent({
      id: task.id, title: `Deadline: ${task.title}`, start: start.toISOString(), end: end.toISOString(),
      description: task.description, kind: 'task',
    }, task.googleEventId);
  }
  for (const block of next.studyBlocks.filter((item) => item.status === 'scheduled')) {
    const task = next.tasks.find((item) => item.id === block.taskId);
    block.googleEventId = await upsertGoogleEvent({
      id: block.id, title: `Study block: ${task?.title || 'Assignment'}`, start: block.start, end: block.end,
      description: 'Smart study block generated by CampusOS.', kind: 'study-block',
    }, block.googleEventId);
  }
  for (const event of next.calendarEvents.filter((item) => item.source === 'local' || item.syncDirty)) {
    event.googleEventId = await upsertGoogleEvent({
      id: event.id, title: event.title, start: event.start, end: event.end, description: event.description, kind: 'calendar-event',
    }, event.googleEventId);
    event.syncDirty = false;
  }
  // Process deletions after reconciliation so remote edits/deletions have been read first.
  for (const googleEventId of next.deletedGoogleEventIds) {
    const response = await fetch(`${CALENDAR_API}/calendars/primary/events/${encodeURIComponent(googleEventId)}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok && response.status !== 404 && response.status !== 410) {
      throw new Error(`Could not delete Google Calendar event (${response.status}).`);
    }
  }
  next.deletedGoogleEventIds = [];
  next.settings = { ...next.settings, googleCalendarConnected: true, googleLastSyncedAt: new Date().toISOString() };
  return next;
}

export function disconnectCalendar(state: PlannerState): PlannerState {
  accessToken = undefined;
  return { ...state, settings: { ...state.settings, googleCalendarConnected: false } };
}

export type GoogleSyncResult = { state: PlannerState; importedCount: number };
export type { CalendarEvent };
