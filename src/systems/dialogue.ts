import type { DialogueTree } from './task-schema';

// M10 dialogue runner: scripted JSON trees, no AI (GAMEPLAY_SPEC §8).
// Options 1–9 choose; an option either moves to another node or ends the
// dialogue with an outcome the task engine reacts to.

/** Fill {name} style variables; unknown ones are left as they are. */
export const fill = (text: string, vars: Record<string, string>) =>
  text.replace(/\{(\w+)\}/g, (all, key: string) => vars[key] ?? all);

export class DialogueRunner {
  node: string;
  outcome?: string;
  /** Every node visited, for tests and the dev overlay. */
  readonly path: string[] = [];

  constructor(
    readonly tree: DialogueTree,
    readonly vars: Record<string, string> = {},
  ) {
    this.node = tree.start;
    this.path.push(tree.start);
  }

  get current() {
    const n = this.tree.nodes[this.node]!;
    return {
      speaker: fill(n.speaker, this.vars),
      text: fill(n.text, this.vars),
      options: n.options.map((o) => fill(o.text, this.vars)),
    };
  }

  get done() {
    return this.outcome !== undefined;
  }

  /** Choose option `index` (0-based). Returns the outcome when it ends. */
  choose(index: number): string | undefined {
    if (this.done) return this.outcome;
    const option = this.tree.nodes[this.node]!.options[index];
    if (!option) return undefined;
    if (option.end !== undefined) this.outcome = option.end;
    else {
      this.node = option.next!;
      this.path.push(this.node);
    }
    return this.outcome;
  }
}

/** Problems with a tree: unknown start/next nodes, unreachable nodes, no end. */
export function dialogueProblems(tree: DialogueTree): string[] {
  const out: string[] = [];
  const ids = new Set(Object.keys(tree.nodes));
  if (!ids.has(tree.start)) out.push(`start "${tree.start}" is not a node`);
  const seen = new Set<string>();
  const queue = ids.has(tree.start) ? [tree.start] : [];
  let ends = 0;
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    tree.nodes[id]!.options.forEach((o, i) => {
      if (o.end !== undefined) ends += 1;
      else if (!ids.has(o.next!))
        out.push(`${id}.options.${i}: next "${o.next}" is not a node`);
      else queue.push(o.next!);
    });
  }
  for (const id of ids)
    if (!seen.has(id)) out.push(`node "${id}" is unreachable`);
  if (!ends) out.push('no option ends the dialogue');
  return out;
}

/** Outcomes a tree can end with. */
export const dialogueOutcomes = (tree: DialogueTree) =>
  new Set(
    Object.values(tree.nodes).flatMap((n) =>
      n.options.flatMap((o) => (o.end !== undefined ? [o.end] : [])),
    ),
  );

/**
 * Option indexes (0-based) that reach an ending with `want` (or any ending
 * other than "leave"), choosing correct quiz answers; shortest path first.
 */
export function solveDialogue(
  tree: DialogueTree,
  want?: string,
): number[] | undefined {
  const queue: { node: string; path: number[] }[] = [
    { node: tree.start, path: [] },
  ];
  const seen = new Set<string>();
  let fallback: number[] | undefined;
  while (queue.length) {
    const { node, path } = queue.shift()!;
    if (seen.has(node)) continue;
    seen.add(node);
    const options = tree.nodes[node]?.options ?? [];
    for (const [i, o] of options.entries()) {
      if (o.end !== undefined) {
        if (o.end === (want ?? 'done')) return [...path, i];
        if (o.end !== 'leave') fallback ??= [...path, i];
      } else queue.push({ node: o.next!, path: [...path, i] });
    }
  }
  return want ? undefined : fallback;
}
