/**
 * `renderWithProviders`: what the page needs around it in a test. The host's
 * AppHost provides a react-query client to an installed app's page; here a
 * fresh one per render, with retries off so a refused request settles at once.
 */
import type React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderOptions } from '@testing-library/react'

export function renderWithProviders(
  ui: React.ReactElement,
  { queryDefaults, ...renderOptions }: { queryDefaults?: Record<string, unknown> } & Omit<RenderOptions, 'wrapper'> = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, ...queryDefaults } },
  })
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return { queryClient, ...render(ui, { wrapper: Wrapper, ...renderOptions }) }
}
