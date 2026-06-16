/**
 * Result pattern (dayuse-vibes rule 7). Business errors are values, not thrown.
 */
export type Result<T, E = Error> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: E };

export const ok = <T>(data: T): Result<T, never> => ({ success: true, data });

export const err = <E>(error: E): Result<never, E> => ({ success: false, error });

export const isOk = <T, E>(r: Result<T, E>): r is { success: true; data: T } => r.success;
