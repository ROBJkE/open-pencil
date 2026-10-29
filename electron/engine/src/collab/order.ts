/**
 * Fractional sibling order. Printable ASCII keys sort with string comparison, and a new key
 * fits between two neighbours. A short random suffix keeps concurrent inserts in the same gap
 * from landing on one key.
 */

const ORDER_KEY_MIN = 33 // '!'
const ORDER_KEY_MAX = 126 // '~'
const ORDER_KEY_MID = 'O'
const KEY_SUFFIX_LENGTH = 3
const KEY_SUFFIX_RANGE = ORDER_KEY_MAX - ORDER_KEY_MIN + 1

function keyBetween(lo: string | null, hi: string | null): string | null {
  if (lo !== null && hi !== null && lo >= hi) return null
  const low = lo ?? ''
  const high = hi ?? ''
  let index = 0
  while (index < low.length && index < high.length && low[index] === high[index]) index += 1
  const lower = index < low.length ? low.charCodeAt(index) : ORDER_KEY_MIN - 1
  const upper = hi !== null && index < high.length ? high.charCodeAt(index) : ORDER_KEY_MAX + 1
  if (upper - lower > 1) {
    return low.slice(0, index) + String.fromCharCode(Math.floor((lower + upper) / 2))
  }
  if (index < low.length) {
    return low.slice(0, index + 1) + (keyBetween(low.slice(index + 1), null) ?? ORDER_KEY_MID)
  }
  const rest = hi?.slice(index + 1) ?? ''
  if (!hi || rest === '') return null
  return hi.slice(0, index + 1) + (keyBetween(null, rest) ?? '')
}

function keyWithSuffix(lo: string | null, hi: string, suffix: string): string | null {
  for (let key = keyBetween(lo, hi); key !== null; key = keyBetween(key, hi)) {
    if (key + suffix < hi) return key + suffix
    if (!hi.startsWith(key)) return null
  }
  return null
}

/** A key strictly between `lo` and `hi` when the alphabet has one. Either bound may be open. */
export function orderKeyBetween(lo: string | null, hi: string | null, suffix = ''): string {
  const key = keyBetween(lo, hi)
  if (key === null) return (keyBetween(lo, null) ?? ORDER_KEY_MID) + suffix
  if (!suffix) return key
  if (hi === null) return key + suffix
  return keyWithSuffix(lo, hi, suffix) ?? key
}

/** Printable suffix from `crypto.getRandomValues`, so two peers inserting together differ. */
export function randomKeySuffix(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(KEY_SUFFIX_LENGTH))
  let suffix = ''
  for (const byte of bytes) {
    suffix += String.fromCharCode(ORDER_KEY_MIN + (byte % KEY_SUFFIX_RANGE))
  }
  return suffix
}

/** The order key that lands at `index` among `keys`, which do not include the node being placed. */
export function orderKeyAt(keys: readonly string[], index: number): string {
  const at = Math.min(Math.max(0, Math.trunc(index)), keys.length)
  const before = at === 0 ? null : keys[at - 1]
  const after = at === keys.length ? null : keys[at]
  return orderKeyBetween(before, after, randomKeySuffix())
}
