import type { z } from 'zod';
import type {
  campusSchema,
  confidenceSchema,
  vec2Schema,
  vec3Schema,
} from '../world/campus-schema';

export type Campus = z.infer<typeof campusSchema>;
export type Confidence = z.infer<typeof confidenceSchema>;
export type Vec2 = z.infer<typeof vec2Schema>;
export type Vec3 = z.infer<typeof vec3Schema>;
export type Building = Campus['buildings'][number];
export type Floor = Building['floors'][number];
export type Space = Floor['spaces'][number];
