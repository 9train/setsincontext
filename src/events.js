// /src/events.js
// Experimental FEEL event hooks.
// Not imported by the canonical host runtime today.
import { armSoftTakeoverForDeck } from './state-hooks.js';

function onTrackLoaded(deckId) {
  if (window.__MIDI_FEEL__) {
    const { FEEL, FEEL_CFG } = window.__MIDI_FEEL__;
    armSoftTakeoverForDeck(FEEL, FEEL_CFG, deckId);
  }
}
