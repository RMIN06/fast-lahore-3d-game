import { create } from 'zustand';

export type DebugToggle =
  'confidenceColors' | 'labels' | 'colliders' | 'navmesh';

interface DebugState {
  confidenceColors: boolean;
  labels: boolean;
  colliders: boolean;
  navmesh: boolean;
  setToggle: (toggle: DebugToggle, value: boolean) => void;
}

// Debug views for the exterior greybox. Confidence colors are on by default so
// placeholders stay visually obvious (AGENTS.md rule 2).
export const useDebugStore = create<DebugState>((set) => ({
  confidenceColors: true,
  labels: true,
  colliders: false,
  navmesh: false,
  setToggle: (toggle, value) => set({ [toggle]: value }),
}));
