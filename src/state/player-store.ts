import { create } from 'zustand';

export type CameraMode = 'first' | 'third' | 'free';

export interface TeleportRequest {
  position: [number, number, number];
  yaw: number;
}

interface PlayerState {
  ready: boolean;
  mode: CameraMode;
  /** Feet position, published ~10 times a second (not every frame). */
  position: [number, number, number];
  /** Camera yaw (radians, three.js about +Y; 0 faces north). */
  yaw: number;
  grounded: boolean;
  sprinting: boolean;
  /** Pending teleport, consumed by the player rig on its next frame. */
  teleport?: TeleportRequest;
  setMode: (mode: CameraMode) => void;
  publish: (
    state: Pick<PlayerState, 'position' | 'yaw' | 'grounded' | 'sprinting'>,
  ) => void;
  setReady: (ready: boolean) => void;
  requestTeleport: (request: TeleportRequest | undefined) => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
  ready: false,
  mode: 'first',
  position: [0, 0, 0],
  yaw: 0,
  grounded: false,
  sprinting: false,
  setMode: (mode) => set({ mode }),
  publish: (state) => set(state),
  setReady: (ready) => set({ ready }),
  requestTeleport: (teleport) => set({ teleport }),
}));

/** V toggles first/third person; the free debug camera ignores it. */
export const toggledMode = (mode: CameraMode): CameraMode =>
  mode === 'first' ? 'third' : mode === 'third' ? 'first' : mode;
