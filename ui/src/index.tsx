/**
 * The bundle's entry: AppHost lazy-imports this module and renders its default
 * export as the app's page.
 *
 * Subscribing to the host's language generation here is what repaints the page
 * on a language switch: `t` reads the active locale at call time, and this
 * component's re-render reaches every child. The host's scoped API client is
 * bound here too, before the page's first request (see `appApi.ts`).
 */

import { useAppApi, useLanguageGeneration } from '@kirocrew/app-sdk'
import { bindAppApi } from './appApi'
import DesignTweakPage from './DesignTweakPage'

export default function DesignTweakApp() {
  useLanguageGeneration()
  bindAppApi(useAppApi())
  return <DesignTweakPage />
}
