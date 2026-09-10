/** OpenAlex adapter translating provider records into the shared academic model. */
export type {
  NormalizedOpenAlexWork,
  OpenAlexRawAuthorship,
  OpenAlexRawPrimaryLocation,
  OpenAlexRawWork,
} from './types.ts'
export { normalizeOpenAlexWork } from './normalize.ts'
