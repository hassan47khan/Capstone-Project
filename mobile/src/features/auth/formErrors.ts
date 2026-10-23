/**
 * Where a 400's messages go on an auth form (05 §9): under the fields they
 * name, or, when none of them is a field on this form (only
 * `non_field_errors`, or an empty `fields`), as the form banner, so the user
 * always sees why the request failed.
 */
import { fieldError, type ApiError } from '@/api/errors';

export interface FormErrors<K extends string> {
  fields: Partial<Record<K, string>>;
  banner?: string;
}

export function formErrorsFrom<K extends string>(
  error: ApiError,
  keys: readonly K[],
): FormErrors<K> {
  const fields: Partial<Record<K, string>> = {};
  for (const key of keys) {
    const message = fieldError(error, key);
    if (message) fields[key] = message;
  }
  return Object.keys(fields).length > 0 ? { fields } : { fields, banner: error.message };
}
