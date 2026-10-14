import localforage from 'localforage';
import type { PlannerState } from '../types';

const db = localforage.createInstance({
  name: 'campus-os',
  storeName: 'planner_state',
  description: 'Local-first academic planner data stored in IndexedDB',
});
const STATE_KEY = 'planner-state-v1';

export async function loadState(): Promise<PlannerState | null> {
  try {
    return await db.getItem<PlannerState>(STATE_KEY);
  } catch (error) {
    console.error('Could not read local planner state', error);
    return null;
  }
}

export async function saveState(state: PlannerState): Promise<void> {
  try {
    await db.setItem(STATE_KEY, state);
  } catch (error) {
    console.error('Could not save local planner state', error);
    throw new Error('Local storage is unavailable. Export a backup before continuing.');
  }
}
