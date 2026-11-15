// The dashboard's `i18n/format` `fmtList`, over the SDK's `activeLocale` (the
// dashboard helper is not part of the App SDK; this is its rule).
import { activeLocale } from '@kirocrew/app-sdk'

/**
 * Join natural-language parts the way the active language lists them, dropping
 * empty ones. Only for an enumeration shown to a reader; a technical list keeps
 * its literal separator.
 */
export function fmtList(
  items: readonly string[],
  options?: { type?: 'conjunction' | 'disjunction' | 'unit'; style?: 'long' | 'short' | 'narrow' },
): string {
  const type = options?.type ?? 'conjunction'
  const style = options?.style ?? 'long'
  return new Intl.ListFormat(activeLocale(), { localeMatcher: 'lookup', type, style })
    .format(items.filter((item) => item !== ''))
}
