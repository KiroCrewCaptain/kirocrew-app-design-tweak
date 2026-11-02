/**
 * The host's scoped HTTP client, and this app's typed refusal.
 *
 * `useAppApi()` is a hook, but the page reaches the API from event handlers and
 * timers as well as from render, through the `designCritiqueApi` object. The
 * root component therefore binds the client it got from the host once
 * (`bindAppApi`), and every request reads it back here. One page mounts one
 * bundle, so there is exactly one binding.
 */
import type { AppApi } from '@kirocrew/app-sdk'

let bound: AppApi | null = null

/** Called by the page root with `useAppApi()`. */
export function bindAppApi(api: AppApi): void {
  bound = api
}

export function currentAppApi(): AppApi {
  if (!bound) throw new Error('design-tweak: the host API is not bound yet')
  return bound
}

/** A refused request: the HTTP status, the raw body, and a readable message. */
export class ApiError extends Error {
  readonly status: number
  readonly body: string
  constructor(status: number, message: string, body = '') {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

/** The server's own sentence for a refusal (`{"error": "..."}`), else `HTTP <status>`. */
export function friendlyErrText(status: number, body: string): string {
  try {
    const parsed: unknown = JSON.parse(body)
    if (parsed && typeof parsed === 'object') {
      const err = (parsed as { error?: unknown; message?: unknown }).error ?? (parsed as { message?: unknown }).message
      if (typeof err === 'string' && err.trim()) return err.trim()
    }
  } catch {
    // Not JSON: fall through to the plain-text rule.
  }
  const text = body.trim()
  if (text && text.length <= 200 && !text.startsWith('<')) return text
  return `HTTP ${status}`
}

/** The scoped client's non-2xx (it carries `status` and `body`) as an `ApiError`;
 *  anything else (a network failure, an abort) is returned unchanged. */
export function toApiError(e: unknown): unknown {
  const status = (e as { status?: unknown } | null)?.status
  if (typeof status !== 'number') return e
  const body = String((e as { body?: unknown }).body ?? '')
  return new ApiError(status, friendlyErrText(status, body), body)
}
