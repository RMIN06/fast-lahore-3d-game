import campusData from '../../data/campus.json';
import { loadCampus } from './campus-loader';

// M3 renders the accepted M2 site plan. Validation runs at load and fails loudly.
export const loadedCampus = loadCampus(campusData, { mode: 'site-plan' });
