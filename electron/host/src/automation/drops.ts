/**
 * Surfaces dropped from this milestone. CLI convert only wrote `.fig`.
 * Export no longer writes FIG. Import no longer writes `.fig`.
 * `pen` is the default export format, and `json` stays.
 */
export const DROP_LIST = ['CLI convert', 'FIG export', '.fig import'] as const

export const EXPORT_FORMATS = ['pen', 'json'] as const

export const DEFAULT_EXPORT_FORMAT = 'pen' satisfies (typeof EXPORT_FORMATS)[number]
