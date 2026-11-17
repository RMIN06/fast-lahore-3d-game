import { afterEach, expect, test } from 'vitest';
import { useDebugStore } from './debug-store';

afterEach(() => useDebugStore.setState({ spinCube: true }));

test('debug spin control can pause and resume the cube', () => {
  expect(useDebugStore.getState().spinCube).toBe(true);
  useDebugStore.getState().setSpinCube(false);
  expect(useDebugStore.getState().spinCube).toBe(false);
  useDebugStore.getState().setSpinCube(true);
  expect(useDebugStore.getState().spinCube).toBe(true);
});
