import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'
import { bindAppApi } from '../src/appApi'
import { resetStubSdk, useAppApi } from './stubs/app-sdk'

// jsdom has no PointerEvent, so `fireEvent.pointerDown` would build a bare Event
// with no `button`. The dashboard's own suite runs on happy-dom, which has it;
// this is the same constructor shape over MouseEvent.
if (typeof window !== 'undefined' && !('PointerEvent' in window)) {
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number
    readonly pointerType: string
    readonly isPrimary: boolean
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 0
      this.pointerType = init.pointerType ?? 'mouse'
      this.isPrimary = init.isPrimary ?? true
    }
  }
  ;(window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = PointerEventPolyfill
}

beforeEach(() => {
  // The page root binds the host's scoped client; a test that calls the API
  // module directly gets the stub's, which runs over the stubbed `fetch`.
  bindAppApi(useAppApi())
})

afterEach(() => {
  cleanup()
  resetStubSdk()
})
