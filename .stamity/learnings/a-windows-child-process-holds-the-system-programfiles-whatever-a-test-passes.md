---
id: a-windows-child-process-holds-the-system-programfiles-whatever-a-test-passes
title: a windows child process holds the system ProgramFiles whatever a test passes
date: 2026-11-12
confidence: high
summary: on a Windows CI leg a child process holds the system ProgramFiles whatever a test passes (ProgramData passes through), so a stand-in program folder never reaches the guard child there (2026-11-11)
reviewBy: 2027-02-12
validatedAgainst: test/hooks/personOnlyGuard.test.ts, the case naming Git for Windows' program-folder or shared-data system file, on the windows-2 CI shard and in a one-case probe on windows-latest, 2026-11-11
integrity: sha256:303ea27816a01887f36143709ba8edc2b42739cf45329820d504f62357285843
---

On a Windows CI leg a process started with `ProgramFiles` set to another folder still holds the system's own
value, `C:\Program Files`. `ProgramData` set the same way arrives as set. The person-only guard reads both to find
Git for Windows' system files (`<ProgramFiles>\Git\etc\gitconfig`, `<ProgramData>\Git\config`), so a test that
plants a system file under a stand-in program folder never reaches the guard child on a real Windows, though the
same case is green on the POSIX legs, where a preload only sets `process.platform`.

## Why

Seen on 2026-11-11 on `windows-latest` (Node 24, x64) with a one-case probe that logged the guard child's variables
and every path it handed to `lstatSync`. With `ProgramFiles` passed as a temporary folder, the child listed
`ProgramFiles` as `C:\Program Files` and looked at `C:\Program Files\Git\etc\gitconfig`, never at the stand-in.
With `ProgramData` passed as a temporary folder, it read the stand-in's `Git\config` and asked. The case "asks for
a push to origin on Windows where Git for Windows' program-folder or shared-data system file moves origin" in
`test/hooks/personOnlyGuard.test.ts` had passed on every POSIX leg and failed on the `windows-2` shard at its first
check. It now proves the program-folder place on Windows by a read log (the guard child is shown to look at the
host's own file) and keeps the stand-in on the POSIX legs. For the same reason `hostFree`, which pins the guard
tests' variables under the temporary folder, cannot keep the host's own program-folder system file out of a guard
run on Windows; on the CI runners that file sets no remote or URL key, so the other cases hold.

## How to apply

A guard test that needs a stand-in system file on Windows has `ProgramData` as its working place; the
program-folder place is provable there only by what the guard looks at. A case written for Windows first meets a
real Windows on a CI Windows shard, 20 to 60 minutes into a run. A workflow of one `windows-latest` job on a
throwaway branch, running `npx vitest run <file> -t "<case>"`, gave the same answer in 3 to 8 minutes; a file the
case wrote and a later step printed carried the child's view, since this repository's vitest run prints no
`console.log` of a passing case.
