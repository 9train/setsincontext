// Lightweight runtime validator (no deps). Keeps you from loading broken JSON.
export function validateFeelConfig(cfg) {
  const errors = [];
  const num = (v,n) => (typeof v === 'number' ? v : (errors.push(`${n} should be number`), 0));
  const obj = (v,n) => (v && typeof v === 'object' ? v : (errors.push(`${n} should be object`), {}));
  const str = (v,n) => (typeof v === 'string' ? v : (errors.push(`${n} should be string`), ''));

  const c = obj(cfg,'root');
  obj(c.global,'global');
  obj(c.controls,'controls');

  if (c.global?.jog) {
    const j = c.global.jog;
    num(j.intervalMs,'global.jog.intervalMs');
    num(j.rpm,'global.jog.rpm');
    num(j.alpha,'global.jog.alpha');
    num(j.beta,'global.jog.beta');
    if ('scale' in j) num(j.scale,'global.jog.scale');
    if ('wheelResolution' in j) num(j.wheelResolution,'global.jog.wheelResolution');
  }
  for (const [id, cc] of Object.entries(c.controls || {})) {
    str(cc.type, `controls.${id}.type`);
    if (cc.type === 'absolute') {
      num(cc.min, `controls.${id}.min`);
      num(cc.max, `controls.${id}.max`);
      if ('curveK' in cc) num(cc.curveK, `controls.${id}.curveK`);
      if ('deadzone' in cc) num(cc.deadzone, `controls.${id}.deadzone`);
    } else if (cc.type === 'relative') {
      num(cc.step, `controls.${id}.step`);
      if ('accel' in cc) num(cc.accel, `controls.${id}.accel`);
    } else if (cc.type === 'jog') {
      if ('scaleOverride' in cc) num(cc.scaleOverride, `controls.${id}.scaleOverride`);
      if ('shiftScale' in cc) num(cc.shiftScale, `controls.${id}.shiftScale`);
      if ('wheelResolution' in cc) num(cc.wheelResolution, `controls.${id}.wheelResolution`);
      if ('deltaCodec' in cc) str(cc.deltaCodec, `controls.${id}.deltaCodec`);
      if ('defaultLane' in cc) str(cc.defaultLane, `controls.${id}.defaultLane`);
      if ('directScale' in cc) num(cc.directScale, `controls.${id}.directScale`);
      if ('degreesPerCount' in cc) num(cc.degreesPerCount, `controls.${id}.degreesPerCount`);
      if ('velocityScale' in cc) num(cc.velocityScale, `controls.${id}.velocityScale`);
      if ('damping' in cc) num(cc.damping, `controls.${id}.damping`);
      if ('maxVel' in cc) num(cc.maxVel, `controls.${id}.maxVel`);
      if ('maxVelocity' in cc) num(cc.maxVelocity, `controls.${id}.maxVelocity`);
      if ('motionMode' in cc) str(cc.motionMode, `controls.${id}.motionMode`);
      if ('lanes' in cc) {
        const lanes = obj(cc.lanes, `controls.${id}.lanes`);
        Object.entries(lanes).forEach(([laneId, laneCfg]) => {
          const lane = obj(laneCfg, `controls.${id}.lanes.${laneId}`);
          if ('directScale' in lane) num(lane.directScale, `controls.${id}.lanes.${laneId}.directScale`);
          if ('degreesPerCount' in lane) num(lane.degreesPerCount, `controls.${id}.lanes.${laneId}.degreesPerCount`);
          if ('velocityScale' in lane) num(lane.velocityScale, `controls.${id}.lanes.${laneId}.velocityScale`);
          if ('damping' in lane) num(lane.damping, `controls.${id}.lanes.${laneId}.damping`);
          if ('maxVel' in lane) num(lane.maxVel, `controls.${id}.lanes.${laneId}.maxVel`);
          if ('maxVelocity' in lane) num(lane.maxVelocity, `controls.${id}.lanes.${laneId}.maxVelocity`);
          if ('motionMode' in lane) str(lane.motionMode, `controls.${id}.lanes.${laneId}.motionMode`);
        });
      }
    }
  }
  return errors;
}
