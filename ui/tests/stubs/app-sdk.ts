/**
 * A light stand-in for the host's `@kirocrew/app-sdk`.
 *
 * Only the names the bundle uses, with the host's documented behaviour where a
 * test depends on it: `useAppApi().raw` is the scoped client over the global
 * `fetch` (a test stubs `fetch`), refusing a path outside the manifest's
 * `permissions.api` and throwing `{status, body}` on a non-2xx. The `stub*` /
 * `resetStubSdk` exports are test controls; no host module has them.
 */

import type { KeyboardEvent } from 'react'
import type { AppApi } from '@kirocrew/app-sdk'
import manifest from '../../../app.json'

let locale = 'en'

/** The host's active language for the next lookups. */
export function stubLocale(next: string): void {
  locale = next
}

export function resetStubSdk(): void {
  locale = 'en'
}

export function activeLocale(): string {
  return locale
}

export function useLanguageGeneration(): number {
  return 0
}

export function fmtRelative(value: Date | string | number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  const secs = Math.round((d.getTime() - Date.now()) / 1000)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'narrow' })
  const abs = Math.abs(secs)
  if (abs < 60) return rtf.format(secs, 'second')
  if (abs < 3600) return rtf.format(Math.round(secs / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(secs / 3600), 'hour')
  return rtf.format(Math.round(secs / 86400), 'day')
}

const DECLARED: string[] = manifest.permissions.api

function allowed(path: string): boolean {
  const normalized = new URL(path, 'http://localhost').pathname
  return DECLARED.some(pattern => {
    if (pattern.endsWith('/*')) {
      const base = pattern.slice(0, -2)
      return normalized === base || normalized.startsWith(base + '/')
    }
    return normalized === pattern || normalized.startsWith(pattern + '/')
  })
}

/** The scoped client's non-2xx, as the host throws it. */
export class StubAppApiError extends Error {
  constructor(readonly status: number, readonly body: string) {
    super(`API ${status}: ${body}`)
    this.name = 'AppApiError'
  }
}

async function raw(path: string, init?: RequestInit): Promise<Response> {
  if (!allowed(path)) throw new Error(`[app-sdk] not permitted to access ${path}`)
  const res = await fetch(path, init)
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new StubAppApiError(res.status, text)
  }
  return res
}

const unused = () => Promise.reject(new Error('stub app-sdk: this app only uses raw()'))

const API: AppApi = { raw, request: unused, get: unused, post: unused, put: unused, del: unused }

export function useAppApi(): AppApi {
  return API
}

/** The host's router hop; a test that checks it replaces this hook with `vi.mock`. */
export function useNavigate(): (path: string) => void {
  return () => {}
}

export function useImeGuard() {
  return {
    bindEnter: ({ onEnter, onEscape }: { onEnter?: () => void; onEscape?: () => void }) => ({
      onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.nativeEvent.isComposing) return
        if (e.key === 'Enter') {
          e.preventDefault()
          onEnter?.()
        } else if (e.key === 'Escape') {
          onEscape?.()
        }
      },
    }),
  }
}
