import { create } from 'zustand';

export interface Location {
  buildingId?: string;
  buildingLabel?: string;
  floorId?: string;
  floorLabel?: string;
  spaceId?: string;
  roomCode?: string;
  roomName?: string;
}

interface WorldState {
  location: Location;
  /** Buildings whose interiors are currently streamed in. */
  activeInteriors: string[];
  setLocation: (location: Location) => void;
  setActiveInteriors: (ids: string[]) => void;
}

const same = (a: Location, b: Location) =>
  a.buildingId === b.buildingId &&
  a.floorId === b.floorId &&
  a.spaceId === b.spaceId;

export const useWorldStore = create<WorldState>((set, get) => ({
  location: {},
  activeInteriors: [],
  setLocation: (location) => {
    if (!same(get().location, location)) set({ location });
  },
  setActiveInteriors: (ids) => {
    const current = get().activeInteriors;
    if (ids.length !== current.length || ids.some((id, i) => id !== current[i]))
      set({ activeInteriors: ids });
  },
}));

/** "F · 2nd Floor · NB-201" style text for the HUD. */
export const locationLabel = (l: Location) =>
  !l.buildingId
    ? 'Outdoors'
    : [
        `${l.buildingId} · ${l.buildingLabel}`,
        l.floorLabel,
        l.roomCode
          ? `${l.roomCode} ${l.roomName !== l.roomCode ? l.roomName : ''}`.trim()
          : l.roomName,
      ]
        .filter(Boolean)
        .join(' · ');
