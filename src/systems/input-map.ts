// Single control table (GAMEPLAY_SPEC §2), layered by context. Inputs never
// conflict within a layer; the same key may mean different things in different layers.

export type InputContext = 'explore' | 'dialogue' | 'minigame' | 'menu';

export type InputAction =
  | 'moveForward'
  | 'moveBack'
  | 'moveLeft'
  | 'moveRight'
  | 'sprint'
  | 'jump'
  | 'toggleCamera'
  | 'interact'
  | 'light'
  | 'phone'
  | 'map'
  | 'timePanel'
  | 'pause'
  | 'primary'
  | 'secondary'
  | `choice${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`;

/** Key codes use KeyboardEvent.code; mouse buttons use Mouse0 (left) / Mouse2 (right). */
const movement: Record<string, InputAction> = {
  KeyW: 'moveForward',
  KeyS: 'moveBack',
  KeyA: 'moveLeft',
  KeyD: 'moveRight',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
};
const choices = Object.fromEntries(
  Array.from({ length: 9 }, (_, i) => [
    `Digit${i + 1}`,
    `choice${i + 1}` as InputAction,
  ]),
) as Record<string, InputAction>;

export const INPUT_MAP: Record<InputContext, Record<string, InputAction>> = {
  explore: {
    ...movement,
    Space: 'jump',
    KeyV: 'toggleCamera',
    KeyE: 'interact',
    KeyF: 'light',
    KeyP: 'phone',
    KeyM: 'map',
    KeyT: 'timePanel',
    Escape: 'pause',
  },
  dialogue: { ...choices, Escape: 'pause' },
  minigame: {
    ...movement,
    Space: 'jump',
    Mouse0: 'primary',
    Mouse2: 'secondary',
    Escape: 'pause',
  },
  // T, P and M also close the overlay they opened.
  menu: {
    ...choices,
    KeyT: 'timePanel',
    KeyP: 'phone',
    KeyM: 'map',
    Escape: 'pause',
  },
};

/** Map a physical input to an action in the active context, or undefined. */
export function resolveInput(
  context: InputContext,
  code: string,
): InputAction | undefined {
  return INPUT_MAP[context][code];
}

/** Held-action state; events are fed in, gameplay reads it once per frame. */
export class InputState {
  // Physical keys held, so two keys sharing an action (both Shifts) behave.
  private keys = new Set<string>();
  private pressed = new Set<InputAction>();
  context: InputContext = 'explore';

  down(code: string): InputAction | undefined {
    const action = resolveInput(this.context, code);
    if (!action) return undefined;
    if (!this.keys.has(code) && !this.isHeld(action)) this.pressed.add(action);
    this.keys.add(code);
    return action;
  }

  up(code: string): void {
    this.keys.delete(code);
  }

  isHeld(action: InputAction): boolean {
    for (const code of this.keys)
      if (resolveInput(this.context, code) === action) return true;
    return false;
  }

  /** True once per key press (edge-triggered), e.g. camera toggle or jump. */
  consume(action: InputAction): boolean {
    const was = this.pressed.has(action);
    this.pressed.delete(action);
    return was;
  }

  /** Movement axes in the player's local frame: forward (+1) / right (+1). */
  axes(): { forward: number; right: number } {
    const f =
      Number(this.isHeld('moveForward')) - Number(this.isHeld('moveBack'));
    const r =
      Number(this.isHeld('moveRight')) - Number(this.isHeld('moveLeft'));
    return { forward: f, right: r };
  }

  setContext(context: InputContext): void {
    this.context = context;
    this.clear();
  }

  clear(): void {
    this.keys.clear();
    this.pressed.clear();
  }
}
