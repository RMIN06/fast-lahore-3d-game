import { create } from 'zustand';
import { DialogueRunner } from '../systems/dialogue';
import { DoorSystem } from '../systems/doors';
import type { Fixture, Vec3 } from '../systems/fixtures';
import type { Interactable } from '../systems/interaction';
import { TaskEngine } from '../systems/tasks';
import type { DialogueTree } from '../systems/task-schema';
import { timetable } from '../systems/timetable';
import type { ClassSlot } from '../systems/timetable';
import { loadedCampus } from '../world/campus';
import { loadTasks } from '../world/tasks-data';
import { useAppStore } from './app-store';

// M10 gameplay session state: the task engine, what the player is looking
// at, sitting on or talking to, doors, and phone messages. SESSION ONLY:
// none of it is written to the save (no progression, AGENTS.md rule 6).

let data: ReturnType<typeof loadTasks> | undefined;
/** Tasks, dialogue and fixtures (validated once, on first use). */
export const taskData = () => (data ??= loadTasks(loadedCampus.campus));

export interface ActorPose {
  id: string;
  name: string;
  body: 'male' | 'female';
  position: Vec3;
  yaw: number;
  sitting: boolean;
}

interface DialogueState {
  tree: DialogueTree;
  runner: DialogueRunner;
  /** Opened by the task engine (its outcome goes back to the engine). */
  forTask: boolean;
  /** Bumped on each choice so React re-renders. */
  step: number;
}

interface TaskState {
  engine: TaskEngine;
  doors: DoorSystem;
  timetable: ClassSlot[];
  /** Bumped whenever the engine changes, for React. */
  rev: number;
  focus?: Interactable;
  seated?: Fixture;
  dialogue?: DialogueState;
  notice?: { text: string; id: number };
  /** Friend invitations accepted or declined today (session only). */
  replied: Record<string, 'accepted' | 'declined'>;
  reset: () => void;
  bump: () => void;
  setFocus: (focus: Interactable | undefined) => void;
  setSeated: (seat: Fixture | undefined) => void;
  notify: (text: string) => void;
  openDialogue: (
    id: string,
    actor: string,
    vars: Record<string, string>,
    forTask: boolean,
  ) => void;
  choose: (index: number) => void;
  leaveDialogue: () => void;
  reply: (messageId: string, answer: 'accepted' | 'declined') => void;
}

const fresh = () => {
  const { doc, fixtures, layouts } = taskData();
  const profile = useAppStore.getState().profile;
  const doors = new DoorSystem(
    new Map(
      fixtures.filter((f) => f.kind === 'door').map((f) => [f.id, f.position]),
    ),
  );
  return {
    engine: new TaskEngine(doc, {
      campus: loadedCampus.campus,
      layouts,
      fixtures,
    }),
    doors,
    timetable: profile
      ? timetable(
          loadedCampus.campus,
          layouts,
          profile.departmentId,
          profile.rollNumber,
        )
      : [],
    replied: {},
  };
};

let noticeId = 0;

export const useTaskStore = create<TaskState>((set, get) => ({
  ...fresh(),
  rev: 0,
  reset: () =>
    set({
      ...fresh(),
      rev: 0,
      focus: undefined,
      seated: undefined,
      dialogue: undefined,
      notice: undefined,
    }),
  bump: () => set((s) => ({ rev: s.rev + 1 })),
  setFocus: (focus) => {
    if (focus?.id !== get().focus?.id) set({ focus });
  },
  setSeated: (seated) => {
    get().engine.sat(seated);
    set((s) => ({ seated, rev: s.rev + 1 }));
  },
  notify: (text) => set({ notice: { text, id: ++noticeId } }),
  openDialogue: (id, actor, vars, forTask) => {
    const tree = taskData().dialogues.get(id);
    if (!tree) return;
    set({
      dialogue: {
        tree,
        runner: new DialogueRunner(tree, { actor, ...vars }),
        forTask,
        step: 0,
      },
    });
    useAppStore.getState().setOverlay('dialogue');
  },
  choose: (index) => {
    const d = get().dialogue;
    if (!d) return;
    const outcome = d.runner.choose(index);
    if (outcome === undefined) {
      set({ dialogue: { ...d, step: d.step + 1 } });
      return;
    }
    set({ dialogue: undefined });
    if (useAppStore.getState().overlay === 'dialogue')
      useAppStore.getState().setOverlay(null);
    if (d.forTask) get().engine.dialogueEnded(outcome);
    get().bump();
  },
  leaveDialogue: () => {
    const d = get().dialogue;
    if (!d) return;
    set({ dialogue: undefined });
    if (useAppStore.getState().overlay === 'dialogue')
      useAppStore.getState().setOverlay(null);
    if (d.forTask) get().engine.dialogueEnded('leave');
    get().bump();
  },
  reply: (messageId, answer) =>
    set((s) => ({ replied: { ...s.replied, [messageId]: answer } })),
}));

/** Where task actors (lecturer, doctor, friend…) stand or sit right now. */
export function actorPoses(engine: TaskEngine): ActorPose[] {
  const a = engine.active;
  if (!a) return [];
  return (a.task.actors ?? []).flatMap((actor) => {
    const f = engine.actorFixture(actor.id);
    if (!f) return [];
    const friend =
      actor.id === 'friend' && a.params.friend
        ? engine.friend(a.params.friend)
        : undefined;
    const sitting = f.kind === 'bench' || f.kind === 'seat';
    // Stand behind a lectern or desk, facing the room.
    const fx = -Math.sin(f.yaw),
      fz = -Math.cos(f.yaw);
    const back = sitting ? 0 : -0.7;
    return [
      {
        id: actor.id,
        name: friend?.name ?? actor.name,
        body: friend?.body ?? actor.body,
        position: [
          f.position[0] + fx * back,
          f.position[1],
          f.position[2] + fz * back,
        ] as Vec3,
        yaw: f.yaw,
        sitting,
      },
    ];
  });
}
