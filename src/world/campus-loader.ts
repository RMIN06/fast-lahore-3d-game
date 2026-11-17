import { validateCampus } from '../systems/campus-validation';
import type {
  ValidationOptions,
  ValidationIssue,
} from '../systems/campus-validation';
import type { Campus } from '../types/campus';

export interface LoadedCampus {
  campus: Campus;
  warnings: ValidationIssue[];
}

export function loadCampus(
  input: unknown,
  options: ValidationOptions = {},
): LoadedCampus {
  const result = validateCampus(input, options);
  const errors = result.issues.filter((issue) => issue.severity === 'error');
  if (!result.campus || errors.length) {
    throw new Error(
      `Campus validation failed:\n${errors.map((issue) => `${issue.path}: [${issue.code}] ${issue.message}`).join('\n')}`,
    );
  }
  return { campus: result.campus, warnings: result.issues };
}

export function loadCampusJson(
  text: string,
  options: ValidationOptions = {},
): LoadedCampus {
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Campus JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return loadCampus(input, options);
}
