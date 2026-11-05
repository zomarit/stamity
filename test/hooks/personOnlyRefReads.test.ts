import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { personOnlyVerdict, unattendedPushVerdict } from "../../src/hooks/personOnly.ts";

/**
 * The ref readers of the person-only verdict, past what `personOnly.test.ts` pins: each row states an outcome the guard
 * must reach, and each no-act row sits beside them so a reading that asks of everything fails too.
 */

const ORIGIN = { defaultBranches: ["trunk"], currentBranch: "feat/x", tags: [], originRepo: "github.com/o/r" } as const;

describe("a ref text in any spelling of its option", () => {
  it.each([
    ["a tag write under an abbreviated option", "printf 'update refs/tags/v1 abc\\n' | git update-ref --std", "tag", true],
    ["a tag delete under an abbreviated option", "printf 'delete refs/tags/v1\\n' | git update-ref --stdi", "tag-delete", false],
    ["a tag delete by an empty value under the shortest prefix", "printf 'update refs/tags/v1 \\n' | git update-ref --s", "tag-delete", false],
    ["a symref write onto the default branch under an abbreviated option", "printf 'symref-update refs/heads/x refs/heads/trunk\\n' | git update-ref --std", "push-default", true],
  ])("reads %s", (_, command, rule, ask) => {
    expect(personOnlyVerdict(command, ORIGIN), command).toMatchObject({ deny: true, rule, ask });
  });

  it.each([
    ["a tag delete whose name shell quoting splits", "printf 'delete refs/ta''gs/v1\\n' | git update-ref --stdin", "tag-delete", false],
    ["a tag write whose name shell quoting splits", "printf 'update refs/ta''gs/v1 abc\\n' | git update-ref --stdin", "tag", true],
    ["a symref delete of a tag whose name shell quoting splits", "printf 'symref-delete refs/ta''gs/v1\\n' | git update-ref --stdin", "tag-delete", false],
    ["a symref write whose command word shell quoting splits", "printf 'sym''ref-update refs/heads/x refs/heads/trunk\\n' | git update-ref --stdin", "push-default", true],
  ])("reads %s as its unquoted words", (_, command, rule, ask) => {
    expect(personOnlyVerdict(command, ORIGIN), command).toMatchObject({ deny: true, rule, ask });
  });

  it.each([
    ["a branch write under an abbreviated option", "printf 'update refs/heads/feat/x abc\\n' | git update-ref --std"],
    ["a symref write of a feature branch under an abbreviated option", "printf 'symref-update refs/heads/a refs/heads/feat/x\\n' | git update-ref --std"],
    ["a literal option that is no prefix of it", "printf 'delete refs/tags/v1\\n' | git update-ref -z refs/heads/a abc"],
  ])("leaves %s", (_, command) => {
    expect(personOnlyVerdict(command, ORIGIN), command).toEqual({ deny: false });
  });
});

describe("a ref text the line does not show whole", () => {
  const SHOWN = "printf 'verify refs/heads/a 0123abc\\n'";

  it.each([
    ["a filled-in line before a shown one", "printf '%s\\nverify refs/heads/a 0123abc\\n' \"$X\" | git update-ref --stdin"],
    ["a filled-in line after a shown one", "printf 'verify refs/heads/a 0123abc\\n%s\\n' \"$X\" | git update-ref --stdin"],
    ["a filled-in line after a hex line break", "printf 'verify refs/heads/a 0123abc\\x0a%s\\n' \"$X\" | git update-ref --stdin"],
    ["a filled-in line after two NULs", "printf 'verify refs/heads/a 0123abc\\0\\0%s\\0' \"$X\" | git update-ref -z --stdin"],
    ["a variable before a shown line", 'printf "$X\\nverify refs/heads/a 0123abc\\n" | git update-ref --stdin'],
    ["a variable beside a shown word under echo", 'echo "$X" update | git update-ref --stdin'],
    ["a shown line and a variable under echo", "echo -e \"verify refs/heads/a 0123abc\\n$X\" | git update-ref --stdin"],
    ["a command word in another segment", 'echo update; printf "$TEXT" | git update-ref --stdin'],
    ["a command word in another segment beside a file the shell fills in", 'echo update; cat "$F" | git update-ref --stdin'],
    ["a here-string the shell fills in", 'git update-ref --stdin <<< "$X"'],
    ["a here-document the shell fills in beside a shown line", "git update-ref --stdin <<EOF\n$X\nverify refs/heads/a 0123abc\nEOF"],
    ["a filled-in format after the option terminator", 'printf -- "$X" | git update-ref --stdin'],
    ["a filled-in line after the option terminator", "printf -- '%s\\nverify refs/heads/a 0123abc\\n' \"$X\" | git update-ref --stdin"],
    ["a filled-in format after a variable option and the terminator", 'printf -v out -- "$X" | git update-ref --stdin'],
    ["a value a placeholder gives, which may hold a line break", "printf 'update refs/heads/a %s\\n' \"$SHA\" | git update-ref --stdin"],
    ["a value in a double-quoted format, which may hold a line break", 'printf "update refs/heads/a $SHA\\n" | git update-ref --stdin'],
    ["a value under echo, which may hold a line break", 'echo "update refs/heads/a $SHA" | git update-ref --stdin'],
    ["a placeholder a shown word fills", "printf 'update refs/heads/a %b\\n' 'abc' | git update-ref --stdin"],
    ["an escape other than a line break beside a shown command", "printf 'verify refs/heads/a 0123abc\\12\\144elete refs/heads/a\\n' | git update-ref --stdin"],
    ["a character spelled after a zero", "printf 'verify refs/heads/a 0123abc\\nverify refs\\057heads/a 0123abc\\n' | git update-ref --stdin"],
    ["a shown here-document holding an escape", "git update-ref --stdin <<'EOF'\nverify refs/heads/a 0123abc\ndelete \"refs/heads/\\141\"\nEOF"],
  ])("asks for %s", (_, command) => {
    const verdict = personOnlyVerdict(command, ORIGIN);
    expect(verdict, command).toMatchObject({ deny: true, rule: "push-default", ask: true });
    if (verdict.deny) expect(verdict.act, command).toContain("(`git update-ref --stdin`)");
  });

  it.each([
    ["a shown text", `${SHOWN} | git update-ref --stdin`],
    ["a shown text after the option terminator", "printf -- 'verify refs/heads/a 0123abc\\n' | git update-ref --stdin"],
    ["a shown text under `-z`", "printf 'verify refs/heads/a\\0abc0123\\0' | git update-ref -z --stdin"],
    ["a shown here-document", "git update-ref --stdin <<'EOF'\nverify refs/heads/a 0123abc\nEOF"],
    ["a text with no fill-in read from a file", "git update-ref --stdin < refs.txt"],
  ])("leaves %s", (_, command) => {
    expect(personOnlyVerdict(command, ORIGIN), command).toEqual({ deny: false });
  });
});

describe("a git call whose words another program adds", () => {
  it.each([
    ["an update-ref delete of a name it adds", "echo x | xargs git update-ref -d"],
    ["a symbolic-ref delete of a name it adds", "echo x | xargs git symbolic-ref -d"],
    ["a symbolic-ref call of a shown remote HEAD ref", "echo x | xargs git symbolic-ref refs/remotes/origin/HEAD"],
    ["a remote-tracking branch delete", "echo x | xargs git branch -dr"],
    ["a delete naming a remote's HEAD ref, whose remotes flag it may add", "echo x | xargs git branch -d origin/HEAD"],
    ["a local delete beside a word the line itself hides", 'echo x | xargs git branch -d $O'],
    ["a remote call whose subcommand it adds", "echo x | xargs git remote"],
    ["a push of a refspec it adds", "echo x | xargs git push origin"],
    ["a push with a placeholder", "echo x | xargs -I{} git push origin {}"],
    ["a push inside a shell string", "echo x | xargs sh -c 'git push origin'"],
  ])("asks for %s", (_, command) => {
    expect(personOnlyVerdict(command, ORIGIN), command).toMatchObject({ deny: true, rule: "push-default", ask: true });
  });

  it.each([
    ["a tag it names", "echo x | xargs git tag", "tag", true],
    ["a tag deletion it names", "echo x | xargs git tag -d", "tag-delete", false],
    ["a tag ref it may delete", "echo x | xargs git update-ref refs/tags/v1", "tag-delete", false],
    ["a symbolic tag ref it may delete", "echo x | xargs git symbolic-ref refs/tags/v1", "tag-delete", false],
    ["a force push it reads", "echo x | xargs git push -f origin", "force-push", false],
  ])("reads %s", (_, command, rule, ask) => {
    expect(personOnlyVerdict(command, ORIGIN), command).toMatchObject({ deny: true, rule, ask });
  });

  it.each([
    ["a staging call", "echo x | xargs git add"],
    ["a log call", "echo x | xargs git log"],
    ["another program", "echo x | xargs echo"],
  ])("leaves %s", (_, command) => {
    expect(personOnlyVerdict(command, ORIGIN), command).toEqual({ deny: false });
  });
});

describe("a git call behind a wrapper's options", () => {
  // Each option takes a value, and the git call past it is read.
  const BEHIND = [
    ["BSD's word placeholder", "echo x | xargs -J % git push origin trunk"],
    ["that placeholder in a cluster", "echo x | xargs -tJ % git push origin trunk"],
    ["GNU's joined placeholder, a valued option's letter", "echo x | xargs -iP git push origin trunk"],
    ["GNU's joined end word, a valued option's letter", "echo x | xargs -eP git push origin trunk"],
  ] as const;

  it.each(BEHIND)("reads the push behind %s", (_, command) => {
    expect(personOnlyVerdict(command, ORIGIN), command).toMatchObject({ deny: true, rule: "push-default", ask: true });
  });

  it.each(BEHIND)("refuses the push behind %s unattended", (_, command) => {
    expect(unattendedPushVerdict(command), command).toMatchObject({ deny: true });
  });

  it.each([
    ["a staging call", "echo x | xargs -J % git add %"],
    ["a log call under GNU's joined placeholder", "echo x | xargs -iP git log P"],
  ])("leaves %s", (_, command) => {
    expect(personOnlyVerdict(command, ORIGIN), command).toEqual({ deny: false });
  });
});

describe("a wrapper's shortened options", () => {
  // A shortened option reads as the whole option, so the call past it is read.
  const CUT = [
    ["xargs's placeholder option, spelled as a name", "echo push | xargs --repl=foo git foo origin trunk"],
    ["xargs's placeholder option at its shortest, spelled as a name", "echo push | xargs --r=foo git foo origin trunk"],
    ["xargs's placeholder option, spelled as a subcommand git has", "echo push | xargs --repl=status git status origin trunk"],
    ["xargs's delimiter", "echo x | xargs --delim , git push origin trunk"],
    ["xargs's file", "xargs --arg-f names git push origin trunk"],
    ["sudo's user", "sudo --us root git push origin trunk"],
    ["env's folder", "env --ch lib git push origin trunk"],
    ["env's line, joined", "env --split-s='git push origin trunk'"],
    ["timeout's signal", "timeout --sig KILL 5 git push origin trunk"],
    ["stdbuf's stream", "stdbuf --out L git push origin trunk"],
    ["time's format", "time --form x git push origin trunk"],
    ["a runner's package", "npx --pack x git push origin trunk"],
    ["a runner's line, joined", "npx --ca='git push origin trunk'"],
    ["one read inside a shell string", "sh -c 'sudo --us root git push origin trunk'"],
  ] as const;

  it.each(CUT)("asks for %s", (_, command) => {
    expect(personOnlyVerdict(command, ORIGIN), command).toMatchObject({ deny: true, rule: "push-default", ask: true });
  });

  it.each(CUT)("refuses %s unattended", (_, command) => {
    expect(unattendedPushVerdict(command), command).toMatchObject({ deny: true });
  });

  it.each([
    ["a whole valued option", "echo x | xargs --delimiter , git add"],
    ["a whole valued option, joined", "echo x | xargs --max-args=1 git add"],
    ["xargs's whole placeholder option", "echo x | xargs --replace=foo git add foo"],
    ["a flag of xargs's off the table", "echo x | xargs --no-run-if-empty git add"],
    ["another flag of xargs's off the table", "echo x | xargs --null git add"],
    ["a flag of timeout's off the table", "timeout --foreground 5 git status"],
    ["a flag of env's off the table", "env --ignore-environment git status"],
    ["a flag of sudo's off the table", "sudo --preserve-env git status"],
  ])("leaves %s, in both modes", (_, command) => {
    expect(personOnlyVerdict(command, ORIGIN), command).toEqual({ deny: false });
    expect(unattendedPushVerdict(command), command).toEqual({ deny: false });
  });
});

describe("a git call whose subcommand another program fills in", () => {
  // A word another program fills in is one the line cannot show, whatever it spells.
  const FILLED = [
    ["a placeholder spelled as a name", "echo push | xargs -I foo git foo origin trunk"],
    ["a placeholder spelled as a subcommand git has", "echo push | xargs -I status git status origin trunk"],
    ["a joined placeholder spelled as a name", "echo push | xargs -Ifoo git foo origin trunk"],
    ["a clustered placeholder spelled as a name", "echo push | xargs -tI foo git foo origin trunk"],
    ["a placeholder that is only part of a word", "echo sh | xargs -I zz git puzz origin trunk"],
    ["a placeholder spelled as a flag git takes", "echo push | xargs -I -p git -p origin trunk"],
    ["a placeholder spelled as a valued option git takes", "echo push | xargs -I -C git -C origin trunk"],
    ["a placeholder spelled as a joined option git takes", "echo push | xargs -I --git-dir=x git --git-dir=x status origin trunk"],
    ["a placeholder that is a joined option's name", "echo push | xargs -I --git-dir git --git-dir=x status origin trunk"],
    ["a placeholder ending at a joined option's equals sign", "echo pu | xargs -I --git-dir= git --git-dir=sh status origin trunk"],
    ["a placeholder inside a joined option's name", "echo push | xargs -I dir git --git-dir=x status origin trunk"],
    ["BSD's word placeholder spelled as a name", "echo push | xargs -J foo git foo origin trunk"],
    ["GNU's joined placeholder spelled as a name", "echo push | xargs -ifoo git foo origin trunk"],
    ["GNU's long placeholder spelled as a name", "echo push | xargs --replace=foo git foo origin trunk"],
    ["a placeholder read inside a shell string", "echo push | xargs -I foo sh -c 'git foo origin trunk'"],
    ["a placeholder the line cannot show", 'echo push | xargs -I "$P" git status origin trunk'],
    ["a joined placeholder the line cannot show", 'echo push | xargs -I"$P" git status origin trunk'],
  ] as const;

  it.each(FILLED)("asks for %s", (_, command) => {
    expect(personOnlyVerdict(command, ORIGIN), command).toMatchObject({ deny: true, rule: "push-default", ask: true });
  });

  it.each(FILLED)("refuses %s unattended", (_, command) => {
    expect(unattendedPushVerdict(command), command).toMatchObject({ deny: true });
  });

  it("refuses a filled word in a value's place unattended, and leaves it attended", () => {
    const command = "echo x | xargs -J % git -C % status";
    expect(unattendedPushVerdict(command), command).toMatchObject({ deny: true });
    expect(personOnlyVerdict(command, ORIGIN), command).toEqual({ deny: false });
  });

  it.each([
    ["a placeholder as a file", "git ls-files | xargs -I{} git add {}"],
    ["a named placeholder as a file", "git ls-files | xargs -I FILE git add FILE"],
    ["a placeholder as a revision", "echo x | xargs -I X git log X"],
    ["a placeholder as a folder", "echo x | xargs -I X git -C X status"],
    ["a placeholder in a joined folder", "echo x | xargs -I{} git --git-dir={} status"],
    ["a word placeholder in a joined folder's value", "echo x | xargs -I DIR git --git-dir=DIR status"],
    ["BSD's word placeholder as a file", "git ls-files | xargs -J % git add %"],
    ["a placeholder in a later word of a shown subcommand", "echo x | xargs -I % git log --format=% HEAD"],
  ])("leaves %s, in both modes", (_, command) => {
    expect(personOnlyVerdict(command, ORIGIN), command).toEqual({ deny: false });
    expect(unattendedPushVerdict(command), command).toEqual({ deny: false });
  });
});

describe("an unattended git call's configuration pair another program fills in", () => {
  // A key another program fills in may be any key, so the line is refused. A shown key stays read as shown.
  it.each([
    ["a whole pair", "echo x | xargs -I user.name=a git -c user.name=a status"],
    ["a key", "echo x | xargs -I user.name git -c user.name=a status"],
    ["part of a key", "echo x | xargs -I name git -c user.name=a status"],
    ["a key's end and its value", "echo x | xargs -I =a git -c user.name=a status"],
    ["a key with no value", "echo x | xargs -I user.name git -c user.name status"],
    ["a pair under a joined placeholder option", "echo x | xargs -Iuser.name=a git -c user.name=a status"],
    ["an environment pair", "echo x | xargs -I user.name=HOME git --config-env user.name=HOME status"],
    ["a joined environment pair", "echo x | xargs -I user.name=HOME git --config-env=user.name=HOME status"],
    ["a pair inside a shell string", "echo x | xargs -I user.name=a sh -c 'git -c user.name=a status'"],
  ])("refuses a filled word standing for %s", (_, command) => {
    expect(unattendedPushVerdict(command), command).toMatchObject({ deny: true });
  });

  it.each([
    ["a placeholder in a shown key's value", "echo x | xargs -I X git -c user.name=X status"],
    ["a placeholder in a shown environment pair's value", "echo x | xargs -I X git --config-env=user.name=X status"],
    ["a shown pair beside a placeholder elsewhere", "echo x | xargs -I X git -c user.name=a log X"],
    ["a shown pair with no placeholder", "echo x | xargs git -c user.name=a add"],
  ])("leaves %s", (_, command) => {
    expect(unattendedPushVerdict(command), command).toEqual({ deny: false });
  });
});

describe("a local branch delete whose words another program adds", () => {
  it.each([
    ["names a shown word feeds", "echo x | xargs git branch -d"],
    ["names a forced delete takes", "echo x | xargs git branch -D"],
    ["names the long flag takes", "echo x | xargs git branch --delete"],
    ["names a file feeds", "cat names | xargs git branch -d"],
    ["a listing of remotes", "git branch -r | xargs git branch -d"],
    ["a listing of everything", "git branch -a | xargs git branch -d"],
    ["a listing printing the line's own text", "git branch --format=x | xargs git branch -d"],
    ["a listing whose quoted value may be an option", "git branch --merged '-r' | xargs git branch -d"],
    ["a listing whose value the shell fills in", 'git branch --merged "$B" | xargs git branch -d'],
    ["a filter that also reads a file", "git branch | grep x names | xargs git branch -d"],
    ["a filter reading a folder", "git branch | grep -r x | xargs git branch -d"],
    ["a filter whose quoted pattern may be an option", "git branch | grep '-r' | xargs git branch -d"],
    ["a filter whose double-quoted pattern may be an option", 'git branch | grep "-r" | xargs git branch -d'],
    ["a filter whose pattern the shell fills in", 'git branch | grep "$P" | xargs git branch -d'],
    ["a filter whose pattern a substitution fills in", 'git branch | grep "$(cat p)" | xargs git branch -d'],
    ["a filter that rewrites the list", "git branch | sed s/a/b/ | xargs git branch -d"],
    ["a feed xargs reads from a file", "git branch | xargs -a names git branch -d"],
    ["a feed a redirect replaces", "git branch | xargs git branch -d < names"],
    ["a delete naming a shown word too", "git branch | xargs git branch -d x"],
    ["a second fed delete on the line", "git branch | xargs git branch -d; cat names | xargs git branch -d"],
  ])("asks for %s", (_, command) => {
    expect(personOnlyVerdict(command, ORIGIN), command).toMatchObject({ deny: true, rule: "push-default", ask: true });
  });

  it.each([
    ["a local listing", "git branch | xargs git branch -d"],
    ["a merged listing", "git branch --merged | xargs git branch -d"],
    ["a merged listing under a named base, filtered twice", "git branch --merged main | grep -v main | grep -v '^\\*' | xargs git branch -d"],
    ["an unmerged listing under a forced delete", "git branch --no-merged origin/main | grep 'feat/' | xargs git branch -D"],
    ["a filter under a double-quoted pattern", 'git branch --merged | egrep -v "(^\\*|main)" | xargs git branch -d'],
    ["one name per call", "git branch | grep -iv main | xargs -r -n 1 git branch --delete"],
  ])("leaves %s, whose feed holds local names only", (_, command) => {
    expect(personOnlyVerdict(command, ORIGIN), command).toEqual({ deny: false });
  });
});

describe("where a git call's subcommand stands", () => {
  it.each([
    ["a push after a dash word the shell fills in, its value next", 'git -"$O" repo push origin trunk', "push-default", true],
    ["a push after a long dash word the shell fills in", 'git --"$O" repo push origin trunk', "push-default", true],
    ["a push after a whole word the shell fills in", 'git "$O" push origin trunk', "push-default", true],
    ["a push after an unquoted word that may split", "git $O push origin trunk", "push-default", true],
    // TEST CHANGE, justified (REQ-FLOW-102, the maintainer's sign-off of 2026-11-05): these three calls ask as unsettled.
    ["a force push after a word the shell fills in", 'git "$O" push -f origin feat/x', "push-default", true],
    ["a tag after a word the shell fills in", 'git -"$O" repo tag v1', "push-default", true],
    ["a tag deletion after a word the shell fills in", 'git -"$O" repo tag -d v1', "push-default", true],
    ["a remote HEAD write after a word the shell fills in", 'git -"$O" repo update-ref refs/remotes/origin/HEAD 0123abc', "push-default", true],
    ["a symref write after a word the shell fills in", 'git -"$O" repo symbolic-ref refs/remotes/origin/HEAD refs/heads/a', "push-default", true],
    ["a remote write after a word the shell fills in", 'git -"$O" repo remote set-head origin -a', "push-default", true],
    ["a branch delete after a word the shell fills in", 'git -"$O" repo branch -dr origin/HEAD', "push-default", true],
    ["a push after the attribute-source option's value", "git --attr-source HEAD push origin trunk", "push-default", true],
    ["a push whose `-c` pair sets the matching default, after a word the shell fills in", 'git -c push.default=matching "$O" push origin', "push-default", true],
    // TEST CHANGE, justified (REQ-FLOW-102, the maintainer's sign-off of 2026-11-05): a whole word the line cannot show,
    // at or before the subcommand, asks, whatever the later words name.
    ["a call whose later words name no subcommand read", 'git "$O" status', "push-default", true],
    ["a fetch after a word the shell fills in", 'git "$O" fetch origin main:refs/remotes/origin/HEAD', "push-default", true],
    ["a word the line cannot show in the subcommand's place", 'git "$O"', "push-default", true],
    ["a subcommand only part of which the line shows", 'git pu"$O" origin', "push-default", true],
    ["a shown option git is not known to take", "git --unknown status", "push-default", true],
    ["a valued option off the list", "git --shallow-file x status", "push-default", true],
    ["a known option the shell fills in part of", 'git --git-dir"$O"=x status', "push-default", true],
    ["a subcommand `xargs` supplies", "echo x | xargs git", "push-default", true],
    ["a subcommand `xargs` supplies after a known option", 'echo x | xargs git -C "$DIR"', "push-default", true],
    ["a placeholder in the subcommand's place", "echo x | xargs -I{} git {} origin", "push-default", true],
    ["a single-letter placeholder in the subcommand's place", "echo x | xargs -I X git X origin", "push-default", true],
    ["a joined exec folder, whose programs git runs", "git --exec-path=tools submodule status", "push-default", true],
    ["a force push after an option off the list, still refused", "git --unknown push -f origin feat/x", "force-push", false],
  ])("reads %s", (_, command, rule, ask) => {
    expect(personOnlyVerdict(command, ORIGIN), command).toMatchObject({ deny: true, rule, ask });
  });

  it.each([
    ["a folder the shell fills in", 'git -C "$DIR" status'],
    ["a joined git folder the shell fills in", 'git --git-dir="$DIR" status'],
    ["a `-c` pair the shell fills in", 'git -c "$PAIR" status'],
    ["a push of a feature branch after a folder the shell fills in", 'git -C "$DIR" push origin feat/x'],
    ["a shown global option", "git --no-pager log push"],
    ["an unquoted folder value, attended", "git -C $DIR status"],
    ["an unquoted joined value, attended", "git --git-dir=$DIR status"],
    ["an option with no subcommand", "git --version"],
    ["an option printing a path", "git --exec-path"],
    ["a joined value git prints from", "git --list-cmds=builtins"],
    ["a shown subcommand under `xargs`", "echo x | xargs git -C /tmp log"],
  ])("leaves %s", (_, command) => {
    expect(personOnlyVerdict(command, ORIGIN), command).toEqual({ deny: false });
  });

  it.each([
    ["a whole word the line cannot show", 'git "$O" status'],
    ["a dash word the shell fills in", 'git -"$O" repo status'],
    ["a shown option git is not known to take", "git --unknown status"],
    ["a valued option off the list", "git --shallow-file x status"],
    ["an unquoted folder value", "git -C $DIR status"],
    ["an unquoted joined value", "git --git-dir=$DIR status"],
    ["a value a glob fills in", "git -C dir* status"],
    ["a subcommand `xargs` supplies", "echo x | xargs git"],
    ["a placeholder in the subcommand's place", "echo x | xargs -I{} git {} origin"],
    ["a joined exec folder, whose programs git runs", "git --exec-path=tools submodule status"],
  ])("refuses %s unattended", (_, command) => {
    expect(unattendedPushVerdict(command), command).toMatchObject({ deny: true });
  });

  it.each([
    ["a plain call", "git status"],
    ["a shown global option", "git --no-pager log"],
    ["a quoted folder value", 'git -C "$DIR" status'],
    ["a quoted joined value", 'git --git-dir="$DIR" status'],
    ["a shown `-c` pair", "git -c user.name=x log"],
    ["an option with no subcommand", "git --version"],
    ["a shown subcommand under `xargs`", "echo x | xargs git add"],
  ])("leaves %s unattended", (_, command) => {
    expect(unattendedPushVerdict(command), command).toEqual({ deny: false });
  });
});

describe("a subtree call's own subcommand", () => {
  // Each runs a push: the first word past the options must be a subcommand the line shows, and a word the read cannot
  // place asks.
  const PUSHES = [
    ["a value shaped as its own option", "git subtree -P -P push origin trunk"],
    ["a value shaped as another valued option", "git subtree -m -P push origin trunk"],
    ["a valued option off the old list", "git subtree --annotate x push origin trunk"],
    ["a short cluster's value", "git subtree -qP lib push origin trunk"],
    ["an abbreviated option's value", "git subtree --pre lib push origin trunk"],
    ["a short cluster's value spelled as a subcommand", "git subtree -qP split push origin trunk"],
    ["an abbreviated option's value spelled as a subcommand", "git subtree --pre split push origin trunk"],
    ["a subcommand the shell fills in", 'git subtree "$S" origin trunk'],
    ["a subcommand after an option word the shell fills in", 'git subtree -"$O" lib split'],
    ["a subcommand xargs supplies", "echo push | xargs git subtree -P lib"],
    ["a placeholder in the subcommand's place", "echo push | xargs -I split git subtree split -P lib origin trunk"],
  ] as const;

  it.each(PUSHES)("asks for %s", (_, command) => {
    expect(personOnlyVerdict(command, ORIGIN), command).toMatchObject({ deny: true, rule: "push-default", ask: true });
  });

  it.each(PUSHES)("refuses %s unattended", (_, command) => {
    expect(unattendedPushVerdict(command), command).toMatchObject({ deny: true });
  });

  it("reads the remote and the branch past a value shaped as an option, after the subcommand", () => {
    const command = "git subtree push -P -P origin trunk";
    expect(personOnlyVerdict(command, ORIGIN), command).toMatchObject({ deny: true, rule: "push-default", ask: true });
  });

  it.each([
    ["a split", "git subtree split -P lib -b out"],
    ["a split under a long option", "git subtree split --prefix=lib --annotate=x"],
    ["a split whose folder the shell fills in", 'git subtree split -P "$DIR"'],
    ["an add from a folder named as the subcommand", "git subtree add -P push origin x"],
    ["a pull", "git subtree pull --prefix=lib origin main"],
    ["a merge", "git subtree merge -P lib main"],
    ["options before the subcommand", "git subtree -P lib split"],
    ["a joined long option before the subcommand", "git subtree --prefix=lib split"],
    ["shown flags before the subcommand", "git subtree -q --squash -P lib -S add x"],
    ["its own help", "git subtree --help"],
    ["a push of a feature branch", "git subtree push -P lib origin feat/x"],
  ])("leaves %s", (_, command) => {
    expect(personOnlyVerdict(command, ORIGIN), command).toEqual({ deny: false });
  });
});

describe("a refspec's destination", () => {
  const ON_NO_ORIGIN = { defaultBranches: ["trunk"], currentBranch: "feat/x", tags: [] } as const;

  it.each([
    ["a push into this repository", "git push . feat/x:refs/remotes/origin/HEAD", "git push"],
    ["a push naming it without `refs/`", "git push . feat/x:remotes/origin/HEAD", "git push"],
    ["a push naming it in another case", "git push . feat/x:REFS/REMOTES/ORIGIN/head", "git push"],
    ["a push to a named remote", "git push origin feat/x:refs/remotes/origin/HEAD", "git push"],
    ["a push a `-c` pair configures", "git -c remote.origin.push=feat/x:refs/remotes/origin/HEAD push origin", "git push"],
    ["a fetch from a remote", "git fetch origin main:refs/remotes/origin/HEAD", "git fetch"],
    ["a fetch from this repository", "git fetch . feat/x:refs/remotes/origin/HEAD", "git fetch"],
    ["a forced fetch", "git fetch origin +refs/heads/main:refs/remotes/origin/HEAD", "git fetch"],
    ["a fetch of another remote's", "git fetch upstream main:refs/remotes/upstream/HEAD", "git fetch"],
    ["a fetch whose map option names it", "git fetch origin --refmap=+refs/heads/*:refs/remotes/origin/HEAD", "git fetch"],
    ["a fetch whose `-c` pair names it", "git -c remote.origin.fetch=+refs/heads/main:refs/remotes/origin/HEAD fetch", "git fetch"],
    ["a fetch reading it from a text on the line", "echo main:refs/remotes/origin/HEAD | git fetch --stdin origin", "git fetch"],
    ["a pull", "git pull origin main:refs/remotes/origin/HEAD", "git pull"],
  ])("asks for %s, as a push of the default branch", (_, command, via) => {
    for (const ctx of [ORIGIN, ON_NO_ORIGIN]) {
      const verdict = personOnlyVerdict(command, ctx);
      expect(verdict, command).toMatchObject({ deny: true, rule: "push-default", ask: true });
      if (verdict.deny) expect(verdict.act, command).toContain(`written or deleted (\`${via}\`)`);
    }
  });

  it.each([
    ["a fetch whose destination the shell fills in", 'git fetch origin "main:$R"', "git fetch"],
    ["a pull whose destination may split", "git pull origin main:$R", "git pull"],
    ["a fetch whose destination opens with a part of that ref", 'git fetch origin "main:refs/$R"', "git fetch"],
    ["a fetch whose destination opens with a remote's folder", 'git fetch origin "main:remotes/origin/$R"', "git fetch"],
    ["a fetch whose destination opens with that folder in another case", 'git fetch origin "main:REFS/REMOTES/$R"', "git fetch"],
    ["a fetch whose source and destination the shell fills in", 'git fetch origin "$A:$B"', "git fetch"],
    ["a fetch whose destination a substitution opens", 'git fetch origin "main:$(cat f)"', "git fetch"],
    ["a fetch whose destination a Windows variable opens", 'git fetch origin "main:%A%$B"', "git fetch"],
    ["a fetch under xargs", "echo x | xargs git fetch origin", "git fetch"],
    ["a fetch text the shell fills in", 'printf "$X" | git fetch --stdin origin', "git fetch"],
  ])("asks for %s, which may name it", (_, command, via) => {
    const verdict = personOnlyVerdict(command, ORIGIN);
    expect(verdict, command).toMatchObject({ deny: true, rule: "push-default", ask: true });
    if (verdict.deny) expect(verdict.act, command).toContain(`may be a remote's HEAD ref, written or deleted (\`${via}\`)`);
  });

  it("asks for a fetch whose destination a PowerShell group opens, which may name it", () => {
    const command = "git fetch origin main:(Get-Ref)";
    expect(personOnlyVerdict(command, { ...ORIGIN, powershell: true }), command).toMatchObject({ deny: true, rule: "push-default", ask: true });
  });

  it.each([
    ["a plain fetch", "git fetch origin"],
    ["a fetch of a branch", "git fetch origin main"],
    ["a fetch of every remote, pruned", "git fetch --all --prune"],
    ["a fetch into a remote-tracking branch", "git fetch origin main:refs/remotes/origin/main"],
    ["a fetch that reads that ref as its source", "git fetch origin refs/remotes/origin/HEAD:refs/heads/a"],
    ["a fetch of a branch the shell fills in", 'git fetch origin "$BRANCH"'],
    ["a fetch from a URL the shell fills in", 'git fetch "https://github.com/o/$REPO.git" main'],
    ["a fetch whose source the shell fills in", 'git fetch origin "$BRANCH:refs/heads/a"'],
    ["a fetch into a local branch named after a number the shell fills in", 'git fetch origin "pull/$N/head:pr-$N"'],
    ["a fetch into a full branch ref the shell fills in", 'git fetch origin "main:refs/heads/$B"'],
    ["a pull with a rebase", "git pull --rebase origin main"],
    ["a push of a remote branch's name", "git push origin feat/x:refs/heads/feat/y"],
    ["a push reading that ref as its source", "git push origin refs/remotes/origin/HEAD:refs/heads/feat/y"],
  ])("leaves %s", (_, command) => {
    expect(personOnlyVerdict(command, ON_NO_ORIGIN), command).toEqual({ deny: false });
  });
});

describe("a tag ref beside a word the line cannot show", () => {
  it.each([
    ["an update-ref call whose dash word the shell fills in", 'git update-ref -"$O" refs/tags/v1'],
    ["an update-ref call whose first word the shell fills in", 'git update-ref "$O" refs/tags/v1'],
    ["an update-ref call whose word may split", "git update-ref $O refs/tags/v1"],
    ["an update-ref write whose value the shell fills in", 'git update-ref refs/tags/v1 "$SHA"'],
    ["an update-ref call whose tag name may split", "git update-ref refs/tags/$V abc"],
    ["an update-ref call whose only option word may be the stdin option, its text deleting", "printf 'delete refs/tags/v1\\n' | git update-ref \"$O\""],
    ["a symbolic-ref call whose dash word the shell fills in", 'git symbolic-ref -"$O" refs/tags/v1'],
    ["a symbolic-ref call whose first word the shell fills in", 'git symbolic-ref "$O" refs/tags/v1'],
    ["a symbolic-ref write whose target the shell fills in", 'git symbolic-ref refs/tags/v1 "$T"'],
    ["a symbolic-ref call whose tag name may split", "git symbolic-ref refs/tags/$V refs/heads/a"],
  ])("refuses %s as a tag deletion", (_, command) => {
    expect(personOnlyVerdict(command, ORIGIN), command).toMatchObject({ deny: true, rule: "tag-delete", ask: false });
  });

  it("reads a zero value after a reason held in a short cluster", () => {
    const command = `git update-ref -zm why refs/tags/v1 ${"0".repeat(40)}`;
    expect(personOnlyVerdict(command, ORIGIN), command).toMatchObject({ deny: true, rule: "tag-delete", ask: false });
  });

  it("reads a zero value after a joined reason ending in the option's letter", () => {
    const command = `git update-ref -mfrom-m refs/tags/v1 ${"0".repeat(40)}`;
    expect(personOnlyVerdict(command, ORIGIN), command).toMatchObject({ deny: true, rule: "tag-delete", ask: false });
  });

  it("reads a word the shell fills in after a joined reason as one that may delete", () => {
    const command = 'git update-ref -mfrom-m "$O" refs/tags/v1';
    expect(personOnlyVerdict(command, ORIGIN), command).toMatchObject({ deny: true, rule: "tag-delete", ask: false });
  });

  it("reads a remote's HEAD ref after a joined reason as the call's ref", () => {
    const command = "git update-ref -mfrom-m refs/remotes/origin/HEAD 0123abc";
    expect(personOnlyVerdict(command, ORIGIN), command).toMatchObject({ deny: true, rule: "push-default", ask: true });
  });

  it.each([
    ["an update-ref write whose quoted name the shell fills in", 'git update-ref "refs/tags/$V" abc'],
    ["an update-ref write whose quoted reason the shell fills in", 'git update-ref -m "$WHY" refs/tags/v1 abc'],
    ["a symbolic-ref write whose quoted name the shell fills in", 'git symbolic-ref "refs/tags/$V" refs/heads/a'],
    ["a symbolic-ref write whose quoted reason the shell fills in", 'git symbolic-ref -m "$WHY" refs/tags/v1 refs/heads/a'],
    ["an update-ref write whose second reason the shell fills in", 'git update-ref -m -m -m "$WHY" refs/tags/v1 abc'],
  ])("keeps %s a tag write that asks", (_, command) => {
    expect(personOnlyVerdict(command, ORIGIN), command).toMatchObject({ deny: true, rule: "tag", ask: true });
  });
});

describe("a reason option's value", () => {
  const ZERO = "0".repeat(40);

  it.each([
    ["a zero value after it", `git update-ref -m -m refs/tags/v1 ${ZERO}`],
    ["a zero value after it in a short cluster", `git update-ref -zm -zm refs/tags/v1 ${ZERO}`],
    ["a word the shell fills in after it", 'git update-ref -m -m "$O" refs/tags/v1'],
    ["a symbolic-ref word the shell fills in after it", 'git symbolic-ref -m -m "$O" refs/tags/v1'],
  ])("refuses %s as a tag deletion", (_, command) => {
    expect(personOnlyVerdict(command, ORIGIN), command).toMatchObject({ deny: true, rule: "tag-delete", ask: false });
  });

  it.each([
    ["a write of a remote's HEAD ref", "git update-ref -m -m refs/remotes/origin/HEAD 0123abc"],
    ["a delete of a remote's HEAD ref", "git update-ref -d -m -m refs/remotes/origin/HEAD"],
    ["a delete of a remote's HEAD ref under a short cluster", "git update-ref -dm -dm refs/remotes/origin/HEAD"],
  ])("asks for %s", (_, command) => {
    expect(personOnlyVerdict(command, ORIGIN), command).toMatchObject({ deny: true, rule: "push-default", ask: true });
  });

  it("leaves a call whose second reason names a remote's HEAD ref", () => {
    const command = "git update-ref -m -m -m refs/remotes/origin/HEAD refs/heads/a 0123abc";
    expect(personOnlyVerdict(command, ORIGIN), command).toEqual({ deny: false });
  });
});

describe("what these reads rest on in a real git", () => {
  const inRepository = (check: (git: (...words: string[]) => string) => void): void => {
    const root = mkdtempSync(join(tmpdir(), "stamity-ref-reads-"));
    const git = (...words: string[]): string => execFileSync("git", words, { cwd: root, encoding: "utf8", stdio: "pipe" });
    try {
      git("init", "-q");
      git("-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", "commit", "-q", "--allow-empty", "-m", "seed");
      check(git);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };

  it("takes the word after the reason option as its value, whatever its shape", () => {
    inRepository((git) => {
      git("update-ref", "-m", "-m", "refs/heads/a", "HEAD");
      expect(git("rev-parse", "refs/heads/a")).toBe(git("rev-parse", "HEAD"));
    });
  });

  it("takes the next word as the value of each option the guard lists as valued", () => {
    inRepository((git) => {
      for (const words of [["-C", "."], ["-c", "a.b=c"], ["--git-dir", ".git"], ["--work-tree", "."], ["--namespace", "x"], ["--attr-source", "HEAD"], ["--config-env", "a.b=HOME"]]) {
        expect(git(...words, "version"), words.join(" ")).toMatch(/^git version/);
      }
    });
  });

  it("refuses a new branch whose name opens with a dash, so a local listing prints no option", () => {
    inRepository((git) => {
      expect(() => git("branch", "--", "-r")).toThrow();
      expect(git("branch")).not.toMatch(/-r/);
    });
  });

  // Why a fetch of a branch held in a variable stays left: a refspec's write does not move the name the guard reads, and
  // asking would fall on every such fetch.
  it("writes a fetch through a remote's symbolic HEAD ref, so the name stays, and leaves no name where the ref is gone", () => {
    inRepository((git) => {
      const NAME = "refs/remotes/origin/trunk";
      const symbolic = (): string => git("symbolic-ref", "-q", "refs/remotes/origin/HEAD").trim();
      git("update-ref", NAME, "HEAD");
      git("symbolic-ref", "refs/remotes/origin/HEAD", NAME);
      git("checkout", "-q", "-b", "other");
      git("-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", "commit", "-q", "--allow-empty", "-m", "two");

      git("fetch", "-q", ".", "+refs/heads/other:refs/remotes/origin/HEAD");
      expect(symbolic()).toBe(NAME);
      expect(git("rev-parse", NAME)).toBe(git("rev-parse", "other"));

      git("fetch", "-q", "--prune", ".", "+refs/heads/*:refs/remotes/origin/*");
      expect(symbolic()).toBe(NAME);

      git("update-ref", "--no-deref", "-d", "refs/remotes/origin/HEAD");
      git("fetch", "-q", ".", "+refs/heads/other:refs/remotes/origin/HEAD");
      expect(symbolic).toThrow();
    });
  });

  it("reads what a fetch does to that name under each per-remote setting", () => {
    inRepository((git) => {
      const NAME = "refs/remotes/origin/trunk";
      const symbolic = (): string => git("symbolic-ref", "-q", "refs/remotes/origin/HEAD").trim();
      git("update-ref", NAME, "HEAD");
      git("symbolic-ref", "refs/remotes/origin/HEAD", NAME);
      git("checkout", "-q", "-b", "other");
      git("remote", "add", "origin", ".");

      git("fetch", "-q", "origin");
      expect(symbolic()).toBe(NAME);
      git("-c", "remote.origin.followRemoteHEAD=never", "fetch", "-q", "origin");
      expect(symbolic()).toBe(NAME);

      // The setting came with git 2.48; an older git reads no such key, so the name stays there.
      const [major = 0, minor = 0] = (git("version").match(/\d+/g) ?? []).map(Number);
      git("-c", "remote.origin.followRemoteHEAD=always", "fetch", "-q", "origin");
      expect(symbolic()).toBe(major > 2 || minor >= 48 ? "refs/remotes/origin/other" : NAME);
    });
  });
});
