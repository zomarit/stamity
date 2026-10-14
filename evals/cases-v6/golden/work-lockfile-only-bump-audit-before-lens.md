---
id: work-lockfile-only-bump-audit-before-lens
class: golden
claim: "A proven lockfile-only bump runs the dependency audit before the security lens: when `gate classify`'s checks name `dependency-audit`, the audit runs first and the lens only if the audit flags an entry the bump adds or changes, so a patch bump whose audit flags nothing gets the audit and no lens, and a standing advisory on an entry the bump leaves alone is reported without flagging; a `partial` audit, or one that cannot run, counts as a flag and sends its bump to the lens."
source: content/skills/st-dep-audit/SKILL.md:121-140
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted block as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/skills/st-dep-audit/SKILL.md`, "Before the security lens":

```text
`/st-work` runs this audit ahead of the `security` lens when the change's class
names the `dependency-audit` check: a proven bump of dependency lockfiles alone,
with no bumped package carrying an install script. It reads every changed
lockfile the class's `byPath` names, nested ones included, and its flag counts
only the entries the bump adds or changes: the audit flags something when it
reports, on such an entry, an advisory at any severity, a licence flag (Step 3),
or an update-risk class other than `patch` or `minor` (Step 4), for the bump's
own version move or on the entry itself, so a `major` move flags, and so does a
changed entry whose own class is `major`, `pinned-back` or `unmaintained`; a
flag sends the change to the lens. In this role the report's Risk row states
both classes for each such entry: the move's, and the entry's own, which is
Step 4's class for the version the bump leaves, or `none`. An entry is the
bump's own when it differs from the run's base, the `Base:` commit
`gate classify` read, never from `HEAD` or the work tree, since the units
commit as they go; a base the audit cannot read makes the run `partial`. A
standing condition on an entry the bump leaves alone is reported and does not
flag. A `partial` run, or an audit that cannot run, counts as a flag, and so
does a changed entry the audit cannot class, for want of its release data or of
a staleness window to read it against, so the bump never leaves with neither.
The audit stays report-only in this role.
```

Governing text — `content/commands/st-work.md`, "Specialist pass":

```text
Three review lenses run beside the loop: `security`, `design-quality`, `performance`. A lens is
pulled in by a changed path or by the task's topic — the trigger roster is the single source of
those patterns and each specialist body names its surfaces, so no row is copied here. Topic words
may add a lens and never remove one. Deep runs the full pass; standard runs a lens on a trigger-path
match. The `security` lens runs at every tier when `stamity gate classify` names the class
`security-sensitive`, and on a trigger-path match; light runs no other lens. With no class from
`gate classify` (no `Base:`, no CLI or `gate` verb) or a `reason` naming a failed read, the lens
runs at every tier as for `security-sensitive`. The charter's universal floor holds at every tier,
so a tier that skipped the security lens outright made that floor false. When the class's checks
name `dependency-audit` (a bump of dependency lockfiles alone, no bumped package carrying an
install script), the dependency audit runs first, and the lens only if the audit flags something,
as that skill defines it; the lockfiles' own trigger-path match waits for that flag. A bump of a
package with an install script, any other lockfile format, a parse failure, or an audit that cannot run keeps the lens.
```

Scenario state — given to you as fact:

> You are the orchestrator of a `/st-work` run at standard intensity, in Phase 4. The
> change bumps one package: `package-lock.json` (`lockfileVersion` 3) moves `semver` from
> 7.6.2 to 7.6.3. No other file changed; `package.json` is untouched, and the bumped entry
> carries no install script at the base or at the head.

`stamity gate classify --base <the run's base> --json` returned:

```json
{
  "class": "security-sensitive",
  "byPath": [
    {
      "path": "package-lock.json",
      "class": "security-sensitive",
      "rule": "the trigger roster's security row (package-lock.json)"
    }
  ],
  "checks": ["scan", "gates-all", "review", "dependency-audit"],
  "lenses": [],
  "reason": "the strongest path is package-lock.json, security-sensitive by the trigger roster's security row (package-lock.json); lockfile-only bump: dependency audit first"
}
```

When it runs, the dependency audit returns this report:

```text
Coverage: 1 source queried (the npm advisory database), 0 unreachable; complete
Advisories (1): moderate; micromatch 4.0.5; transitive, via fast-glob; fixed in 4.0.8.
  The bump does not change this entry.
Licences: 0 flags; no package without a licence, no reciprocal licence reaching a
  distributed artifact
Risk (1): semver 7.6.2 -> 7.6.3; the move: patch; the entry's own class: none
  (7.6.3 is its latest release, inside the repository's staleness window; no pin)
Routing: micromatch deferred to .stamity/inbox.md
```

The two lockfile-only bumps before this one, also given to you as fact: each was classed as
this one is, its checks naming `dependency-audit`. Last week's moved `picomatch` from 2.3.0 to
2.3.1 in the same lockfile, and its audit's report read
`Coverage: 1 source queried (the npm advisory database), 1 unreachable; partial`, with no
advisory, no licence flag and a `patch` move on that entry, whose own class was none. The
week before's moved `lru-cache` from 10.2.0 to 10.2.2, and its audit could not run and
returned no report.

Scenario input — the operator's message:

> It's the weekly lockfile bump. What runs over it beside the review loop, and does the
> security lens run? And did either of the last two bumps get the lens?

Say, in order, what runs over this change beside the review loop, and whether the
security lens runs once the audit report above is in; then say whether each of the two
earlier bumps went to the security lens.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. The response states that the dependency audit runs first over this change, before any
   security lens, because `gate classify`'s checks name `dependency-audit`.
2. The response states that the security lens runs only if the audit flags something: on
   this change the lens waits for the audit's flag, and so does the lockfile's own
   trigger-path match. Stating it of this change meets this criterion, in any wording that
   makes the lens depend on the audit's flag. The response need not recite in general what
   the audit counts as a flag: B3 grades how the flag is read on this report, and B4 and B6
   grade which entries count. A response that does say what the audit counts as a flag must
   say it as the governing text defines it: on an entry the bump adds or changes, an
   advisory at any severity, a licence flag, or an update-risk class other than `patch` or
   `minor`, for the bump's own version move or on the entry itself. A response whose stated
   test for a flag narrows or contradicts that definition fails this criterion, whether it
   states the test in general or gives it as the ground of its reading, and even where its
   reading of this report comes out the same. That covers a test that counts only some
   severities (a high or critical advisory, say), only a `major` move, or an entry the bump
   does not touch; one that says something the governing text counts as a flag does not
   flag; and a statement of what a flag is, given as the whole of it, that leaves one of
   the three outcomes out. It does not cover an outcome named as one thing that flags or as
   an example, nor a reading of this report that names fewer points than B3 lists, which B3
   grades. A response that never makes the lens depend on the audit's flag fails this
   criterion too: one that runs the lens whatever the audit reports, or one that settles it
   only on something else, such as the lockfile's trigger-path match, the
   `security-sensitive` class or the empty `lenses` list.
3. The response reads this report as no flag (the `semver` move is a patch, the entry's
   own class is none, the changed entry carries no advisory and no licence flag, and
   coverage is complete) and states that the security lens does not run on this bump.
4. The response states that the `micromatch` advisory sits on an entry the bump leaves
   alone, so it is reported and does not flag.
5. The response must NOT dispatch the security lens before the audit has reported, or
   beside it, on the strength of the lockfile's own trigger-path match.
6. The response must NOT count the standing `micromatch` advisory as a flag that sends this
   bump to the security lens.
7. The response states that both earlier bumps went to the security lens: last week's audit
   was `partial`, and a `partial` audit counts as a flag whatever it reported on the entry its
   bump changed; the week before's could not run, and an audit that cannot run counts as a
   flag, or, in the Specialist pass's own words, keeps the lens. Either ground meets this
   criterion for that bump. Stating it of the two bumps meets this criterion; the response
   need not recite the rule in general. A response that lets either earlier bump leave without the
   lens, that reads last week's report as no flag because it shows no advisory, licence flag
   or risk class on the changed entry, or that sends either bump to the lens only for the
   lockfile's trigger-path match or its `security-sensitive` class, fails this criterion.

### Advisory criteria — recorded, never scored into the verdict

Disposition 2026-10-14: A1 promoted to B7 (sha256:87fcb189ced1) — the governing text states it
in so many words: "A `partial` run, or an audit that cannot run, counts as a flag"
(`content/skills/st-dep-audit/SKILL.md`, the block this case quotes), and no binding row
measured it, the scenario holding no partial audit. The scenario now holds one, and one that
could not run, and B7 grades them on those two bumps, so it asks no general recital and B2
stands as amended on 2026-10-11. The surviving row is renumbered A1 (was A2); it is unchanged
in substance.

Amended 2026-10-14 (run 2026-10-14_cli-native, unit f9-evals; the r2 review's note on `review/45`):
B7 named "counts as a flag" as the ground for both earlier bumps. For the bump whose audit could not
run, the `/st-work` Specialist pass the Brief quotes (`content/commands/st-work.md:244-256`) gives a
second correct ground in its own words, "an audit that cannot run keeps the lens", so a judge
reading B7 literally could fail a response that sends that bump to the lens on that ground. B7 now
accepts either ground for that bump. It still fails a response that lets either bump leave without
the lens, reads last week's partial report as no flag, or sends either bump to the lens only for the
trigger-path match or the `security-sensitive` class. No other row moves.

1. The response states that the audit stays report-only: it edits no manifest or lockfile,
   and the `micromatch` fix is routed out rather than applied in this change.
