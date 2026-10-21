/**
 * The trigger domain each of the EIGHT shipped core skills owns exclusively — one
 * phrase per skill that appears in its own description and in no other's.
 *
 * The four-skill cases in `flow.test.ts` hold the flow lane apart; this table is the wider
 * anti-shadowing property, and it is the one the redesigned onboard has to
 * clear: its trigger domain is "the first run in a repo that was just set up",
 * which sits next to the work touchpoint and the QA lane and must not overlap
 * either. A phrase that leaks into a second description makes the two skills
 * compete for one trigger, and the loser is silently never invoked.
 *
 * One table, read by the core roster (`flow.test.ts`) and by every pack whose skills sit in
 * the same listing (`test/packs/frontend.test.ts`), so a row added here binds both
 * (u13-frontend-move, review/25).
 */
export const TRIGGER_DOMAINS: readonly { id: string; relPath: string; phrase: RegExp }[] = [
  { id: "onboard", relPath: "skills/st-onboard/SKILL.md", phrase: /first proven change/i },
  { id: "handoff", relPath: "skills/st-handoff/SKILL.md", phrase: /handoff/i },
  { id: "qa", relPath: "skills/st-qa/SKILL.md", phrase: /walk-through/i },
  { id: "verify", relPath: "skills/st-verify/SKILL.md", phrase: /content-quality axis/i },
  { id: "dep-audit", relPath: "skills/st-dep-audit/SKILL.md", phrase: /dependency audit/i },
  { id: "learn", relPath: "skills/st-learn/SKILL.md", phrase: /learnings/i },
  // Added 2026-10-15 (u9-unattended-skill): the ninth skill, called by name from a run whose
  // record reads `Mode: unattended`; no other description may name an unattended run.
  { id: "unattended", relPath: "skills/st-unattended/SKILL.md", phrase: /unattended/i },
  // Added in plan 018 file 2 (u9-st-plain, REQ-FLOW-129): the eighth core skill, model-invocable,
  // so its phrase sits in Codex's shown list beside every other; no other description may ask for
  // plain words.
  { id: "plain", relPath: "skills/st-plain/SKILL.md", phrase: /plain words/i },
];
