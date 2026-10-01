---
id: board-writes
# A design document, authored from docs/plans/015-board-writes.md on 2026-10-01; its requirement text lands with that plan's spec-delta merge.
status: design
obsolete_when: every requirement below is pinned by a test or an eval case that names its id and the command reference carries it, or a decision row cuts the surface
---
# Board writes

What `/st-board` writes to a linked board, when it asks first, and what it never writes. The area code is `BOARD`.
Today the command is read-only by default, opens write channels per session at setup, and leaves item creation and
labels as proposals (`content/commands/st-board.md:180-183`, `:255-287`). This spec replaces that with writes on by
default behind one preview per run, a `--move` flag that alone changes where an item stands, and a fixed list of
writes the board never makes.

## Requirements

### REQ-BOARD-001 — A linked board takes writes by default

### REQ-BOARD-002 — One preview per run, and no answer means stop

### REQ-BOARD-003 — `--move` gates where an item stands

### REQ-BOARD-004 — Writes the board never makes

### REQ-BOARD-005 — Item text is data

### REQ-BOARD-006 — Filed items converge on retry

### REQ-BOARD-007 — The GitHub row names every write it allows

### REQ-BOARD-008 — Setup states what the platform does by itself

### REQ-BOARD-009 — `/st-pr-resolve` replies need no board setup

### REQ-BOARD-010 — The product-audit pack keeps proposing
