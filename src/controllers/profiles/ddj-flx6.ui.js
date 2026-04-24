const flx6PadModeTargets = Object.freeze([
  Object.freeze({
    mode: 'hotcue',
    targetPrefix: 'hotcue',
    aliasPrefix: 'mode_HOTCUE',
    label: 'Hot Cue',
  }),
  Object.freeze({
    mode: 'sampler',
    targetPrefix: 'sampler',
    aliasPrefix: 'mode_SAMPLER',
    label: 'Sampler',
  }),
  Object.freeze({
    mode: 'beatjump',
    targetPrefix: 'beatjump',
    aliasPrefix: 'mode_BEATJUMP',
    label: 'Beat Jump',
  }),
  Object.freeze({
    mode: 'fx',
    targetPrefix: 'padfx',
    aliasPrefix: 'mode_PADFX',
    label: 'Pad FX',
  }),
  Object.freeze({
    mode: 'keyboard',
    targetPrefix: 'hotcue',
    label: 'Keyboard',
  }),
  Object.freeze({
    mode: 'key_shift',
    targetPrefix: 'padfx',
    label: 'Key Shift',
  }),
  Object.freeze({
    mode: 'beat_loop',
    targetPrefix: 'beatjump',
    label: 'Beat Loop',
  }),
  Object.freeze({
    mode: 'sample_scratch',
    targetPrefix: 'sampler',
    label: 'Sample Scratch',
  }),
]);

function buildPadRenderTargets(side, sideLabel) {
  return Object.fromEntries(
    Array.from({ length: 8 }, (_, index) => {
      const slot = index + 1;
      return [`deck.${sideLabel}.pad.${slot}`, `pad_${side}_${slot}`];
    }),
  );
}

function buildPadModeRenderTargets(side, sideLabel) {
  return Object.fromEntries(
    flx6PadModeTargets.map((target) => [
      `deck.${sideLabel}.pad_mode.${target.mode}`,
      `${target.targetPrefix}_${side}`,
    ]),
  );
}

function buildLoopCallRenderTargets(side, sideLabel) {
  return Object.freeze({
    [`deck.${sideLabel}.loop.call.backward`]: `select_loop_call_L${side}`,
    [`deck.${sideLabel}.loop.call.forward`]: `select_loop_call_R${side}`,
    [`deck.${sideLabel}.loop.memory`]: `loop_memory_${side}`,
  });
}

function buildRenderTargetsFromEditorTargets(targets = []) {
  return Object.fromEntries(
    targets
      .filter((target) => target && target.canonicalTarget && target.targetId)
      .map((target) => [target.canonicalTarget, target.targetId]),
  );
}

const flx6RenderTargets = Object.freeze({
  'mixer.crossfader': 'xfader_slider',
  'beatfx.select': 'beatfx_x5F_select',
  'beatfx.channel_select': 'beatfx_x5F_channel_x5F_select',
  'beatfx.beat.left': 'beatfx_x5F_down',
  'beatfx.beat.right': 'beatfx_x5F_up',
  'beatfx.level_depth': 'beatfx_x5F_levels_x5F_knob',
  'beatfx.on_off': 'effects_x5F_on_x5F_off_x5F_button',
  ...Array.from({ length: 4 }, (_, index) => buildRenderTargetsFromEditorTargets(buildChannelTargets(index + 1)))
    .reduce((allTargets, channelTargets) => ({ ...allTargets, ...channelTargets }), {}),
  'deck.left.tempo.fader': 'slider_TEMPO_L',
  'deck.right.tempo.fader': 'slider_TEMPO_R',
  'deck.left.jog.motion': 'jog_L',
  'deck.right.jog.motion': 'jog_R',
  'deck.left.jog.touch': 'jog_L',
  'deck.right.jog.touch': 'jog_R',
  'deck.left.jog.cutter': 'jogcut_L',
  'deck.right.jog.cutter': 'jogcut_R',
  'deck.left.jog.vinyl_mode': 'jogcut_L',
  'deck.right.jog.vinyl_mode': 'jogcut_R',
  'deck.left.transport.play': 'play_L',
  'deck.right.transport.play': 'play_R',
  'deck.left.transport.cue': 'cue_L',
  'deck.right.transport.cue': 'cue_R',
  'deck.left.transport.sync': 'beatsync_L',
  'deck.right.transport.sync': 'beatsync_R',
  'deck.left.transport.master': 'master_L',
  'deck.right.transport.master': 'master_R',
  'deck.left.transport.layer': 'decks_L',
  'deck.right.transport.layer': 'decks_R',
  'deck.left.loop.in': 'loop_in_L',
  'deck.right.loop.in': 'loop_in_R',
  'deck.left.loop.out': 'loop_out_L',
  'deck.right.loop.out': 'loop_out_R',
  'deck.left.fx.quick': 'knob_MERGEFX_L',
  'deck.right.fx.quick': 'knob_MERGEFX_R',
  'deck.left.fx.quick_select': 'merge_button_L',
  'deck.right.fx.quick_select': 'merge_button_R',
  'deck.left.transport.load.main': 'load_1',
  'deck.right.transport.load.main': 'load_2',
  'deck.left.transport.load.alternate': 'load_3',
  'deck.right.transport.load.alternate': 'load_4',
  ...buildLoopCallRenderTargets('L', 'left'),
  ...buildLoopCallRenderTargets('R', 'right'),
  ...buildPadModeRenderTargets('L', 'left'),
  ...buildPadModeRenderTargets('R', 'right'),
  ...buildPadRenderTargets('L', 'left'),
  ...buildPadRenderTargets('R', 'right'),
});

const flx6SurfaceAliases = Object.freeze({
  xfader: 'xfader_slider',
  crossfader: 'xfader_slider',
  jog_L_touch: 'jog_L',
  jog_R_touch: 'jog_R',
});

const flx6GroupRules = Object.freeze([
  { className: 'board-shell', match: /^board$/i },
  { className: 'rail', match: /^(channel_|tempo_|xf_|xfader|rail_)/i },
  { className: 'fader', match: /^slider_ch[1-4]\b/i },
  { className: 'tempo', match: /^slider_tempo_(l|r)\b/i },
  { className: 'xfader', match: /^(xfader(_slider)?|crossfader)\b/i },
  { className: 'pad', match: /^pad_(l|r)_[0-8]\b/i },
  { className: 'pad-mode', match: /^(hotcue_|padfx_|sampler_|beatjump_|beatsync_)/i },
  {
    className: 'knob',
    test: ({ normalizedId = '' }) => (
      /^(knob_|trim_|hi_|mid_|low_|filter_)/i.test(normalizedId)
      || /^master_level(?:_base)?$/i.test(normalizedId)
      || /^master_knob$/i.test(normalizedId)
      || /^booth_level(?:_base)?$/i.test(normalizedId)
      || /^booth_level_knob$/i.test(normalizedId)
      || /^browser_scroll$/i.test(normalizedId)
      || /^browser_scoll_knob$/i.test(normalizedId)
      || /^beatfx_x5f_levels_x5f_knob(?:_x5f_1|2)?$/i.test(normalizedId)
    ),
  },
  {
    className: 'knob-notch',
    test: ({ normalizedId = '', tagName = '' }) => (
      normalizedId.includes('notch')
      || normalizedId.includes('pointer')
      || normalizedId.includes('knob_notch')
      || (tagName === 'path' && normalizedId.includes('knob'))
    ),
  },
  {
    className: 'button',
    match: /^(play_|cue_|shift_|beatsync_|master_[lr]$|decks_|jogcut_|vinyl_|deck_layer_(main|alt)_|reloop_exit_|loop_in_|loop_out_|select_loop_call_|loop_memory_|load_[1-4]$|browser_(view|back|push)$|deck_4_sampler_switch$|headphone_cue_|effects_x5f_on_x5f_off_x5f_button$|beatfx_(up|down|channel_select|select)$|merge_button_|hotcue_|padfx_|sampler_|beatjump_)/i,
  },
  { className: 'transport-button', match: /^(play_|cue_|shift_|beatsync_|master_[lr]$)/i },
  { className: 'loop-button', match: /^(reloop_exit_|loop_in_|loop_out_|select_loop_call_|loop_memory_)/i },
  { className: 'deck-button', match: /^(decks_|jogcut_|vinyl_|deck_layer_(main|alt)_)/i },
  { className: 'browser-button', match: /^(browser_(view|back|push)|deck_4_sampler_switch)$/i },
  { className: 'load-button', match: /^load_[1-4]$/i },
  { className: 'mixer-button', match: /^headphone_cue_/i },
  { className: 'fx-button', match: /^(effects_x5f_on_x5f_off_x5f_button|beatfx_(up|down|channel_select|select))$/i },
  { className: 'merge-fx', match: /^(merge_button_|knob_x5f_mergefx_|knob_mergefx_)/i },
  { className: 'deck-state', match: /^(merge_fx_state_|vinyl_|deck_layer_(main|alt)_)/i },
  { className: 'jog', match: /^jog_(x5f_)?[lr]$/i },
  { className: 'jog-ring', match: /^jog_[lr]_ring$/i },
  { className: 'jog-platter', match: /^jog_[lr]_platter$/i },
  { className: 'jog-touch', match: /^jog_[lr]_touch$/i },
  { className: 'jog-indicator', match: /^jog_[lr]_knob$/i },
  {
    className: 'label',
    test: ({ tagName = '', normalizedLabel = '' }) => (
      tagName === 'text'
      || tagName === 'tspan'
      || normalizedLabel === 'middle_text'
    ),
  },
  {
    className: 'decor',
    test: ({ tagName = '', normalizedLabel = '' }) => (
      tagName === 'g'
      && /(^text$|statetext|jog_text)/i.test(normalizedLabel)
    ),
  },
  {
    className: 'icon',
    test: ({ tagName = '', normalizedLabel = '' }) => (
      tagName === 'g'
      && /^(load|crossfader text|merge fx|1234|[1-4])$/i.test(normalizedLabel)
    ),
  },
]);

const flx6CalibrationHints = Object.freeze([
  {
    targetId: 'slider_ch1',
    axis: 'y',
    railIds: ['channel_1', 'channel_x5F_1', 'ch1', 'ch1_rail', 'rail_ch1', 'channel-1', 'channel1'],
  },
  {
    targetId: 'slider_ch2',
    axis: 'y',
    railIds: ['channel_2', 'channel_x5F_2', 'ch2', 'ch2_rail', 'rail_ch2', 'channel-2', 'channel2'],
  },
  {
    targetId: 'slider_ch3',
    axis: 'y',
    railIds: ['channel_3', 'channel_x5F_3', 'ch3', 'ch3_rail', 'rail_ch3', 'channel-3', 'channel3'],
  },
  {
    targetId: 'slider_ch4',
    axis: 'y',
    railIds: ['channel_4', 'channel_x5F_4', 'ch4', 'ch4_rail', 'rail_ch4', 'channel-4', 'channel4'],
  },
  {
    targetId: 'slider_TEMPO_L',
    axis: 'y',
    railIds: ['tempo_L', 'tempo_x5F_L', 'tempo-l'],
  },
  {
    targetId: 'slider_TEMPO_R',
    axis: 'y',
    railIds: ['tempo_R', 'tempo_x5F_R', 'tempo-r'],
  },
  {
    targetId: 'xfader_slider',
    axis: 'x',
    railIds: ['xfader', 'crossfader', 'xf_rail', 'xfader_rail'],
  },
]);

function buildChannelTargets(channel) {
  return [
    {
      targetId: `slider_ch${channel}`,
      canonicalTarget: `mixer.channel.${channel}.fader`,
      label: `Channel ${channel} Fader`,
      renderKind: 'fader',
    },
    {
      targetId: `headphone_cue_${channel}`,
      canonicalTarget: `mixer.channel.${channel}.cue`,
      label: `Channel ${channel} Cue`,
      aliases: [`cue_ch${channel}`],
      renderKind: 'button',
    },
    {
      targetId: `trim_${channel}`,
      canonicalTarget: `mixer.channel.${channel}.gain`,
      label: `Channel ${channel} Trim`,
      aliases: [`trim_ch${channel}`],
      renderKind: 'knob',
    },
    {
      targetId: `hi_${channel}`,
      canonicalTarget: `mixer.channel.${channel}.eq.high`,
      label: `Channel ${channel} EQ High`,
      aliases: [`eq_hi_ch${channel}`],
      renderKind: 'knob',
    },
    {
      targetId: `mid_${channel}`,
      canonicalTarget: `mixer.channel.${channel}.eq.mid`,
      label: `Channel ${channel} EQ Mid`,
      aliases: [`eq_mid_ch${channel}`],
      renderKind: 'knob',
    },
    {
      targetId: `low_${channel}`,
      canonicalTarget: `mixer.channel.${channel}.eq.low`,
      label: `Channel ${channel} EQ Low`,
      aliases: [`eq_low_ch${channel}`],
      renderKind: 'knob',
    },
    {
      targetId: `filter_${channel}`,
      canonicalTarget: `mixer.channel.${channel}.filter`,
      label: `Channel ${channel} Filter`,
      aliases: [`filter_ch${channel}`],
      renderKind: 'knob',
    },
    ...(channel === 4 ? [{
      targetId: 'channel_4',
      canonicalTarget: 'mixer.channel.4.input_select',
      label: 'CH4 Deck 4/Sampler Selector',
      aliases: ['input_select_ch4', 'ch4'],
      renderKind: 'button',
    }] : []),
  ];
}

function buildDeckTargets(side, sideLabel) {
  const deckLabel = sideLabel[0].toUpperCase() + sideLabel.slice(1);
  return [
    {
      targetId: `slider_TEMPO_${side}`,
      canonicalTarget: `deck.${sideLabel}.tempo.fader`,
      label: `${deckLabel} Tempo Fader`,
      renderKind: 'tempo',
    },
    {
      targetId: `jog_${side}`,
      canonicalTarget: `deck.${sideLabel}.jog.motion`,
      label: `${deckLabel} Jog`,
      aliases: [`jog_${side}_touch`],
      renderKind: 'jog',
    },
    {
      targetId: `jogcut_${side}`,
      canonicalTarget: `deck.${sideLabel}.jog.cutter`,
      label: `${deckLabel} Jog Cutter`,
      aliases: [`jogcut_x5F_${side}`],
      renderKind: 'button',
    },
    {
      targetId: `play_${side}`,
      canonicalTarget: `deck.${sideLabel}.transport.play`,
      label: `${deckLabel} Play`,
      renderKind: 'button',
    },
    {
      targetId: `cue_${side}`,
      canonicalTarget: `deck.${sideLabel}.transport.cue`,
      label: `${deckLabel} Cue`,
      renderKind: 'button',
    },
    {
      targetId: `beatsync_${side}`,
      canonicalTarget: `deck.${sideLabel}.transport.sync`,
      label: `${deckLabel} Sync`,
      renderKind: 'button',
    },
    {
      targetId: `master_${side}`,
      canonicalTarget: `deck.${sideLabel}.transport.master`,
      label: `${deckLabel} Master`,
      renderKind: 'button',
    },
    {
      targetId: `loop_in_${side}`,
      canonicalTarget: `deck.${sideLabel}.loop.in`,
      label: `${deckLabel} Loop In`,
      renderKind: 'button',
    },
    {
      targetId: `loop_out_${side}`,
      canonicalTarget: `deck.${sideLabel}.loop.out`,
      label: `${deckLabel} Loop Out`,
      renderKind: 'button',
    },
    {
      targetId: `select_loop_call_L${side}`,
      canonicalTarget: `deck.${sideLabel}.loop.call.backward`,
      label: `${deckLabel} Cue/Loop Call Left`,
      renderKind: 'button',
    },
    {
      targetId: `select_loop_call_R${side}`,
      canonicalTarget: `deck.${sideLabel}.loop.call.forward`,
      label: `${deckLabel} Cue/Loop Call Right`,
      renderKind: 'button',
    },
    {
      targetId: `loop_memory_${side}`,
      canonicalTarget: `deck.${sideLabel}.loop.memory`,
      label: `${deckLabel} Cue/Loop Memory`,
      renderKind: 'button',
    },
    {
      targetId: `decks_${side}`,
      canonicalTarget: `deck.${sideLabel}.transport.layer`,
      label: `${deckLabel} Deck Layer`,
      aliases: [`btn_DECK_SELECT_${side}`],
      renderKind: 'button',
    },
    ...flx6PadModeTargets.map((target) => ({
      targetId: `${target.targetPrefix}_${side}`,
      canonicalTarget: `deck.${sideLabel}.pad_mode.${target.mode}`,
      label: `${deckLabel} ${target.label} Mode`,
      ...(target.aliasPrefix ? { aliases: [`${target.aliasPrefix}_${side}`] } : {}),
      renderKind: 'pad-mode',
    })),
    {
      targetId: `knob_MERGEFX_${side}`,
      canonicalTarget: `deck.${sideLabel}.fx.quick`,
      label: `${deckLabel} Merge FX`,
      renderKind: 'encoder',
    },
    {
      targetId: `merge_button_${side}`,
      canonicalTarget: `deck.${sideLabel}.fx.quick_select`,
      label: `${deckLabel} Merge FX Select`,
      aliases: [`btn_MERGEFX_SEL_${side}`, `merge_button_${sideLabel}`],
      renderKind: 'button',
    },
    ...Array.from({ length: 8 }, (_, index) => ({
      targetId: `pad_${side}_${index + 1}`,
      canonicalTarget: `deck.${sideLabel}.pad.${index + 1}`,
      label: `${deckLabel} Pad ${index + 1}`,
      renderKind: 'pad',
    })),
  ];
}

function buildLoadTargets() {
  return [
    {
      targetId: 'load_1',
      canonicalTarget: 'deck.left.transport.load',
      label: 'Left Load Main',
      aliases: ['btn_LOAD_1'],
      renderKind: 'button',
    },
    {
      targetId: 'load_2',
      canonicalTarget: 'deck.right.transport.load',
      label: 'Right Load Main',
      aliases: ['btn_LOAD_2'],
      renderKind: 'button',
    },
    {
      targetId: 'load_3',
      canonicalTarget: 'deck.left.transport.load',
      label: 'Left Load Alternate',
      aliases: ['btn_LOAD_3'],
      renderKind: 'button',
    },
    {
      targetId: 'load_4',
      canonicalTarget: 'deck.right.transport.load',
      label: 'Right Load Alternate',
      aliases: ['btn_LOAD_4'],
      renderKind: 'button',
    },
  ];
}

function buildBeatFxTargets() {
  return [
    {
      targetId: 'beatfx_x5F_select',
      canonicalTarget: 'beatfx.select',
      label: 'Beat FX Select',
      aliases: ['beatfx_select'],
      renderKind: 'button',
    },
    {
      targetId: 'beatfx_x5F_channel_x5F_select',
      canonicalTarget: 'beatfx.channel_select',
      label: 'Beat FX Channel Select',
      aliases: ['beatfx_channel_select'],
      renderKind: 'button',
    },
    {
      targetId: 'beatfx_x5F_down',
      canonicalTarget: 'beatfx.beat.left',
      label: 'Beat FX Beat Left',
      aliases: ['beatfx_down'],
      renderKind: 'button',
    },
    {
      targetId: 'beatfx_x5F_up',
      canonicalTarget: 'beatfx.beat.right',
      label: 'Beat FX Beat Right',
      aliases: ['beatfx_up'],
      renderKind: 'button',
    },
    {
      targetId: 'beatfx_x5F_levels_x5F_knob',
      canonicalTarget: 'beatfx.level_depth',
      label: 'Beat FX Level Depth',
      aliases: ['beatfx_levels_knob', 'beatfx_levels_knob_1'],
      renderKind: 'knob',
    },
    {
      targetId: 'effects_x5F_on_x5F_off_x5F_button',
      canonicalTarget: 'beatfx.on_off',
      label: 'Beat FX On Off',
      aliases: ['effects_on_off_button'],
      renderKind: 'button',
    },
  ];
}

export const flx6Ui = Object.freeze({
  renderTargets: flx6RenderTargets,
  surfaceAliases: flx6SurfaceAliases,
  groupRules: flx6GroupRules,
  calibrationHints: flx6CalibrationHints,
  editorTargets: Object.freeze([
    {
      targetId: 'xfader_slider',
      canonicalTarget: 'mixer.crossfader',
      label: 'Crossfader',
      aliases: ['xfader', 'crossfader'],
      renderKind: 'xfader',
    },
    ...buildBeatFxTargets(),
    ...buildLoadTargets(),
    ...Array.from({ length: 4 }, (_, index) => buildChannelTargets(index + 1)).flat(),
    ...buildDeckTargets('L', 'left'),
    ...buildDeckTargets('R', 'right'),
  ]),
});

export default flx6Ui;
