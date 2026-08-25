const assert = require('assert');
const { getInnerFrameStyle } = require('../miniprogram/core/innerFrameStyles');
const {
  layoutInnerFrame,
  resolveDecorationAnchor,
  resolvePerforationPositions
} = require('../miniprogram/core/innerFrameLayout');

function layout(styleId, orientation) {
  return layoutInnerFrame({
    outputRect: { x: 0, y: 0, width: 1800, height: 1200 },
    outerLayout: { padding: 18, zoom: 0.95 },
    imageAspect: orientation === 'portrait' ? 3 / 4 : 4 / 3,
    orientation,
    frameIndex: 2,
    style: getInnerFrameStyle(styleId)
  });
}

function inside(outer, inner) {
  return inner.x >= outer.x - 1e-6 && inner.y >= outer.y - 1e-6 &&
    inner.x + inner.width <= outer.x + outer.width + 1e-6 &&
    inner.y + inner.height <= outer.y + outer.height + 1e-6;
}

function testGeometryParity() {
  const full = layout('film-strip-35mm-full', 'landscape');
  const minimal = layout('film-rebate-minimal', 'landscape');
  const fullRebates = [
    (full.apertureRect.y - full.frameRect.y) / full.frameRect.height,
    (full.apertureRect.x - full.frameRect.x) / full.frameRect.width,
    (full.frameRect.y + full.frameRect.height - full.apertureRect.y - full.apertureRect.height) / full.frameRect.height,
    (full.frameRect.x + full.frameRect.width - full.apertureRect.x - full.apertureRect.width) / full.frameRect.width
  ];
  [0.154, 0.027, 0.154, 0.027].forEach((expected, index) => assert(Math.abs(fullRebates[index] - expected) < 0.005));
  const minimalRebates = [
    (minimal.apertureRect.y - minimal.frameRect.y) / minimal.frameRect.height,
    (minimal.apertureRect.x - minimal.frameRect.x) / minimal.frameRect.width,
    (minimal.frameRect.y + minimal.frameRect.height - minimal.apertureRect.y - minimal.apertureRect.height) / minimal.frameRect.height,
    (minimal.frameRect.x + minimal.frameRect.width - minimal.apertureRect.x - minimal.apertureRect.width) / minimal.frameRect.width
  ];
  [0.033, 0.032, 0.032, 0.032].forEach((expected, index) => assert(Math.abs(minimalRebates[index] - expected) < 0.005));
}

function testOrientationAndPerforations() {
  const landscape = layout('film-strip-35mm-full', 'landscape');
  const portrait = layout('film-strip-35mm-full', 'portrait');
  assert.strictEqual(landscape.decorationRects.perforations.filter(item => item.side === 'top').length, 8);
  assert.strictEqual(landscape.decorationRects.perforations.filter(item => item.side === 'bottom').length, 8);
  assert.strictEqual(portrait.decorationRects.perforations.filter(item => item.side === 'left').length, 8);
  assert.strictEqual(portrait.decorationRects.perforations.filter(item => item.side === 'right').length, 8);
  assert(landscape.decorationRects.perforations.every(item => item.shape === 'rounded-rect'));
  const even = resolvePerforationPositions({ gapPolicy: 'even' }, 4, 0, 90, 10);
  const fixed = resolvePerforationPositions({ gapPolicy: 'fixed', gapRatio: 2 }, 4, 0, 90, 10);
  assert.notDeepStrictEqual(fixed, even, 'fixed gap policy must change perforation placement');
}

function testAnchorsStayInRebateRails() {
  const result = layout('film-strip-35mm-full', 'landscape');
  const args = {
    frameRect: result.frameRect,
    apertureRect: result.apertureRect,
    rebates: result.rebates,
    orientation: 'landscape',
    orientationPolicy: 'fixed'
  };
  [
    'top-start', 'top-center', 'top-end', 'right-start', 'right-center', 'right-end',
    'bottom-start', 'bottom-center', 'bottom-end', 'left-start', 'left-center', 'left-end',
    'corner-top-left', 'corner-top-right', 'corner-bottom-left', 'corner-bottom-right'
  ].forEach(anchor => {
    const resolved = resolveDecorationAnchor({ ...args, anchor });
    assert(inside(result.frameRect, resolved.box), `${anchor} must stay inside the frame`);
  });
}

testGeometryParity();
testOrientationAndPerforations();
testAnchorsStayInRebateRails();
console.log('film frame layout tests passed');
