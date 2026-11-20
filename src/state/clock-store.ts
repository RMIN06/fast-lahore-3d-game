import { create } from 'zustand';
import { GameClock, isGateOpen } from '../systems/time';
import type { Speed } from '../systems/time';
import { loadedCampus } from '../world/campus';

// One game clock for the whole app. The renderer advances it every frame;
// React sees a snapshot a few times per second (never per frame).
export const gameClock = new GameClock();

const gateStates = () =>
  Object.fromEntries(
    loadedCampus.campus.gates.map((gate) => [
      gate.id,
      isGateOpen(gate, gameClock.day, gameClock.minutes),
    ]),
  );

interface ClockState {
  label: string;
  speed: Speed;
  paused: boolean;
  dayType: GameClock['dayType'];
  gatesOpen: Record<string, boolean>;
  publish: () => void;
  setSpeed: (speed: Speed) => void;
  setPaused: (paused: boolean) => void;
  setTime: (minutes: number, day?: number) => void;
}

const snapshot = () => ({
  label: gameClock.label(),
  speed: gameClock.speed,
  paused: gameClock.paused,
  dayType: gameClock.dayType,
  gatesOpen: gateStates(),
});

export const useClockStore = create<ClockState>((set, get) => ({
  ...snapshot(),
  publish: () => {
    const next = snapshot();
    const current = get();
    const gatesChanged = Object.entries(next.gatesOpen).some(
      ([id, open]) => current.gatesOpen[id] !== open,
    );
    if (
      next.label !== current.label ||
      next.paused !== current.paused ||
      next.speed !== current.speed ||
      gatesChanged
    )
      set(gatesChanged ? next : { ...next, gatesOpen: current.gatesOpen });
  },
  setSpeed: (speed) => {
    gameClock.setSpeed(speed);
    get().publish();
  },
  setPaused: (paused) => {
    gameClock.paused = paused;
    get().publish();
  },
  setTime: (minutes, day) => {
    gameClock.setTime(minutes);
    if (day !== undefined) gameClock.setDay(day);
    get().publish();
  },
}));
