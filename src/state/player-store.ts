import { create } from 'zustand';
import type { AnimState } from '../systems/character';

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
  /** Current character animation (published with the position). */
  animation: AnimState;
  /** Debug/gameplay action request: sit holds, kick/swing play once. */
  animAction?: 'sit' | 'kick' | 'swing';
  /** Pending teleport, consumed by the player rig on its next frame. */
  teleport?: TeleportRequest;
  setMode: (mode: CameraMode) => void;
  publish: (
    state: Pick<PlayerState, 'position' | 'yaw' | 'grounded' | 'sprinting'> &
      Partial<Pick<PlayerState, 'animation'>>,
  ) => void;
  setReady: (ready: boolean) => void;
  requestTeleport: (request: TeleportRequest | undefined) => void;
  requestAction: (action: PlayerState['animAction']) => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
  ready: false,
  mode: 'first',
  position: [0, 0, 0],
  yaw: 0,
  grounded: false,
  sprinting: false,
  animation: 'idle',
  setMode: (mode) => set({ mode }),
  publish: (state) => set(state),
  setReady: (ready) => set({ ready }),
  requestTeleport: (teleport) => set({ teleport }),
  requestAction: (animAction) => set({ animAction }),
}));

/** V toggles first/third person; the free debug camera ignores it. */
export const toggledMode = (mode: CameraMode): CameraMode =>
  mode === 'first' ? 'third' : mode === 'third' ? 'first' : mode;
