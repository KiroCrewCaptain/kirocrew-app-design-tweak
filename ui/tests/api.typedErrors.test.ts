/**
 * The Design Tweak client surfaces a refusal as its typed error. Ported from the
 * built-in's `website/src/apps/design-tweak/api.typedErrors.test.ts`; the case that
 * relabels a tunnel-edge 429 is the dashboard's shared `toApiError` and is not
 * carried (`src/appApi.ts` keeps the server's own sentence, PORTING.md "UI").
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../src/appApi'
import { api } from '../src/api'

/** A refusal whose body is the JSON envelope the backend actually sends. */
const REFUSAL = JSON.stringify({ error: 'path is outside the sandbox' })

const refuse = (status = 403, body = REFUSAL) =>
  vi.fn(async (..._args: unknown[]) => new Response(body, { status }))

describe('the Design Tweak client surfaces refusals as ApiError', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is typed, status-bearing, and carries the unwrapped message', async () => {
    vi.stubGlobal('fetch', refuse())
    await expect(api.get('/apps/design-tweak/api/projects')).rejects.toThrow(ApiError)
    const e = (await api.get('/apps/design-tweak/api/projects').catch((err: unknown) => err)) as ApiError
    expect(e.status).toBe(403)
    // The human message, not the envelope: this is what a toast renders.
    expect(e.message).toBe('path is outside the sandbox')
    expect(e.message).not.toContain('{"error"')
    // The envelope stays reachable for a caller that wants structured fields.
    expect(e.body).toBe(REFUSAL)
  })

  it('keeps the HTTP <status> fallback for an empty body', async () => {
    vi.stubGlobal('fetch', refuse(500, ''))
    const e = (await api.get('/apps/design-tweak/api/projects').catch((err: unknown) => err)) as ApiError
    expect(e).toBeInstanceOf(ApiError)
    expect(e.message).toBe('HTTP 500')
  })
})
