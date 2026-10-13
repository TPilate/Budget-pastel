import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'vue/compiler-sfc'

// There is no component-test setup in this project (and Playwright needs the live
// database), so these pin the page's template wiring through its compiled AST.

const source = readFileSync(new URL('../../../app/pages/compte-rendu.vue', import.meta.url), 'utf-8')
const ast = parse(source).descriptor.template!.ast!

type Node = any

function walk(node: Node, visit: (node: Node) => void) {
  visit(node)
  for (const child of node.children ?? []) walk(child, visit)
}

function find(predicate: (node: Node) => boolean): Node[] {
  const found: Node[] = []
  walk(ast, (node) => { if (predicate(node)) found.push(node) })
  return found
}

const hasStaticAttr = (node: Node, name: string, value: string) =>
  (node.props ?? []).some((prop: Node) => prop.type === 6 && prop.name === name && prop.value?.content === value)

/** Text and {{ interpolations }} of a subtree, interpolations kept as `{{ expr }}`. */
function textOf(node: Node): string {
  let text = ''
  walk(node, (child) => {
    if (child.type === 2) text += child.content
    if (child.type === 5) text += `{{ ${child.content.content.trim()} }}`
  })
  return text.replace(/\s+/g, ' ')
}

describe('compte-rendu.vue template', () => {
  it('shows the unassigned tile to the cent, so 0,30 € never reads as 0 €', () => {
    const [tile] = find((node) => hasStaticAttr(node, 'data-testid', 'tile-unassigned'))
    expect(textOf(tile).trim()).toBe('{{ formatEuro(tiles.unassigned) }}')
  })

  it('recaps, in the confirmation modal, the total per savings goal and per destination', () => {
    const [modal] = find((node) => node.tag === 'UModal')
    const text = textOf(modal)

    const [goalLine] = find((node) => node.tag === 'li' && (node.props ?? []).some((prop: Node) =>
      prop.name === 'for' && prop.exp?.content.includes('tiles.perGoal')))
    expect(goalLine, 'one line per poche receiving leftovers').toBeDefined()
    expect(textOf(goalLine)).toContain('Vers {{ goal.name }} : {{ formatEuro(goal.amount) }}')

    expect(text).toContain('{{ formatEuro(tiles.carried) }}')
    expect(text).toContain('{{ formatEuro(tiles.savings) }}')
    expect(text).toContain('{{ formatEuro(tiles.other) }}')
    expect(text).toContain('{{ formatEuro(tiles.overspendDeducted) }}')
    expect(text).toContain('Dépassements déduits')

    // The per-envelope lines stay.
    expect(text).toContain('{{ line.label }} — {{ line.destination }}')
  })
})
