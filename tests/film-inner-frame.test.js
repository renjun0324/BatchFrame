const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  FRAME_RENDERER_TYPES,
  INNER_FRAME_STYLES,
  getInnerFrameStyle,
  getStrengthPreset
} = require('../miniprogram/core/innerFrameStyles');
const {
  calculateImageRect,
  scaleFrameWidth
} = require('../miniprogram/core/frameGeometry');
const {
  generateNormalizedEdgeProfile,
  buildFramePaths,
  selectMaskVariant,
  getMaskAssetPaths,
  FRAME_RENDERERS,
  drawImageWithInnerFrame
} = require('../miniprogram/core/innerFrameRenderer');
const { renderComposite } = require('../miniprogram/core/compositeRenderer');

function testDeterminism() {
  const first = generateNormalizedEdgeProfile({ styleId: 'emulsion-damage', seed: 'image-1', strength: 1 });
  const second = generateNormalizedEdgeProfile({ styleId: 'emulsion-damage', seed: 'image-1', strength: 1 });
  const other = generateNormalizedEdgeProfile({ styleId: 'emulsion-damage', seed: 'image-2', strength: 1 });
  assert.deepStrictEqual(first, second, 'same seed must produce the same profile');
  assert.notDeepStrictEqual(first, other, 'different seeds should produce different profiles');
  assert.strictEqual(selectMaskVariant('full-frame-scan', 'image-1'), selectMaskVariant('full-frame-scan', 'image-1'));
  assert(Object.keys(getMaskAssetPaths('emulsion-damage', 2, 'light')).length === 8);
  assert.notStrictEqual(
    getMaskAssetPaths('emulsion-damage', 2, 'light').top,
    getMaskAssetPaths('emulsion-damage', 2, 'strong').top
  );
}

function testStyleRegistry() {
  const expected = ['none', 'clean-black', 'full-frame-scan', 'film-gate', 'film-strip-35mm-full', 'film-rebate-minimal', 'medium-format-120', 'emulsion-damage'];
  assert.deepStrictEqual(INNER_FRAME_STYLES.map(style => style.id), expected);
  INNER_FRAME_STYLES.forEach(style => {
    assert(FRAME_RENDERERS[style.renderer], `${style.id} must have a renderer`);
    assert(style.supportedRatios.length > 0);
    const previewPath = path.join(__dirname, '..', 'miniprogram', style.previewAsset.replace(/^\//, ''));
    assert(fs.existsSync(previewPath), `${style.id} selector preview must exist`);
    assert(fs.statSync(previewPath).size > 0, `${style.id} selector preview must be non-empty`);
    if (style.id === 'film-gate') assert.strictEqual(style.renderer, FRAME_RENDERER_TYPES.FILM_GATE);
    if (style.id === 'film-strip-35mm-full') assert.strictEqual(style.renderer, FRAME_RENDERER_TYPES.FILM_REBATE_LAYOUT);
    if (style.id === 'film-rebate-minimal') assert.strictEqual(style.renderer, FRAME_RENDERER_TYPES.FILM_REBATE_LAYOUT);
    if (style.id === 'medium-format-120') assert.strictEqual(style.renderer, FRAME_RENDERER_TYPES.MEDIUM_FORMAT_REBATE);
  });
}

function testPathBoundsAndThickness() {
  const photoRect = { x: 300, y: 240, width: 1200, height: 720 };
  for (const style of INNER_FRAME_STYLES) {
    if (style.id === 'none' || style.layoutModel === 'film-rebate') continue;
    const paths = buildFramePaths({
      photoRect,
      frameWidth: scaleFrameWidth(style.widthAt1800, 1800),
      styleId: style.id,
      seed: 'bounds-test'
    });
    assert(paths.outer.length >= 32 && paths.outer.length <= 256);
    assert.strictEqual(paths.outer.length, paths.inner.length);
    paths.outer.concat(paths.inner).forEach(point => {
      assert(Number.isFinite(point.x) && Number.isFinite(point.y));
    });
    assert(!hasSelfIntersection(paths.outer), `${style.id} outer path must not self-intersect`);
    assert(!hasSelfIntersection(paths.inner), `${style.id} inner path must not self-intersect`);
    const minTopThickness = Math.min(...paths.outer.slice(0, 32).map((point, index) =>
      paths.inner[index].y - point.y
    ));
    assert(minTopThickness > 0, `${style.id} must retain a positive border width`);
  }
}

function orientation(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentsIntersect(a, b, c, d) {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  return (abC > 0) !== (abD > 0) && (cdA > 0) !== (cdB > 0);
}

function hasSelfIntersection(points) {
  points = points.filter((point, index) => {
    const previous = points[(index + points.length - 1) % points.length];
    return point.x !== previous.x || point.y !== previous.y;
  });
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    for (let j = i + 1; j < points.length; j += 1) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      const c = points[j];
      const d = points[(j + 1) % points.length];
      if (segmentsIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

function testGeometryAndScaling() {
  const ratios = [[1, 1], [3, 4], [4, 5], [2, 3], [9, 16], [16, 9]];
  const images = [[4000, 4000], [4000, 3000], [3000, 4000], [6000, 3000]];
  ratios.forEach(([rw, rh]) => {
    images.forEach(([iw, ih]) => {
      const rect = calculateImageRect({
        outWidth: 1800 * rw / Math.max(rw, rh),
        outHeight: 1800 * rh / Math.max(rw, rh),
        imageWidth: iw,
        imageHeight: ih,
        zoom: 0.95,
        layoutPadding: 18
      });
      assert(rect.width > 0 && rect.height > 0);
      assert(Math.abs(rect.width / rect.height - iw / ih) < 1e-9);
    });
  });
  [1200, 1800, 2400, 4000].forEach(longEdge => {
    assert.strictEqual(scaleFrameWidth(12, longEdge), 12 * longEdge / 1800);
  });
}

function testRenderEntryPoint() {
  const calls = [];
  const ctx = new Proxy({}, {
    get(_target, key) {
      return (...args) => calls.push([key, args]);
    }
  });
  const result = renderComposite({
    ctx,
    outWidth: 1800,
    outHeight: 1200,
    image: { width: 4000, height: 2000 },
    imageId: 'image-1',
    imageSeed: 'image-1',
    layoutSettings: { zoom: 0.95, layoutPadding: 18 },
    outerBackgroundSettings: { enabled: true, color: '#FFFFFF' },
    innerFrameSettings: {
      enabled: true,
      styleId: 'full-frame-scan',
      widthAt1800: 12,
      strengthLevel: 'medium',
      maskImages: {
        'top-left': {}, top: {}, 'top-right': {}, right: {},
        'bottom-right': {}, bottom: {}, 'bottom-left': {}, left: {}
      }
    }
  });
  assert.strictEqual(result.frameWidth, 12);
  assert.strictEqual(result.styleId, 'full-frame-scan');
  assert(result.paths);
  assert(calls.some(call => call[0] === 'clip'));
  assert(calls.some(call => call[0] === 'drawImage'));

  const none = renderComposite({
    ctx,
    outWidth: 1800,
    outHeight: 1800,
    image: { width: 1000, height: 1000 },
    imageId: 'image-1',
    innerFrameSettings: { enabled: true, styleId: 'none', widthAt1800: 16 }
  });
  assert.strictEqual(none.styleId, 'none');
  assert.strictEqual(none.frameWidth, 0);
}

function testDedicatedRenderers() {
  const ctx = new Proxy({}, { get: () => (...args) => args });
  const image = { width: 1200, height: 800 };
  const maskImages = {
    'top-left': {}, top: {}, 'top-right': {}, right: {},
    'bottom-right': {}, bottom: {}, 'bottom-left': {}, left: {}
  };
  ['film-gate', 'film-strip-35mm-full', 'film-rebate-minimal', 'medium-format-120', 'emulsion-damage'].forEach(styleId => {
    const result = renderComposite({
      ctx, outWidth: 1800, outHeight: 1200, image, imageId: styleId,
      imageSeed: 'stable-seed',
      outerBackgroundSettings: { enabled: true, color: '#FFFFFF' },
      innerFrameSettings: {
        enabled: true, styleId, widthAt1800: getInnerFrameStyle(styleId).widthAt1800,
        strengthLevel: 'medium', maskImages
      }
    });
    assert.strictEqual(result.styleId, styleId);
    assert(result.paths, `${styleId} should return renderer geometry`);
  });
}

function recordingContext() {
  const calls = [];
  const ctx = new Proxy({}, {
    get(_target, key) {
      return (...args) => calls.push({ name: key, args });
    },
    set(_target, key, value) {
      calls.push({ name: `set:${key}`, args: [value] });
      return true;
    }
  });
  return { ctx, calls };
}

function testHardRenderersKeepRectangularWindows() {
  const image = { width: 1200, height: 800 };
  const photoRect = { x: 300, y: 240, width: 900, height: 600 };
  ['clean-black', 'film-gate', 'medium-format-120'].forEach(styleId => {
    const { ctx, calls } = recordingContext();
    drawImageWithInnerFrame({
      ctx, image, photoRect, frameWidth: getInnerFrameStyle(styleId).widthAt1800,
      styleId, seed: 'shape-seed', color: '#050505', backgroundColor: '#FFFFFF'
    });
    assert(!calls.some(call => call.name === 'quadraticCurveTo' || call.name === 'bezierCurveTo'), `${styleId} must not curve the photo window`);
    const draw = calls.find(call => call.name === 'drawImage');
    assert(draw, `${styleId} must draw the photo`);
    assert.deepStrictEqual(draw.args.slice(-4), [photoRect.x, photoRect.y, photoRect.width, photoRect.height]);
  });
}

function testStrengthSemantics() {
  const photoRect = { x: 300, y: 240, width: 1200, height: 720 };
  const light = buildFramePaths({ photoRect, frameWidth: 18, styleId: 'full-frame-scan', seed: 'strength-seed', strengthLevel: 'light' });
  const strong = buildFramePaths({ photoRect, frameWidth: 18, styleId: 'full-frame-scan', seed: 'strength-seed', strengthLevel: 'strong' });
  assert(strong.outerVariation > light.outerVariation * 1.5, 'strong scan profile should have substantially greater intrusion range');
  assert(getStrengthPreset('emulsion-damage', 'strong').fragmentDensity > getStrengthPreset('emulsion-damage', 'light').fragmentDensity * 2);
  assert(getStrengthPreset('emulsion-damage', 'strong').fragmentSize > getStrengthPreset('emulsion-damage', 'light').fragmentSize);
  const lightProfile = generateNormalizedEdgeProfile({ styleId: 'full-frame-scan', seed: 'strength-seed', strengthLevel: 'light' });
  const strongProfile = generateNormalizedEdgeProfile({ styleId: 'full-frame-scan', seed: 'strength-seed', strengthLevel: 'strong' });
  const lightPeak = Math.max(...lightProfile.top.map(point => Math.abs(point.value)));
  const strongPeak = Math.max(...strongProfile.top.map(point => Math.abs(point.value)));
  assert(strongPeak > lightPeak * 1.5, 'strong scan profile should move more than light');
}

testStyleRegistry();
testDeterminism();
testPathBoundsAndThickness();
testGeometryAndScaling();
testRenderEntryPoint();
testDedicatedRenderers();
testHardRenderersKeepRectangularWindows();
testStrengthSemantics();
console.log('film inner frame tests passed');
