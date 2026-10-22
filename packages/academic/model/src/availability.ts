import type { Availability, Available } from './types.ts'

/**
 * Reports whether an availability record contains a usable value.
 *
 * @param availability - Availability record to inspect.
 * @returns Whether the record has the `available` status.
 */
export function isAvailable<T>(availability: Availability<T>): availability is Available<T> {
  return availability.status === 'available'
}
