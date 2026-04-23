# AGENTS.md

## Project goal

This repo is a browser-based controller engine.

Priority order:
1. DDJ-FLX6 core is trustworthy as a debugger / mapper
2. That engine powers a teaching / coaching product
3. Then the engine grows toward general MIDI interpretation
4. Only later should creative / Adobe / brush workflows be added

## Current focus

Treat the repo as late Stage 1 moving into Stage 2.

Focus on:
- remaining high-value FLX6 families
- output / LED behavior that improves board trust
- debugger / learn / edit usability
- normalized event and logging stability
- reducing fallback-driven behavior where official FLX6 truth should own behavior

## Hard constraints

Do not broaden scope.

Do not:
- add extra controllers unless explicitly asked
- push into Adobe / art workflows
- make WebHID the main path
- do broad UI redesign
- do unrelated product/platform work
- rewrite major architecture unless it clearly improves controller truth, debugger trust, or teaching reliability

## Working style

For non-trivial tasks:
1. audit first
2. identify smallest high-value change
3. edit only necessary files
4. run relevant tests
5. summarize:
   - what changed
   - what remains
   - whether the requested goal is met

Prefer small, reviewable diffs.

## Architecture direction

Preserve and strengthen this path:

raw MIDI
→ official FLX6 profile binding
→ controller state update
→ normalized / semantic event
→ renderer / debugger / outputs

Official profile behavior is authoritative.
Draft / learned / fallback behavior must stay secondary.

Prefer hardware-authored state over inferred state when the FLX6 MIDI truth supports it.

## Files to prioritize

Start with:
- src/controllers/
- src/board.js
- src/learn.js
- src/mapper.js
- src/wizard.js
- src/diag.js
- src/recorder.js
- src/bootstrap-host.js
- src/bootstrap-viewer.js
- tests/

Read only what is needed for the current task.

## Mapping and learn rules

Learned mappings must be:
- draft-first
- inspectable
- reviewable
- separate from shipped official profiles

Do not silently promote draft behavior into official behavior.

## Done means

A task is done when:
- the requested behavior works in the intended architectural layer
- the change stays in scope
- relevant tests pass or failures are clearly explained
- changed files and remaining gaps are summarized clearly