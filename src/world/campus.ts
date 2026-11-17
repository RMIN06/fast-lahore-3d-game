import seed from '../../data/campus.seed.json';
import { loadCampus } from './campus-loader';

// M1 loads the supplied inventory; M2 will supply curated geometry in campus.json.
export const loadedCampus = loadCampus(seed, { mode: 'seed' });
