const assert = require('assert');
const { FRAME_RENDERER_TYPES, getInnerFrameStyle } = require('../miniprogram/core/innerFrameStyles');
const {
  normalizeRendererType,
  normalizeFilmFrameStyle,
  resolveFrameNumberValue
} = require('../miniprogram/core/filmFrameStyle');

function testLegacyNormalization() {
  const legacy = {
    id: 'legacy-film',
    category: 'film-rebate',
    renderer: FRAME_RENDERER_TYPES.FILM_REBATE_LAYOUT,
    color: '#111111',
    filmLayout: {
      geometry: {
        rebates: { topRatio: 0.15, rightRatio: 0.03, bottomRatio: 0.16, leftRatio: 0.03 }
      },
      sizePresets: {
        compact: { topScale: 0.8, rightScale: 0.8, bottomScale: 0.8, leftScale: 0.8 }
      }
    },
    perforations: { enabled: true, sides: ['top', 'bottom'], count: 8, shape: 'rounded-rect' },
    labels: { enabled: true, position: 'top-left', text: 'BF COLOR 400' },
    frameNumbers: { enabled: true, positions: ['bottom-left', 'bottom-center'] },
    markers: { enabled: true, positions: ['bottom-right'] }
  };
  const canonical = normalizeFilmFrameStyle(legacy);
  assert.strictEqual(normalizeRendererType(legacy.renderer), FRAME_RENDERER_TYPES.FILM_FRAME);
  assert.strictEqual(canonical.renderer, FRAME_RENDERER_TYPES.FILM_FRAME);
  assert.strictEqual(canonical.layoutModel, 'film-frame');
  assert.strictEqual(canonical.geometry.rebates.top, 0.15);
  assert.strictEqual(canonical.frame.sizePresets.compact.top, 0.8);
  assert.strictEqual(canonical.perforations.count, 8);
  assert.strictEqual(canonical.decorations.labels[0].anchor, 'top-start');
  assert.strictEqual(canonical.decorations.frameNumbers.length, 2);
  assert.strictEqual(canonical.decorations.markers[0].anchor, 'bottom-end');
}

function testProductionCanonicalDefinitions() {
  ['film-strip-35mm-full', 'film-rebate-minimal', 'film-35mm-mono', 'film-35mm-warm', 'film-120-classic', 'film-16mm-cinema', 'film-110-pocket', 'film-contact-sheet'].forEach(id => {
    const style = getInnerFrameStyle(id);
    const canonical = normalizeFilmFrameStyle(style);
    assert.strictEqual(style.renderer, FRAME_RENDERER_TYPES.FILM_FRAME);
    assert.strictEqual(canonical.id, id);
    assert.strictEqual(canonical.geometry.aperture.shape, 'rect');
    assert(canonical.geometry.aperture.cornerRadiusRatio <= 0.01);
    assert(canonical.frame.sizePresets.standard);
  });
}

function testFrameNumberRules() {
  assert.strictEqual(resolveFrameNumberValue({ literal: '42' }, 3), '42');
  assert.strictEqual(resolveFrameNumberValue('sequence', 3), '3');
  assert.strictEqual(resolveFrameNumberValue('sequence-2-digit', 3), '03');
  assert.strictEqual(resolveFrameNumberValue('sequence-alpha', 3), '3A');
}

testLegacyNormalization();
testProductionCanonicalDefinitions();
testFrameNumberRules();
console.log('film frame style tests passed');
