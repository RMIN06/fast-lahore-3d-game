import { afterEach, expect, test } from 'vitest';
import { useDebugStore } from './debug-store';

afterEach(() =>
  useDebugStore.setState({
    confidenceColors: true,
    labels: true,
    colliders: false,
  }),
);

test('debug toggles default to confidence colors and labels on, colliders off', () => {
  const state = useDebugStore.getState();
  expect([state.confidenceColors, state.labels, state.colliders]).toEqual([
    true,
    true,
    false,
  ]);
});

test('each debug toggle can be switched independently', () => {
  const { setToggle } = useDebugStore.getState();
  setToggle('colliders', true);
  setToggle('labels', false);
  const state = useDebugStore.getState();
  expect(state.colliders).toBe(true);
  expect(state.labels).toBe(false);
  expect(state.confidenceColors).toBe(true);
});
