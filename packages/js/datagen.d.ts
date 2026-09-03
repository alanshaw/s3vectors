import type { DataSpec } from './index.js'

export type DerivedField =
  | 'size' | 'md5' | 'etag' | 'sha256' | 'sha256B64' | 'sha1B64'
  | 'crc32B64' | 'crc32cB64' | 'crc64nvmeB64'

/** The fields available as `${data.<name>.<field>}` placeholders. */
export const DERIVED_FIELDS: readonly DerivedField[]

/** Materialize one named dataset from a vector's `data` map. */
export function generate (specs: Record<string, DataSpec>, name: string): Buffer

/** Compute the string a `${data.<name>.<field>}` placeholder resolves to. */
export function derived (specs: Record<string, DataSpec>, name: string, field: DerivedField): string
