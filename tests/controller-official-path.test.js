import test from 'node:test';
import assert from 'node:assert/strict';

import {
  controllerLayerVersion,
  officialControllerRuntimePath,
} from '../src/controllers/index.js';
import { officialControllerAdapterId, controllerAdapters } from '../src/controllers/adapters/index.js';
import { controllerCoreReady } from '../src/controllers/core/index.js';
import {
  controllerProfiles,
  getDefaultControllerProfile,
  getOfficialControllerProfile,
  officialControllerProfileId,
  officialDemoControllerProfile,
} from '../src/controllers/profiles/index.js';

test('official controller lane points at the host/viewer WebMIDI FLX6 runtime', () => {
  assert.equal(controllerLayerVersion, '0.1.0');
  assert.equal(controllerCoreReady, true);

  assert.deepEqual(officialControllerRuntimePath, {
    hostEntrypoint: 'host.html',
    viewerEntrypoint: 'viewer.html',
    transport: 'browser-web-midi',
    adapterId: 'generic-web-midi',
    controllerRoot: 'src/controllers',
    demoProfileId: 'pioneer-ddj-flx6',
  });

  assert.equal(officialControllerAdapterId, 'generic-web-midi');
  assert.deepEqual(controllerAdapters, ['generic-web-midi']);
  assert.equal(controllerProfiles.length, 1);
  assert.equal(controllerProfiles[0].id, 'pioneer-ddj-flx6');
  assert.equal(officialDemoControllerProfile.id, 'pioneer-ddj-flx6');
  assert.equal(officialControllerProfileId, 'pioneer-ddj-flx6');
  assert.equal(getDefaultControllerProfile().id, 'pioneer-ddj-flx6');
  assert.equal(getOfficialControllerProfile().id, 'pioneer-ddj-flx6');
});
