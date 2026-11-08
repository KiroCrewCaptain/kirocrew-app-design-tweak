/**
 * The project-path and dev-server URL fields carry an accessible name, not just a
 * placeholder. Ported from the built-in's `DesignTweakInputNames.a11y.test.ts`, with
 * the dashboard's shared scan (`website/src/test/inputAccessibleNames.ts`) inlined.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/** Every `<input …>` opening tag in a source file, comments stripped first. */
function inputTags(absPath: string): string[] {
  const s = fs.readFileSync(absPath, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  const tags: string[] = []
  let i = 0
  while ((i = s.indexOf('<input', i)) >= 0) {
    let j = i + 6
    let depth = 0
    for (; j < s.length; j++) {
      const c = s[j]
      if (c === '{') depth++
      else if (c === '}') depth--
      else if (c === '>' && depth === 0) break
    }
    tags.push(s.slice(i, j + 1))
    i = j
  }
  return tags
}

/** Text-input tags with no `aria-label`, `aria-labelledby` or `id` (for a `<label htmlFor>`). */
function unnamedTextInputs(absPath: string): string[] {
  return inputTags(absPath).filter(tag =>
    !/type=["'](hidden|checkbox|radio|file|submit|range|color)["']/.test(tag)
    // A spread of the caller's props may carry the name; a handler spread
    // such as `{...ime.bindEnter(...)}` cannot.
    && !/aria-label|aria-labelledby|\bid=|\{\.\.\.(props|rest|inputProps)\b/.test(tag))
}

describe('Design Tweak text inputs have an accessible name', () => {
  it('DesignTweakPage.tsx names every text input', () => {
    const page = path.join(__dirname, '..', 'src', 'DesignTweakPage.tsx')
    expect(inputTags(page).length).toBeGreaterThan(0)
    expect(unnamedTextInputs(page)).toEqual([])
  })
})
