import { Delta } from 'jsondiffpatch';

import {
  useTrimergeClientList,
  useTrimergeDeleteDatabase,
  useTrimergeDoc,
  useTrimergeStateShutdown,
  useTrimergeSyncStatus,
} from './lib/trimergeHooks';
import { diff, mergeAllBranches, patch } from './lib/trimergeDiffer';
import { Differ } from 'trimerge-sync';
import { computeRef } from 'trimerge-sync-hash';
import { currentTabId } from './lib/currentTabId';
import { FocusPresence } from './lib/FocusPresence';

type AppStateV1 = {
  title: string;
  text: string;
  slider: number;
};
type SavedAppDoc = AppStateV1;

export type LatestAppDoc = AppStateV1;

export const defaultDoc = {
  title: '',
  text: '',
  slider: 0,
};

export const differ: Differ<SavedAppDoc, LatestAppDoc, string, Delta> = {
  migrate: (doc, metadata) => ({ doc, metadata }),
  diff,
  patch: (priorOrNext, delta) => patch(priorOrNext, delta) ?? defaultDoc,
  computeRef,
  mergeAllBranches,
};

const DEMO_DOC_ID = 'demo';
const DEMO_USER_ID = 'local';
export function useDemoAppDoc() {
  return useTrimergeDoc<SavedAppDoc, LatestAppDoc, string, Delta>(
    DEMO_DOC_ID,
    DEMO_USER_ID,
    currentTabId,
    differ,
  );
}

export function useDemoAppDeleteDatabase() {
  return useTrimergeDeleteDatabase(
    DEMO_DOC_ID,
    DEMO_USER_ID,
    currentTabId,
    differ,
  );
}

export function useDemoAppClientList() {
  return useTrimergeClientList<
    SavedAppDoc,
    LatestAppDoc,
    string,
    Delta,
    FocusPresence
  >(DEMO_DOC_ID, DEMO_USER_ID, currentTabId, differ);
}
export function useDemoAppSyncStatus() {
  return useTrimergeSyncStatus<SavedAppDoc, LatestAppDoc, string, Delta>(
    DEMO_DOC_ID,
    DEMO_USER_ID,
    currentTabId,
    differ,
  );
}
export function useDemoAppShutdown() {
  return useTrimergeStateShutdown<SavedAppDoc, LatestAppDoc, string, Delta>(
    DEMO_DOC_ID,
    DEMO_USER_ID,
    currentTabId,
    differ,
  );
}
