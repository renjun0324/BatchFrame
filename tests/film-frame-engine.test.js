const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { getInnerFrameStyle } = require('../miniprogram/core/innerFrameStyles');
const { layoutInnerFrame } = require('../miniprogram/core/innerFrameLayout');
const {
  FRAME_RENDERERS,
  drawFilmFrame,
  drawFilmMarker,
  drawTextureOverlay,
  selectTextureVariant,
  getMaskAssetPaths
} = require('../miniprogram/core/innerFrameRenderer');
const { renderComposite } = require('../miniprogram/core/compositeRenderer');

function recordingContext() {
  const calls = [];
  const ctx = new Proxy({}, {
    get(_target, key) { return (...args) => calls.push({ key, args }); },
    set(_target, key, value) { calls.push({ key: `set:${key}`, args: [value] }); return true; }
  });
  return { ctx, calls };
}

function filmLayout(styleId, orientation = 'landscape') {
  return layoutInnerFrame({
    outputRect: { x: 0, y: 0, width: 1800, height: 1200 },
    outerLayout: { padding: 18, zoom: 0.95 },
    imageAspect: orientation === 'portrait' ? 3 / 4 : 4 / 3,
    orientation,
    frameIndex: 2,
    style: getInnerFrameStyle(styleId)
  });
}

function testGenericRendererHasNoStyleBranch() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'miniprogram/core/innerFrameRenderer.js'), 'utf8');
  const generic = source.slice(source.indexOf('function drawFilmFrame'), source.indexOf('function drawFragments'));
  assert(!generic.includes('film-strip-35mm-full'));
  assert(!generic.includes('film-rebate-minimal'));
  ['film-35mm-mono', 'film-35mm-warm', 'film-120-classic', 'film-16mm-cinema', 'film-110-pocket', 'film-contact-sheet'].forEach(id => {
    assert(!generic.includes(id), `${id} must not create a renderer branch`);
  });
  assert.strictEqual(FRAME_RENDERERS['film-frame'], drawFilmFrame);
}

function testRectAperturesDoNotCurve() {
  ['film-strip-35mm-full', 'film-rebate-minimal', 'film-35mm-mono', 'film-35mm-warm', 'film-120-classic', 'film-16mm-cinema', 'film-110-pocket', 'film-contact-sheet'].forEach(styleId => {
    const { ctx, calls } = recordingContext();
    drawFilmFrame({
      ctx,
      image: { width: 1600, height: 1200 },
      style: getInnerFrameStyle(styleId),
      layout: filmLayout(styleId),
      backgroundColor: '#FFFFFF'
    });
    const apertureClip = calls.findIndex(call => call.key === 'clip');
    assert(apertureClip >= 0);
    assert(!calls.slice(0, apertureClip + 1).some(call => call.key === 'quadraticCurveTo'), `${styleId} aperture must remain rectangular`);
    assert(calls.some(call => call.key === 'drawImage'));
  });
}

function testFirstBatchDefinitionsAndStructures() {
  const expected = {
    'film-35mm-mono': { holes: 16, sides: ['top', 'bottom'], frame: '#050505', accent: '#D8D8D2' },
    'film-35mm-warm': { holes: 16, sides: ['top', 'bottom'], frame: '#130D09', accent: '#D98235' },
    'film-120-classic': { holes: 0, sides: [], frame: '#040404', accent: '#DDD8CC' },
    'film-16mm-cinema': { holes: 26, sides: ['top', 'bottom'], frame: '#050505', accent: '#E4B45E' },
    'film-110-pocket': { holes: 8, sides: ['bottom'], frame: '#080706', accent: '#E1D7C5' },
    'film-contact-sheet': { holes: 0, sides: [], frame: '#090909', accent: '#E7E0D2' }
  };
  Object.entries(expected).forEach(([styleId, expectation]) => {
    const style = getInnerFrameStyle(styleId);
    assert.strictEqual(style.renderer, 'film-frame');
    assert.strictEqual(style.layoutModel, 'film-frame');
    assert.strictEqual(style.category, 'film-rebate');
    assert.strictEqual(style.material.textureOverlay, null);
    assert.strictEqual(style.frame.color, expectation.frame);
    const landscape = filmLayout(styleId, 'landscape');
    const portrait = filmLayout(styleId, 'portrait');
    assert.strictEqual(landscape.decorationRects.perforations.length, expectation.holes);
    assert.strictEqual(portrait.decorationRects.perforations.length, expectation.holes);
    assert.deepStrictEqual([...new Set(landscape.decorationRects.perforations.map(item => item.side))], expectation.sides);
    const rotated = expectation.sides.map(side => ({ top: 'right', right: 'bottom', bottom: 'left', left: 'top' }[side]));
    assert.deepStrictEqual([...new Set(portrait.decorationRects.perforations.map(item => item.side))], rotated);
    assert(landscape.decorationRects.labels.concat(landscape.decorationRects.frameNumbers, landscape.decorationRects.markers)
      .some(item => item.color === expectation.accent));
    assert(landscape.apertureRect.width > 0 && landscape.apertureRect.height > 0);
  });
  assert(getInnerFrameStyle('medium-format-120'), 'legacy 120 must remain registered');
}

function testMarkerPrimitives() {
  ['triangle', 'square', 'circle', 'line', 'arrow'].forEach(type => {
    const { ctx, calls } = recordingContext();
    drawFilmMarker(ctx, { type, color: '#F3A126', box: { x: 1, y: 1, width: 12, height: 10 } });
    assert(calls.length > 0, `${type} marker must draw`);
  });
}

function testTextureLayer() {
  assert.strictEqual(getMaskAssetPaths('film-strip-35mm-full', 1), null, 'untextured films must not load masks');
  assert.strictEqual(getMaskAssetPaths('film-rebate-minimal', 1), null, 'untextured films must not load masks');
  const overlay = { type: 'segmented-mask', root: 'assets/example', variants: 3, placement: 'outer-edge' };
  assert.strictEqual(selectTextureVariant(overlay, 'future-film', 'seed-a'), selectTextureVariant(overlay, 'future-film', 'seed-a'));
  const { ctx, calls } = recordingContext();
  const masks = { 'top-left': {}, top: {}, 'top-right': {}, right: {}, 'bottom-right': {}, bottom: {}, 'bottom-left': {}, left: {} };
  drawTextureOverlay(ctx, overlay, masks, { x: 20, y: 20, width: 400, height: 280 }, { x: 40, y: 40, width: 360, height: 240 });
  assert.strictEqual(calls.filter(call => call.key === 'drawImage').length, 8);
}

function testPreviewExportProportions() {
  const image = { width: 4000, height: 3000 };
  const common = {
    image, imageId: 'same-image', imageSeed: 'same-image',
    layoutSettings: { zoom: 0.95, layoutPadding: 18 },
    outerBackgroundSettings: { enabled: true, color: '#FFFFFF' },
    innerFrameSettings: { enabled: true, styleId: 'film-strip-35mm-full', frameIndex: 2 }
  };
  const preview = renderComposite({ ...common, ctx: recordingContext().ctx, outWidth: 900, outHeight: 600 });
  const exported = renderComposite({ ...common, ctx: recordingContext().ctx, outWidth: 1800, outHeight: 1200 });
  const ratio = (result, rectangle) => ({
    x: (rectangle.x - result.frameRect.x) / result.frameRect.width,
    y: (rectangle.y - result.frameRect.y) / result.frameRect.height,
    width: rectangle.width / result.frameRect.width,
    height: rectangle.height / result.frameRect.height
  });
  const a = ratio(preview, preview.apertureRect);
  const b = ratio(exported, exported.apertureRect);
  ['x', 'y', 'width', 'height'].forEach(key => assert(Math.abs(a[key] - b[key]) < 1e-9));
  assert.deepStrictEqual(
    preview.decorationRects.perforations.map(item => item.side),
    exported.decorationRects.perforations.map(item => item.side)
  );
}

testGenericRendererHasNoStyleBranch();
testRectAperturesDoNotCurve();
testMarkerPrimitives();
testFirstBatchDefinitionsAndStructures();
testTextureLayer();
testPreviewExportProportions();
console.log('film frame engine tests passed');
