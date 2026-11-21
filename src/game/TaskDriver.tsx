import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { currentLoc } from '../world/task-location';
import { gameClock } from '../state/clock-store';
import { usePlayerStore } from '../state/player-store';
import { useTaskStore } from '../state/task-store';

// M10: feeds the task engine the player's location and the passing time,
// opens the dialogues it asks for, and announces completed or failed tasks.

const LOCATE_EVERY = 0.2;

export function TaskDriver() {
  const timers = useRef({ locate: 0, quiet: 0 });
  const lastClock = useRef<number>();
  const lastKey = useRef('');

  useEffect(() => {
    useTaskStore.getState().reset();
  }, []);

  useFrame((_, delta) => {
    const store = useTaskStore.getState();
    const { engine } = store;
    const dt = Math.min(delta, 0.25);
    // Game minutes since last frame (time-panel jumps do not count).
    const now = gameClock.day * 1440 + gameClock.minutes;
    let gameMinutes =
      lastClock.current === undefined ? 0 : now - lastClock.current;
    if (gameMinutes < 0 || gameMinutes > 30) gameMinutes = 0;
    lastClock.current = now;
    engine.tick(gameClock.paused ? 0 : dt, gameMinutes);

    const t = timers.current;
    t.locate += dt;
    if (t.locate >= LOCATE_EVERY) {
      t.locate = 0;
      const loc = currentLoc();
      engine.location(loc);
      // The library is a quiet zone: no running.
      t.quiet = Math.max(0, t.quiet - LOCATE_EVERY);
      if (
        loc.spaceId === 'E-G-LIBRARY' &&
        usePlayerStore.getState().sprinting &&
        t.quiet === 0
      ) {
        store.notify('Library: quiet zone. Please walk.');
        t.quiet = 10;
      }
    }

    if (engine.pendingDialogue && !store.dialogue) {
      const p = engine.pendingDialogue;
      store.openDialogue(p.dialogue, p.actor, p.vars, true);
    }

    const key = `${engine.active?.task.id}|${engine.active?.index}|${engine.hint()?.text}|${engine.last?.taskId}:${engine.last?.result}`;
    if (key !== lastKey.current) {
      const finished =
        engine.last &&
        !lastKey.current.endsWith(
          `${engine.last.taskId}:${engine.last.result}`,
        );
      lastKey.current = key;
      if (finished && engine.last!.result !== 'abandoned')
        store.notify(
          engine.last!.result === 'completed'
            ? `Task complete: ${engine.last!.title}`
            : `Task failed: ${engine.last!.title} (${engine.last!.reason})`,
        );
      store.bump();
    }
  });

  return null;
}
