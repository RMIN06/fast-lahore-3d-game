import { useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useMetricsStore } from './metrics-store';

export default function MetricsSampler() {
  const [sample] = useState(() => ({ elapsed: 0, frames: 0 }));
  useFrame(({ gl }, delta) => {
    sample.elapsed += delta;
    sample.frames += 1;
    if (sample.elapsed >= 0.5) {
      // Counters describe the previous completed frame; publish twice per second.
      useMetricsStore.setState({
        fps: Math.round(sample.frames / sample.elapsed),
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
      });
      sample.elapsed = 0;
      sample.frames = 0;
    }
  });
  return null;
}
