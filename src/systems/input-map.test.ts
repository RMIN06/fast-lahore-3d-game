import { expect, test } from 'vitest';
import { INPUT_MAP, InputState, resolveInput } from './input-map';

test('explore layer matches the GAMEPLAY_SPEC control table', () => {
  expect(resolveInput('explore', 'KeyW')).toBe('moveForward');
  expect(resolveInput('explore', 'ShiftLeft')).toBe('sprint');
  expect(resolveInput('explore', 'Space')).toBe('jump');
  expect(resolveInput('explore', 'KeyV')).toBe('toggleCamera');
  expect(resolveInput('explore', 'KeyE')).toBe('interact');
  expect(resolveInput('explore', 'Escape')).toBe('pause');
  expect(resolveInput('explore', 'Digit1')).toBeUndefined();
});

test('layers are separate: digits choose in dialogue, mouse acts in mini-games', () => {
  expect(resolveInput('dialogue', 'Digit3')).toBe('choice3');
  expect(resolveInput('dialogue', 'KeyW')).toBeUndefined();
  expect(resolveInput('minigame', 'Mouse0')).toBe('primary');
  expect(resolveInput('explore', 'Mouse0')).toBeUndefined();
});

test('every layer can always pause / exit with Escape', () => {
  for (const layer of Object.values(INPUT_MAP))
    expect(layer.Escape).toBe('pause');
});

test('held actions give movement axes; presses are edge-triggered', () => {
  const input = new InputState();
  input.down('KeyW');
  input.down('KeyD');
  expect(input.axes()).toEqual({ forward: 1, right: 1 });
  input.down('KeyS');
  expect(input.axes().forward).toBe(0);
  input.down('KeyV');
  input.down('KeyV'); // key repeat must not toggle twice
  expect(input.consume('toggleCamera')).toBe(true);
  expect(input.consume('toggleCamera')).toBe(false);
  input.up('KeyW');
  input.up('KeyS');
  expect(input.axes().forward).toBe(0);
});

test('releasing one of two keys bound to the same action keeps it held', () => {
  const input = new InputState();
  input.down('ShiftLeft');
  input.down('ShiftRight');
  input.up('ShiftLeft');
  expect(input.isHeld('sprint')).toBe(true);
  input.up('ShiftRight');
  expect(input.isHeld('sprint')).toBe(false);
});

test('changing context clears held keys so nothing leaks between layers', () => {
  const input = new InputState();
  input.down('KeyW');
  input.setContext('dialogue');
  expect(input.isHeld('moveForward')).toBe(false);
  expect(input.down('KeyW')).toBeUndefined();
});
