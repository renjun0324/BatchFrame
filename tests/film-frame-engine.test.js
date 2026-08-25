const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { getInnerFrameStyle } = require('../miniprogram/core/innerFrameStyles');
const { layoutInnerFrame } = require('../miniprogram/core/innerFrameLayout');
const {
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
}

function testRectAperturesDoNotCurve() {
  ['film-strip-35mm-full', 'film-rebate-minimal'].forEach(styleId => {
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
testTextureLayer();
testPreviewExportProportions();
console.log('film frame engine tests passed');
