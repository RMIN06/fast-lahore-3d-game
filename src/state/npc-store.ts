import { create } from 'zustand';

/** NPC counts for the dev overlay, published a few times a second. */
export interface NpcCounts {
  status: 'loading' | 'ready' | 'error';
  present: number;
  active: number;
  rendered: number;
  stuck: number;
  pathFailures: number;
}

export const useNpcStore = create<NpcCounts>(() => ({
  status: 'loading',
  present: 0,
  active: 0,
  rendered: 0,
  stuck: 0,
  pathFailures: 0,
}));
