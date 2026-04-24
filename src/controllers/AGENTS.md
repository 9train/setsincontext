# AGENTS.md

## Controllers folder purpose

This folder owns controller truth.

Prefer profile-owned behavior over scattered special cases.

## Rules for controller work

When editing controller logic:
- keep official profile definitions authoritative
- avoid duplicating raw MIDI truth across many files
- avoid hiding controller state in renderer logic
- avoid using fallback logic where official FLX6 profile ownership should exist
- keep normalized naming consistent
- keep state transitions explicit and inspectable

## Preferred flow

raw MIDI
→ controller/profile binding
→ controller state update
→ normalized / semantic event
→ outputs / renderer / debugger

Do not skip state ownership layers.

## FLX6-specific controller priorities

Highest-value stateful families include:
- deck ownership
- vinyl mode
- jog cutter
- pad mode startup truth
- CH4 selector truth / visibility
- Beat FX families
- shifted browse / view / load families
- shifted transport / master families
- remaining pad-mode families and related outputs

## State rules

Prefer hardware-authored state over event-context inference when the board provides or strongly implies the state structure.

Do not let renderer assumptions become controller truth.
Do not let fallback mappings stand in for official FLX6 ownership.

## Testing expectations

Any controller-state change should include or update focused tests when possible.

Verify:
- no break in existing host/viewer behavior
- no silent fallback takeover
- no loss of current working functionality
- debugger still exposes the new behavior clearly

## Completion standard

Controller work is not done when it only “looks right.”

It is done when:
- ownership lives in the correct controller/state layer
- normalized outputs are consistent
- relevant tests pass or failures are clearly explained
- remaining controller gaps are stated plainly