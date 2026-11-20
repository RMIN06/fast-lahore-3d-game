import { useWorldStore } from '../state/world-store';

/** Entry transition (M7): a short fade whenever you enter or leave a block. */
export function EntryFade() {
  const building = useWorldStore((s) => s.location.buildingId);
  return (
    <div key={building ?? 'outdoors'} className="entry-fade" aria-hidden />
  );
}
