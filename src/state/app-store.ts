import { create } from 'zustand';
import {
  DEFAULT_SETTINGS,
  deleteSave,
  readSave,
  writeSave,
} from '../systems/save';
import type {
  LoadResult,
  Profile,
  SaveGame,
  SaveStorage,
  Settings,
} from '../systems/save';
import { departmentSpawn } from '../systems/campus-geometry';
import { START } from '../systems/time';
import { loadedCampus } from '../world/campus';
import { gameClock, useClockStore } from './clock-store';
import { usePlayerStore } from './player-store';

// App flow (PRD §5): Title → Register → Game, with Continue from a local save.

export type Screen = 'title' | 'register' | 'game';
export type Overlay = 'pause' | 'settings' | 'phone' | 'map' | 'time' | null;

export interface Spawn {
  position: [number, number, number];
  yaw: number;
}

/** localStorage when available (private mode or tests may block it). */
export const browserStorage = (): SaveStorage | undefined => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

const SETTINGS_KEY = 'fast-lahore.settings.v1';
const loadSettings = (): Settings => {
  try {
    const text = browserStorage()?.getItem(SETTINGS_KEY);
    if (text) return { ...DEFAULT_SETTINGS, ...JSON.parse(text) };
  } catch {
    // Fall back to defaults on unreadable settings.
  }
  return DEFAULT_SETTINGS;
};

interface AppState {
  screen: Screen;
  overlay: Overlay;
  profile?: Profile;
  settings: Settings;
  spawn?: Spawn;
  /** Last save attempt/result shown in the pause menu and title. */
  saveMessage?: string;
  /** Session counter so the 3D world remounts for each new game/continue. */
  session: number;
  setScreen: (screen: Screen) => void;
  setOverlay: (overlay: Overlay) => void;
  setSettings: (settings: Partial<Settings>) => void;
  peekSave: () => LoadResult | undefined;
  startNewGame: (profile: Profile) => void;
  continueGame: () => boolean;
  saveNow: () => boolean;
  exitToTitle: () => void;
}

const snapshotSave = (profile: Profile, settings: Settings): SaveGame => {
  const player = usePlayerStore.getState();
  return {
    version: 2,
    profile,
    position: {
      x: player.position[0],
      y: Math.max(0, player.position[1]),
      z: player.position[2],
      yaw: player.yaw,
    },
    time: { day: gameClock.day, minutes: gameClock.minutes },
    settings,
    savedAt: new Date().toISOString(),
  };
};

export const useAppStore = create<AppState>((set, get) => ({
  screen: 'title',
  overlay: null,
  settings: loadSettings(),
  session: 0,
  setScreen: (screen) => set({ screen }),
  setOverlay: (overlay) => set({ overlay }),
  setSettings: (partial) => {
    const settings = { ...get().settings, ...partial };
    set({ settings });
    try {
      browserStorage()?.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Settings still apply for this session.
    }
  },
  peekSave: () => {
    const storage = browserStorage();
    return storage ? readSave(storage) : undefined;
  },
  startNewGame: (profile) => {
    const spawn = departmentSpawn(loadedCampus.campus, profile.departmentId);
    gameClock.setDay(START.day);
    gameClock.setTime(START.minutes);
    gameClock.setSpeed(1);
    gameClock.paused = false;
    useClockStore.getState().publish();
    usePlayerStore.getState().publish({
      position: [spawn.position[0], 0, spawn.position[1]],
      yaw: spawn.yaw,
      grounded: false,
      sprinting: false,
    });
    usePlayerStore.getState().setMode('first');
    set((s) => ({
      profile,
      spawn: {
        position: [spawn.position[0], 0, spawn.position[1]],
        yaw: spawn.yaw,
      },
      screen: 'game',
      overlay: null,
      session: s.session + 1,
    }));
    get().saveNow();
  },
  continueGame: () => {
    const result = get().peekSave();
    if (!result?.ok) {
      set({ saveMessage: result ? result.error : 'No saved game' });
      return false;
    }
    const { save } = result;
    gameClock.setDay(save.time.day);
    gameClock.setTime(save.time.minutes);
    gameClock.paused = false;
    useClockStore.getState().publish();
    const position: [number, number, number] = [
      save.position.x,
      save.position.y,
      save.position.z,
    ];
    usePlayerStore.getState().publish({
      position,
      yaw: save.position.yaw,
      grounded: false,
      sprinting: false,
    });
    usePlayerStore.getState().setMode('first');
    get().setSettings(save.settings);
    set((s) => ({
      profile: save.profile,
      spawn: { position, yaw: save.position.yaw },
      screen: 'game',
      overlay: null,
      saveMessage: undefined,
      session: s.session + 1,
    }));
    return true;
  },
  saveNow: () => {
    const { profile, settings, screen } = get();
    const storage = browserStorage();
    if (!profile || screen !== 'game' || !storage) return false;
    try {
      writeSave(storage, snapshotSave(profile, settings));
      set({ saveMessage: `Saved ${gameClock.label()}` });
      return true;
    } catch (error) {
      set({
        saveMessage: `Could not save: ${error instanceof Error ? error.message : String(error)}`,
      });
      return false;
    }
  },
  exitToTitle: () => {
    get().saveNow();
    set({ screen: 'title', overlay: null });
  },
}));

/** Delete the local save (title screen "Delete save"). */
export const clearSave = () => {
  const storage = browserStorage();
  if (storage) deleteSave(storage);
  useAppStore.setState({ saveMessage: 'Save deleted' });
};
