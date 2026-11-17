import { create } from 'zustand';

interface DebugState {
  spinCube: boolean;
  setSpinCube: (spinCube: boolean) => void;
}

export const useDebugStore = create<DebugState>((set) => ({
  spinCube: true,
  setSpinCube: (spinCube) => set({ spinCube }),
}));
