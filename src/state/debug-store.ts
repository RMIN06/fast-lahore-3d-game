import { create } from 'zustand';

export type DebugToggle = 'confidenceColors' | 'labels' | 'colliders';

interface DebugState {
  confidenceColors: boolean;
  labels: boolean;
  colliders: boolean;
  setToggle: (toggle: DebugToggle, value: boolean) => void;
}

// Debug views for the exterior greybox. Confidence colors are on by default so
// placeholders stay visually obvious (AGENTS.md rule 2).
export const useDebugStore = create<DebugState>((set) => ({
  confidenceColors: true,
  labels: true,
  colliders: false,
  setToggle: (toggle, value) => set({ [toggle]: value }),
}));
