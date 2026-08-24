/**
 * Pure geometry for structured film-rebate inner frames.
 *
 * The output canvas, the complete inner-frame module and the photo aperture
 * are deliberately separate rectangles. No Canvas or image objects belong in
 * this module.
 */

function positive(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function rect(x, y, width, height) {
  return { x, y, width, height };
}

function inset(rectangle, padding) {
  const px = Math.max(0, Math.min(rectangle.width / 2, positive(padding && padding.left)));
  const py = Math.max(0, Math.min(rectangle.height / 2, positive(padding && padding.top)));
  const right = Math.max(0, Math.min(rectangle.width / 2, positive(padding && padding.right, px)));
  const bottom = Math.max(0, Math.min(rectangle.height / 2, positive(padding && padding.bottom, py)));
  return rect(rectangle.x + px, rectangle.y + py,
    Math.max(1, rectangle.width - px - right),
    Math.max(1, rectangle.height - py - bottom));
}

function scaleAroundCenter(rectangle, scale, bounds) {
  const safeScale = Math.max(0.3, Math.min(1.5, positive(scale, 1)));
  const width = Math.min(bounds.width, Math.max(1, rectangle.width * safeScale));
  const height = Math.min(bounds.height, Math.max(1, rectangle.height * safeScale));
  return rect(
    bounds.x + (bounds.width - width) / 2,
    bounds.y + (bounds.height - height) / 2,
    width,
    height
  );
}

function contains(outer, inner) {
  return inner.x >= outer.x - 1e-6 &&
    inner.y >= outer.y - 1e-6 &&
    inner.x + inner.width <= outer.x + outer.width + 1e-6 &&
    inner.y + inner.height <= outer.y + outer.height + 1e-6;
}

function orientRebates(rebates, orientation) {
  if (orientation !== 'portrait') return { ...rebates };
  // Rotate the canonical horizontal film strip so its thick rebates become
  // the left/right rebates for a portrait image.
  return {
    top: rebates.left,
    right: rebates.top,
    bottom: rebates.right,
    left: rebates.bottom
  };
}

function resolveRebates(style, frameSizePreset, orientation) {
  const geometry = style && (style.geometry || (style.filmLayout && style.filmLayout.geometry));
  const base = geometry && geometry.rebates ? geometry.rebates : {
    topRatio: 0.032,
    rightRatio: 0.032,
    bottomRatio: 0.032,
    leftRatio: 0.032
  };
  const presets = style && (style.sizePresets || (style.filmLayout && style.filmLayout.sizePresets));
  const preset = presets && presets[frameSizePreset];
  const scales = preset || { topScale: 1, rightScale: 1, bottomScale: 1, leftScale: 1 };
  return orientRebates({
    top: Math.max(0.005, base.topRatio * scales.topScale),
    right: Math.max(0.005, base.rightRatio * scales.rightScale),
    bottom: Math.max(0.005, base.bottomRatio * scales.bottomScale),
    left: Math.max(0.005, base.leftRatio * scales.leftScale)
  }, orientation);
}

function fitFrameRect(available, imageAspect, rebates) {
  const safeAspect = Math.max(0.05, positive(imageAspect, 1));
  const apertureWidthRatio = Math.max(0.05, 1 - rebates.left - rebates.right);
  const apertureHeightRatio = Math.max(0.05, 1 - rebates.top - rebates.bottom);
  const frameAspect = safeAspect * apertureHeightRatio === 0
    ? available.width / available.height
    : safeAspect / (apertureWidthRatio / apertureHeightRatio);
  let width = available.width;
  let height = width / frameAspect;
  if (height > available.height) {
    height = available.height;
    width = height * frameAspect;
  }
  return rect(
    available.x + (available.width - width) / 2,
    available.y + (available.height - height) / 2,
    Math.max(1, width),
    Math.max(1, height)
  );
}

function apertureFromFrame(frame, rebates) {
  return rect(
    frame.x + frame.width * rebates.left,
    frame.y + frame.height * rebates.top,
    frame.width * (1 - rebates.left - rebates.right),
    frame.height * (1 - rebates.top - rebates.bottom)
  );
}

function evenlySpaced(count, start, end) {
  if (count <= 0) return [];
  if (count === 1) return [(start + end) / 2];
  return Array.from({ length: count }, (_, index) => start + (end - start) * index / (count - 1));
}

function filmPerforations(frame, rebates, style, orientation) {
  const config = style.perforations || (style.filmLayout && style.filmLayout.perforations);
  if (!config || !config.enabled) return [];
  const count = Math.max(0, Math.floor(config.count || 8));
  const result = [];
  const horizontal = orientation !== 'portrait';
  if (horizontal) {
    const width = frame.width * config.widthRatio;
    const height = frame.height * config.heightRatio;
    evenlySpaced(count, frame.x + width / 2, frame.x + frame.width - width / 2).forEach(x => {
      result.push(rect(x - width / 2, frame.y + frame.height * rebates.top * 0.22, width, height));
      result.push(rect(x - width / 2, frame.y + frame.height - frame.height * rebates.bottom * 0.22 - height, width, height));
    });
  } else {
    const width = frame.width * config.heightRatio;
    const height = frame.height * config.widthRatio;
    evenlySpaced(count, frame.y + height / 2, frame.y + frame.height - height / 2).forEach(y => {
      result.push(rect(frame.x + frame.width * rebates.left * 0.22, y - height / 2, width, height));
      result.push(rect(frame.x + frame.width - frame.width * rebates.right * 0.22 - width, y - height / 2, width, height));
    });
  }
  return result;
}

function decorationRects(frame, aperture, style, orientation, rebates) {
  const layout = style || {};
  const legacy = style.filmLayout || {};
  const is35Portrait = style.id === 'film-strip-35mm-full' && orientation === 'portrait';
  const labels = (layout.labels ? layout.labels.enabled : legacy.edgeLabel)
    ? (is35Portrait
      ? [rect(frame.x + frame.width * 0.025, frame.y + frame.height * 0.16, frame.width * rebates.left * 0.82, frame.height * 0.56)]
      : [rect(frame.x + frame.width * 0.04, frame.y + frame.height * 0.04, frame.width * 0.35, Math.max(8, frame.height * 0.04))])
    : [];
  const frameNumbers = (layout.frameNumbers ? layout.frameNumbers.enabled : legacy.frameNumber)
    ? (is35Portrait
      ? [rect(frame.x + frame.width * 0.835, frame.y + frame.height * 0.18, frame.width * rebates.right * 0.82, frame.height * 0.18)]
      : [rect(frame.x + frame.width * 0.04, frame.y + frame.height * 0.9, frame.width * 0.12, Math.max(8, frame.height * 0.04)), rect(frame.x + frame.width * 0.46, frame.y + frame.height * 0.9, frame.width * 0.08, Math.max(8, frame.height * 0.04))])
    : [];
  return {
    perforations: filmPerforations(frame, rebates, style, orientation),
    labels,
    frameNumbers,
    markers: (layout.markers ? layout.markers.enabled : legacy.markers) ? [
      rect(frame.x + frame.width * 0.04, frame.y + frame.height * 0.82, frame.width * 0.018, frame.height * 0.018),
      rect(frame.x + frame.width * 0.94, frame.y + frame.height * 0.82, frame.width * 0.018, frame.height * 0.018)
    ] : [],
    aperture
  };
}

function layoutInnerFrame({ outputRect, outerLayout = {}, imageAspect = 1, style, frameSizePreset = 'standard', orientation } = {}) {
  if (!outputRect || !style) throw new Error('outputRect and style are required');
  const output = rect(0, 0, Math.max(1, positive(outputRect.width, 1)), Math.max(1, positive(outputRect.height, 1)));
  const padding = typeof outerLayout.padding === 'number'
    ? { top: outerLayout.padding, right: outerLayout.padding, bottom: outerLayout.padding, left: outerLayout.padding }
    : (outerLayout.padding || {});
  const baseAvailable = inset(output, padding);
  const available = scaleAroundCenter(baseAvailable, outerLayout.zoom == null ? 1 : outerLayout.zoom, output);
  const resolvedOrientation = orientation || (positive(imageAspect, 1) < 1 ? 'portrait' : 'landscape');
  const rebates = resolveRebates(style, frameSizePreset, resolvedOrientation);
  const frameRect = fitFrameRect(available, imageAspect, rebates);
  const apertureRect = apertureFromFrame(frameRect, rebates);
  const decorations = decorationRects(frameRect, apertureRect, style, resolvedOrientation, rebates);
  return {
    outputRect: output,
    innerAvailableRect: available,
    frameRect,
    apertureRect,
    decorationRects: decorations,
    rebates,
    orientation: resolvedOrientation,
    frameSizePreset,
    containsFrame: contains(available, frameRect),
    containsAperture: contains(frameRect, apertureRect)
  };
}

module.exports = {
  rect,
  contains,
  layoutInnerFrame,
  resolveRebates,
  apertureFromFrame
};
