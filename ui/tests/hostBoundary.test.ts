/**
 * What the bundle asks of the host, and how it reads the answers.
 *
 * Every request goes through the host's scoped client: a path the manifest does
 * not declare is refused before it is sent. A chat send is one
 * `POST /api/chat?ws=1` whose answer is read as a receipt; only a confirmed
 * acceptance resolves, because the caller acknowledges delivery on resolution.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import manifest from '../../app.json'
import { currentAppApi } from '../src/appApi'
import { fetchHealth, sendChatMessage } from '../src/api'
import { SEND_REFUSED } from '../src/sendTurn'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the scoped client', () => {
  it('declares only this app\'s backend and the host chat endpoints', () => {
    expect(manifest.permissions.api).toEqual([
      '/apps/design-tweak/api',
      '/apps/design-tweak/api/*',
      // A bare entry is a prefix grant: it covers /api/chat/slots/* as well.
      '/api/chat',
    ])
  })

  it('refuses an undeclared host path before any request leaves', async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)
    await expect(currentAppApi().raw('/api/config')).rejects.toThrow(/not permitted/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reaches this app\'s backend through the gateway proxy path', async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => new Response(JSON.stringify({ status: 'ok', dataDir: '/d' })))
    vi.stubGlobal('fetch', fetchMock)
    expect(await fetchHealth()).toEqual({ status: 'ok', dataDir: '/d' })
    expect(fetchMock.mock.calls[0][0]).toBe('/apps/design-tweak/api/health')
  })
})

describe('the chat send wire', () => {
  it('posts the message and the slot to /api/chat?ws=1', async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) => new Response(JSON.stringify({ ok: true })))
    vi.stubGlobal('fetch', fetchMock)
    await sendChatMessage('hello', 'design-tweak-abc')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/chat?ws=1')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ message: 'hello', slot: 'design-tweak-abc' })
  })

  it('resolves on a queued receipt', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ queued: true }))))
    await expect(sendChatMessage('m', 's')).resolves.toBeUndefined()
  })

  it('names a server refusal as one, with the server\'s reason', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'slot is busy' }), { status: 409 })))
    const err = (await sendChatMessage('m', 's').catch((e: unknown) => e)) as Error
    expect(err.name).toBe(SEND_REFUSED)
    expect(err.message).toBe('slot is busy')
  })

  it('does not resolve a 2xx whose body cannot be read', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 200 })))
    const err = (await sendChatMessage('m', 's').catch((e: unknown) => e)) as Error
    expect(err).toBeInstanceOf(Error)
    expect(err.name).not.toBe(SEND_REFUSED)
  })

  it('does not resolve when no response came back', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    const err = (await sendChatMessage('m', 's').catch((e: unknown) => e)) as Error
    expect(err).toBeInstanceOf(Error)
    expect(err.name).not.toBe(SEND_REFUSED)
  })
})
