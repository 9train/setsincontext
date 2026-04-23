// /src/state-hooks.js
// Experimental FEEL helper used by src/events.js.
// Not part of the supported canonical host flow today.
export function armSoftTakeoverForDeck(FEEL, feelCfg, deckId) {
  // List the controls that should soft‑pickup on this deck
  const ids = ['xfader', 'ch1Gain', 'ch1Hi' /* add all absolute controls for the deck */];
  ids.forEach(id => FEEL.resetSoft(id));
}
