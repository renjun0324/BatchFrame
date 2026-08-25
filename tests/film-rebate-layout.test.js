const assert = require('assert');
const { getInnerFrameStyle } = require('../miniprogram/core/innerFrameStyles');
const { layoutInnerFrame } = require('../miniprogram/core/innerFrameLayout');
const { renderComposite } = require('../miniprogram/core/compositeRenderer');

function inside(outer, inner) {
  return inner.x >= outer.x && inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height;
}

function layout(styleId, aspect, orientation = 'landscape', preset = 'standard') {
  return layoutInnerFrame({
    outputRect: { x: 0, y: 0, width: 1800, height: 1200 },
    outerLayout: { padding: 18, zoom: 0.95 },
    imageAspect: aspect,
    orientation,
    frameSizePreset: preset,
    style: getInnerFrameStyle(styleId)
  });
}

function test35mmRatios() {
  assert.strictEqual(getInnerFrameStyle('film-strip-35mm-full').category, 'film-rebate');
  assert.strictEqual(getInnerFrameStyle('film-strip-35mm-full').perforations.count, 8);
  const result = layout('film-strip-35mm-full', 4 / 3);
  const { frameRect, apertureRect } = result;
  const top = (apertureRect.y - frameRect.y) / frameRect.height;
  const bottom = (frameRect.y + frameRect.height - apertureRect.y - apertureRect.height) / frameRect.height;
  const left = (apertureRect.x - frameRect.x) / frameRect.width;
  const right = (frameRect.x + frameRect.width - apertureRect.x - apertureRect.width) / frameRect.width;
  assert(Math.abs(top - 0.154) < 0.002);
  assert(Math.abs(bottom - 0.154) < 0.002);
  assert(Math.abs(left - 0.027) < 0.002);
  assert(Math.abs(right - 0.027) < 0.002);
  assert.strictEqual(result.decorationRects.perforations.length, 16);
}

function testMinimalRatios() {
  assert.strictEqual(getInnerFrameStyle('film-rebate-minimal').perforations.enabled, false);
  const result = layout('film-rebate-minimal', 4 / 3);
  const { frameRect, apertureRect } = result;
  [
    (apertureRect.y - frameRect.y) / frameRect.height,
    (frameRect.y + frameRect.height - apertureRect.y - apertureRect.height) / frameRect.height,
    (apertureRect.x - frameRect.x) / frameRect.width,
    (frameRect.x + frameRect.width - apertureRect.x - apertureRect.width) / frameRect.width
  ].forEach(value => assert(value >= 0.031 && value <= 0.034));
  assert.strictEqual(result.decorationRects.perforations.length, 0);
}

function testNestedAndOrientation() {
  ['film-strip-35mm-full', 'film-rebate-minimal'].forEach(styleId => {
    ['landscape', 'portrait'].forEach(orientation => {
      const aspect = orientation === 'portrait' ? 3 / 4 : 4 / 3;
      const result = layout(styleId, aspect, orientation, 'compact');
      assert(result.containsFrame && result.containsAperture);
      assert(inside(result.innerAvailableRect, result.frameRect));
      assert(inside(result.frameRect, result.apertureRect));
      assert(result.apertureRect.width > 0 && result.apertureRect.height > 0);
      if (styleId === 'film-strip-35mm-full') {
        assert.strictEqual(result.decorationRects.perforations.length, 16);
        const first = result.decorationRects.perforations[0];
        if (orientation === 'portrait') {
          assert.strictEqual(first.side, 'right');
          assert(first.box.x >= result.apertureRect.x + result.apertureRect.width);
        } else {
          assert.strictEqual(first.side, 'top');
          assert(first.box.y + first.box.height <= result.apertureRect.y);
        }
        assert(result.decorationRects.labels.length === 1);
        assert(result.decorationRects.frameNumbers.length === 1 || result.decorationRects.frameNumbers.length === 2);
      }
    });
  });
}

function testMarginOnlyChangesModulePlacement() {
  const style = getInnerFrameStyle('film-strip-35mm-full');
  const large = layoutInnerFrame({ outputRect: { x: 0, y: 0, width: 1800, height: 1200 }, outerLayout: { padding: 220, zoom: 1 }, imageAspect: 4 / 3, style });
  const small = layoutInnerFrame({ outputRect: { x: 0, y: 0, width: 1800, height: 1200 }, outerLayout: { padding: 18, zoom: 1 }, imageAspect: 4 / 3, style });
  assert.strictEqual(large.rebates.top, small.rebates.top);
  assert.strictEqual(large.rebates.left, small.rebates.left);
  assert(large.frameRect.width < small.frameRect.width);
  assert(large.frameRect.x > small.frameRect.x);
}

function testRendererReturnsLayout() {
  const calls = [];
  const ctx = new Proxy({}, { get: (_target, key) => (...args) => calls.push({ key, args }) });
  const result = renderComposite({
    ctx,
    outWidth: 1800,
    outHeight: 1200,
    image: { width: 4000, height: 3000 },
    imageId: 'film-image',
    imageSeed: 'film-image',
    layoutSettings: { zoom: 0.95, layoutPadding: 18 },
    outerBackgroundSettings: { enabled: true, color: '#FFFFFF' },
    innerFrameSettings: {
      enabled: true,
      styleId: 'film-strip-35mm-full',
      frameSizePreset: 'standard',
      perforationsEnabled: true,
      edgeLabelEnabled: true,
      frameNumberEnabled: true,
      markersEnabled: true,
      frameIndex: 2
    }
  });
  assert(result.innerAvailableRect && result.frameRect && result.apertureRect && result.decorationRects);
  assert.strictEqual(result.decorationRects.perforations.length, 16);
  assert(calls.some(call => call.key === 'drawImage'));
  assert(calls.some(call => call.key === 'fillText'));
}

function testImageZoomStaysInsideAperture() {
  const calls = [];
  const ctx = new Proxy({}, { get: (_target, key) => (...args) => calls.push({ key, args }) });
  const common = {
    ctx,
    outWidth: 1800,
    outHeight: 1200,
    image: { width: 4000, height: 3000 },
    imageId: 'zoom-image',
    imageSeed: 'zoom-image',
    layoutSettings: { zoom: 0.95, layoutPadding: 18 },
    outerBackgroundSettings: { enabled: true, color: '#FFFFFF' },
    innerFrameSettings: { enabled: true, styleId: 'film-strip-35mm-full' }
  };
  const base = renderComposite(common);
  const enlarged = renderComposite({
    ...common,
    innerFrameSettings: { ...common.innerFrameSettings, imageZoom: 1.5 }
  });
  assert.strictEqual(base.frameRect.width, enlarged.frameRect.width, 'image zoom must not resize the frame module');
  assert.strictEqual(base.apertureRect.width, enlarged.apertureRect.width, 'image zoom must not resize the aperture');
  assert(enlarged.imageDrawRect.width > base.imageDrawRect.width * 1.45);
  assert(enlarged.imageDrawRect.height > base.imageDrawRect.height * 1.45);
  const reduced = renderComposite({
    ...common,
    innerFrameSettings: { ...common.innerFrameSettings, imageZoom: 0.5 }
  });
  assert(reduced.imageDrawRect.width < base.imageDrawRect.width * 0.55);
  assert(reduced.imageDrawRect.height < base.imageDrawRect.height * 0.55);
}

test35mmRatios();
testMinimalRatios();
testNestedAndOrientation();
testMarginOnlyChangesModulePlacement();
testRendererReturnsLayout();
testImageZoomStaysInsideAperture();
console.log('film rebate layout tests passed');
