/**
 * Types for the two host modules this bundle imports. They are not on npm: the
 * dashboard's import map serves them at runtime (`/vendor/*.mjs`), so only the
 * names this app uses are declared, with the shapes the App Kit documents.
 *
 * Every name here exists on a host before App Kit level 1 as well, so all of
 * them are named imports (a named import of a missing export would fail the
 * whole bundle at link time; `tests/test_manifest_contract.py` checks the built
 * file against that list).
 */

declare module '@kirocrew/app-sdk' {
  export interface AppApi {
    /** Unparsed 2xx response; a non-2xx throws an error carrying `status` and `body`. */
    raw(path: string, init?: RequestInit): Promise<Response>
    request<T = unknown>(path: string, init?: RequestInit): Promise<T>
    get<T = unknown>(path: string, init?: RequestInit): Promise<T>
    post<T = unknown>(path: string, body?: unknown, init?: RequestInit): Promise<T>
    put<T = unknown>(path: string, body?: unknown, init?: RequestInit): Promise<T>
    del<T = unknown>(path: string, init?: RequestInit): Promise<T>
  }

  /** A scoped non-2xx: `body` is the raw response text. */
  export interface AppApiError extends Error {
    readonly status: number
    readonly body: string
  }

  export interface ImeGuard {
    /** Spread onto an input: Enter calls `onEnter` unless an IME composition owns the key. */
    bindEnter(opts: { onEnter?: () => void; onEscape?: () => void }): Pick<
      import('react').InputHTMLAttributes<HTMLInputElement>,
      'onKeyDown' | 'onCompositionStart' | 'onCompositionEnd' | 'onFocus' | 'onBlur'
    >
  }

  export type RelativeStyle = 'long' | 'short' | 'narrow'

  export function useAppApi(): AppApi
  /** Navigate the host dashboard to a route of its own (`/chat?sid=…`). */
  export function useNavigate(): (path: string) => void
  export function useImeGuard(): ImeGuard
  export function useLanguageGeneration(): number
  export function activeLocale(): string
  export function fmtRelative(
    value: Date | string | number | null | undefined,
    options?: { style?: RelativeStyle; now?: Date | number; unit?: Intl.RelativeTimeFormatUnit },
  ): string
}

declare module '@kirocrew/app-sdk/ui' {
  import type { ComponentType, ForwardRefExoticComponent, HTMLAttributes, MouseEvent, KeyboardEvent, RefAttributes } from 'react'

  export const Clickable: ForwardRefExoticComponent<
    Omit<HTMLAttributes<HTMLDivElement>, 'role' | 'onClick'> & {
      onClick: (e?: MouseEvent | KeyboardEvent) => void
      disabled?: boolean
    } & RefAttributes<HTMLDivElement>
  >

  export const ErrorNotice: ComponentType<{
    message?: string | null
    title?: string
    variant?: 'block' | 'inline'
    messagePlacement?: 'beside' | 'below'
    onDismiss?: () => void
    dismissLabel?: string
    className?: string
    /** Offer the "ask the agent" hand-off (only where no typed text is unsaved). */
    askAgent?: boolean
  }>
}
