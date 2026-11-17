import { create } from 'zustand';

export const useMetricsStore = create(() => ({
  fps: 0,
  calls: 0,
  triangles: 0,
}));
