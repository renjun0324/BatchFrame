const assert = require('assert');
const {
  INNER_FRAME_STYLES,
  getInnerFrameStyle
} = require('../core/innerFrameStyles');
const {
  calculateImageRect,
  scaleFrameWidth
} = require('../core/frameGeometry');
const {
  generateNormalizedEdgeProfile,
  buildFramePaths
} = require('../core/innerFrameRenderer');
const { renderComposite } = require('../core/compositeRenderer');

function testDeterminism() {
  const first = generateNormalizedEdgeProfile({ styleId: 'rough-emulsion', seed: 'image-1', strength: 1 });
  const second = generateNormalizedEdgeProfile({ styleId: 'rough-emulsion', seed: 'image-1', strength: 1 });
  const other = generateNormalizedEdgeProfile({ styleId: 'rough-emulsion', seed: 'image-2', strength: 1 });
  assert.deepStrictEqual(first, second, 'same seed must produce the same profile');
  assert.notDeepStrictEqual(first, other, 'different seeds should produce different profiles');
}

function testPathBoundsAndThickness() {
  const photoRect = { x: 300, y: 240, width: 1200, height: 720 };
  for (const style of INNER_FRAME_STYLES) {
    if (style.id === 'none') continue;
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
    const minTopThickness = Math.min(...paths.outer.slice(0, 32).map((point, index) =>
      paths.inner[index].y - point.y
    ));
    assert(minTopThickness > 0, `${style.id} must retain a positive border width`);
  }
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
      styleId: 'darkroom-scan',
      widthAt1800: 12,
      strengthLevel: 'medium'
    }
  });
  assert.strictEqual(result.frameWidth, 12);
  assert.strictEqual(result.styleId, 'darkroom-scan');
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

testDeterminism();
testPathBoundsAndThickness();
testGeometryAndScaling();
testRenderEntryPoint();
console.log('film inner frame tests passed');
