// /src/midi-feel.js (tiny glue layer)
import { scaleAbsolute, SoftTakeover, applyRelative, JogSmoother, Curve } from './engine/sensitivity.js';

function asObject(value) {
  return value && typeof value === 'object' ? value : {};
}

export function buildFeelRuntime(feelConfig) {
  const cfg = asObject(feelConfig);
  const globalCfg = asObject(cfg.global);
  const jogCfg = asObject(globalCfg.jog);
  const softTakeoverWindow =
    typeof globalCfg.softTakeoverWindow === 'number'
      ? globalCfg.softTakeoverWindow
      : 0.04;

  const state = {
    soft: new Map(),    // controlId -> SoftTakeover
    jog: new Map(),     // controlId -> JogSmoother
    values: new Map(),  // controlId -> last normalized 0..1
  };

  function getSoftTakeover(controlId, ctrlCfg) {
    if (!ctrlCfg || !ctrlCfg.soft) return null;
    let soft = state.soft.get(controlId);
    if (!soft) {
      soft = new SoftTakeover(softTakeoverWindow);
      state.soft.set(controlId, soft);
    }
    return soft;
  }

  function createJogSmoother() {
    const jog = new JogSmoother(jogCfg);
    if (typeof jogCfg.scale === 'number') jog.setScale(jogCfg.scale);
    return jog;
  }

  function getJogSmoother(controlId) {
    let jog = state.jog.get(controlId);
    if (!jog) {
      jog = createJogSmoother();
      state.jog.set(controlId, jog);
    }
    return jog;
  }

  return {
    // returns normalized 0..1 (or control-specific range) and whether to apply
    processAbsolute(controlId, value7, ctrlCfg) {
      const v = scaleAbsolute(value7, ctrlCfg);
      const soft = getSoftTakeover(controlId, ctrlCfg);
      if (soft) {
        const cur = state.values.get(controlId) ?? v; // if first, accept
        const [apply, outNorm] = soft.process(v, cur);
        if (apply) state.values.set(controlId, outNorm);
        return { apply, value: outNorm };
      }
      state.values.set(controlId, v);
      return { apply: true, value: v };
    },

    // relative encoder: delta is signed integer (e.g. -1..+1 or -64..+63)
    processRelative(controlId, delta, ctrlCfg) {
      const cur = state.values.get(controlId) ?? 0.5;
      const out = applyRelative(delta, { ...ctrlCfg, current: cur });
      state.values.set(controlId, out);
      return { apply: true, value: out };
    },

    // jog: returns smoothed velocity and position; you choose how to map to ops
    processJog(controlId, deltaRaw, ctrlCfg) {
      const jog = getJogSmoother(controlId);
      if (typeof ctrlCfg?.scaleOverride === 'number') jog.setScale(ctrlCfg.scaleOverride);
      else if (typeof jogCfg.scale === 'number') jog.setScale(jogCfg.scale);
      return jog.tick(deltaRaw);
    },

    resetSoft(controlId) {
      state.soft.get(controlId)?.reset();
    },

    resetJog(controlId) {
      if (controlId) {
        state.jog.get(controlId)?.reset();
        return;
      }
      state.jog.forEach((jog) => jog.reset());
    },
  };
}
