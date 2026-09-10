import { cpSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

const document = (id: string, type: string, body: string): string =>
  `---\nid: ${id}\ntype: ${type}\ndescription: Fixture ${type}\ntags: [fixture]\nload: on-demand\n---\n\n${body}\n`;

/** Authoring inputs only. Expected delivered paths/bodies below are stated independently. */
function writeCustomization(root: string): void {
  for (const [type, dir, prefix] of [
    ["rule", "rules", "stamity-"],
    ["command", "commands", "st-"],
    ["agent", "agents", "stamity-"],
    ["skill", "skills", "st-"],
  ] as const) {
    const pathFor = (layer: string, id: string): string =>
      join(root, layer, dir, type === "skill" ? `${id}/SKILL.md` : `${id}.md`);
    for (const operation of ["source", "replace", "patch"]) {
      const id = `${operation}-${type}`;
      write(pathFor("content", `${prefix}${id}`), document(id, type, `Original ${id}.`));
    }
    // A direct edit remains an authoring route independently of the fork layer.
    write(pathFor("content", `${prefix}source-${type}`), document(`source-${type}`, type, `Source edit ${type}.`));
    for (const operation of ["add", "replace"]) {
      const id = `${operation}-${type}`;
      write(pathFor("fork", id), document(id, type, `Fork ${operation} ${type}.`));
    }
    const patch = pathFor("fork", `patch-${type}`).replace(/\.md$/, ".customize");
    write(`${patch}.md`, `Patch witness ${type}.\n`);
    write(`${patch}.yaml`, `description: Patched ${type}\n`);
  }
  write(join(root, "content/skills/st-replace-skill/references/upstream.txt"), "Must not survive full replacement.\n");
  write(join(root, "content/skills/st-patch-skill/references/base.txt"), "Retained patch companion.\n");
  write(join(root, "fork/skills/replace-skill/references/own.txt"), "Replacement companion.\n");
  write(join(root, "fork/skills/add-skill/references/own.txt"), "Addition companion.\n");
  write(join(root, "fork/skills/add-skill/assets/data.bin"), Buffer.from([0, 255, 128, 65, 10]));
  // Consumer overrides must never become package-authoring inputs.
  write(join(root, ".stamity/overrides/rules/source-rule.md"), document("source-rule", "rule", "Consumer-only body."));
}

export function write(path: string, bytes: string | Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}

/** A real source checkout with the real catalog/dependencies, isolated from the working tree. */
export function downstreamCheckout(root: string): void {
  mkdirSync(root, { recursive: true });
  for (const path of ["src", "scripts", "assets"]) cpSync(join(ROOT, path), join(root, path), { recursive: true });
  write(join(root, "package.json"), readFileSync(join(ROOT, "package.json")));
  symlinkSync(join(ROOT, "node_modules"), join(root, "node_modules"), "junction");
  writeCustomization(root);
}

// No catalog, generator, or .apm reads produce this oracle. Each authored operation has a
// separately declared consumer identity and body, reusable by the real install proof.
export const EXPECTED_PRIMITIVES = [
  ["instructions/stamity-source-rule.instructions.md", "\nSource edit rule.\n"],
  ["instructions/stamity-add-rule.instructions.md", "\nFork add rule.\n"],
  ["instructions/stamity-replace-rule.instructions.md", "\nFork replace rule.\n"],
  ["instructions/stamity-patch-rule.instructions.md", "\nOriginal patch-rule.\n\nPatch witness rule.\n"],
  ["prompts/st-source-command.prompt.md", "\nSource edit command.\n"],
  ["prompts/st-add-command.prompt.md", "\nFork add command.\n"],
  ["prompts/st-replace-command.prompt.md", "\nFork replace command.\n"],
  ["prompts/st-patch-command.prompt.md", "\nOriginal patch-command.\n\nPatch witness command.\n"],
  ["agents/stamity-source-agent.agent.md", "\nSource edit agent.\n"],
  ["agents/stamity-add-agent.agent.md", "\nFork add agent.\n"],
  ["agents/stamity-replace-agent.agent.md", "\nFork replace agent.\n"],
  ["agents/stamity-patch-agent.agent.md", "\nOriginal patch-agent.\n\nPatch witness agent.\n"],
  ["skills/st-source-skill/SKILL.md", "\nSource edit skill.\n"],
  ["skills/add-skill/SKILL.md", "\nFork add skill.\n"],
  ["skills/st-replace-skill/SKILL.md", "\nFork replace skill.\n"],
  ["skills/st-patch-skill/SKILL.md", "\nOriginal patch-skill.\n\nPatch witness skill.\n"],
] as const;
