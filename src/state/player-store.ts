import { create } from 'zustand';

export type CameraMode = 'first' | 'third' | 'free';

interface PlayerState {
  ready: boolean;
  mode: CameraMode;
  /** Feet position, published ~10 times a second (not every frame). */
  position: [number, number, number];
  grounded: boolean;
  sprinting: boolean;
  setMode: (mode: CameraMode) => void;
  publish: (
    state: Pick<PlayerState, 'position' | 'grounded' | 'sprinting'>,
  ) => void;
  setReady: (ready: boolean) => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
  ready: false,
  mode: 'first',
  position: [0, 0, 0],
  grounded: false,
  sprinting: false,
  setMode: (mode) => set({ mode }),
  publish: (state) => set(state),
  setReady: (ready) => set({ ready }),
}));

/** V toggles first/third person; the free debug camera ignores it. */
export const toggledMode = (mode: CameraMode): CameraMode =>
  mode === 'first' ? 'third' : mode === 'third' ? 'first' : mode;
