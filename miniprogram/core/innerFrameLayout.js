const {
  normalizeFilmFrameStyle,
  resolveFrameNumberValue,
  resolvePortraitRotation
} = require('./filmFrameStyle');

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
  return rect(bounds.x + (bounds.width - width) / 2, bounds.y + (bounds.height - height) / 2, width, height);
}

function contains(outer, inner) {
  return inner.x >= outer.x - 1e-6 && inner.y >= outer.y - 1e-6 &&
    inner.x + inner.width <= outer.x + outer.width + 1e-6 &&
    inner.y + inner.height <= outer.y + outer.height + 1e-6;
}

function rotateSide(side) {
  return { top: 'right', right: 'bottom', bottom: 'left', left: 'top' }[side] || side;
}

function rotateAnchor(anchor) {
  const map = {
    'top-start': 'right-start', 'top-center': 'right-center', 'top-end': 'right-end',
    'right-start': 'bottom-start', 'right-center': 'bottom-center', 'right-end': 'bottom-end',
    'bottom-start': 'left-start', 'bottom-center': 'left-center', 'bottom-end': 'left-end',
    'left-start': 'top-start', 'left-center': 'top-center', 'left-end': 'top-end',
    'corner-top-left': 'corner-top-right', 'corner-top-right': 'corner-bottom-right',
    'corner-bottom-right': 'corner-bottom-left', 'corner-bottom-left': 'corner-top-left'
  };
  return map[anchor] || anchor;
}

function shouldRotate(canonicalStyle, orientation) {
  return orientation === 'portrait' && canonicalStyle.geometry.orientationPolicy === 'rotate-film-layout';
}

function resolveRebates(style, frameSizePreset, orientation) {
  const canonical = normalizeFilmFrameStyle(style);
  const preset = canonical.frame.sizePresets[frameSizePreset] || canonical.frame.sizePresets.standard;
  const base = canonical.geometry.rebates;
  const rebates = {
    top: Math.max(0.005, base.top * preset.top),
    right: Math.max(0.005, base.right * preset.right),
    bottom: Math.max(0.005, base.bottom * preset.bottom),
    left: Math.max(0.005, base.left * preset.left)
  };
  if (!shouldRotate(canonical, orientation)) return rebates;
  return { top: rebates.left, right: rebates.top, bottom: rebates.right, left: rebates.bottom };
}

function fitFrameRect(available, imageAspect, rebates) {
  const safeAspect = Math.max(0.05, positive(imageAspect, 1));
  const apertureWidthRatio = Math.max(0.05, 1 - rebates.left - rebates.right);
  const apertureHeightRatio = Math.max(0.05, 1 - rebates.top - rebates.bottom);
  const frameAspect = safeAspect / (apertureWidthRatio / apertureHeightRatio);
  let width = available.width;
  let height = width / frameAspect;
  if (height > available.height) {
    height = available.height;
    width = height * frameAspect;
  }
  return rect(available.x + (available.width - width) / 2, available.y + (available.height - height) / 2,
    Math.max(1, width), Math.max(1, height));
}

function apertureFromFrame(frame, rebates) {
  return rect(frame.x + frame.width * rebates.left, frame.y + frame.height * rebates.top,
    frame.width * (1 - rebates.left - rebates.right), frame.height * (1 - rebates.top - rebates.bottom));
}

function evenlySpaced(count, start, end) {
  if (count <= 0) return [];
  if (count === 1) return [(start + end) / 2];
  return Array.from({ length: count }, (_, index) => start + (end - start) * index / (count - 1));
}

function resolvePerforationPositions(config, count, start, end, holeSpan) {
  if (config.gapPolicy !== 'fixed' || count <= 1) return evenlySpaced(count, start, end);
  const maxStep = (end - start) / Math.max(1, count - 1);
  const step = Math.min(maxStep, Math.max(holeSpan, holeSpan * config.gapRatio));
  const center = (start + end) / 2;
  return Array.from({ length: count }, (_, index) => center + (index - (count - 1) / 2) * step);
}

function resolvePerforationSides(config, canonical, orientation) {
  const sides = config.sides || [];
  return shouldRotate(canonical, orientation) ? sides.map(rotateSide) : sides.slice();
}

function layoutFilmPerforations(frame, rebates, canonical, orientation) {
  const config = canonical.perforations;
  if (!config.enabled || !config.sides.length || !config.count) return [];
  const result = [];
  resolvePerforationSides(config, canonical, orientation).forEach(side => {
    const horizontal = side === 'top' || side === 'bottom';
    const holeWidth = horizontal ? frame.width * config.widthRatio : frame.width * config.heightRatio;
    const holeHeight = horizontal ? frame.height * config.heightRatio : frame.height * config.widthRatio;
    const axisStart = horizontal ? frame.x + holeWidth / 2 : frame.y + holeHeight / 2;
    const axisEnd = horizontal ? frame.x + frame.width - holeWidth / 2 : frame.y + frame.height - holeHeight / 2;
    resolvePerforationPositions(config, config.count, axisStart, axisEnd, horizontal ? holeWidth : holeHeight).forEach(position => {
      let box;
      if (side === 'top') box = rect(position - holeWidth / 2, frame.y + frame.height * rebates.top * 0.22, holeWidth, holeHeight);
      if (side === 'bottom') box = rect(position - holeWidth / 2, frame.y + frame.height - frame.height * rebates.bottom * 0.22 - holeHeight, holeWidth, holeHeight);
      if (side === 'left') box = rect(frame.x + frame.width * rebates.left * 0.22, position - holeHeight / 2, holeWidth, holeHeight);
      if (side === 'right') box = rect(frame.x + frame.width - frame.width * rebates.right * 0.22 - holeWidth, position - holeHeight / 2, holeWidth, holeHeight);
      result.push({ box, ...box, side, shape: config.shape, cornerRadiusRatio: config.cornerRadiusRatio, color: config.color });
    });
  });
  return result;
}

function rebateBox(frame, aperture, anchor) {
  const side = anchor.split('-')[0];
  if (side === 'top') return rect(frame.x, frame.y, frame.width, Math.max(1, aperture.y - frame.y));
  if (side === 'bottom') return rect(frame.x, aperture.y + aperture.height, frame.width, Math.max(1, frame.y + frame.height - aperture.y - aperture.height));
  if (side === 'left') return rect(frame.x, frame.y, Math.max(1, aperture.x - frame.x), frame.height);
  return rect(aperture.x + aperture.width, frame.y, Math.max(1, frame.x + frame.width - aperture.x - aperture.width), frame.height);
}

function resolveDecorationAnchor({ frameRect, apertureRect, rebates, anchor, orientation, orientationPolicy, sizeRatio = 0.035, spanRatio = 0.18 }) {
  const rotate = orientation === 'portrait' && orientationPolicy === 'rotate-film-layout';
  const effectiveAnchor = rotate ? rotateAnchor(anchor) : anchor;
  const corner = effectiveAnchor.indexOf('corner-') === 0;
  const minDimension = Math.min(frameRect.width, frameRect.height);
  const markerSize = Math.max(2, minDimension * sizeRatio);
  if (corner) {
    const padding = markerSize * 0.55;
    const end = effectiveAnchor.indexOf('right') >= 0;
    const bottom = effectiveAnchor.indexOf('bottom') >= 0;
    return {
      anchor: effectiveAnchor,
      box: rect(end ? frameRect.x + frameRect.width - markerSize - padding : frameRect.x + padding,
        bottom ? frameRect.y + frameRect.height - markerSize - padding : frameRect.y + padding,
        markerSize, markerSize)
    };
  }
  const side = effectiveAnchor.split('-')[0];
  const position = effectiveAnchor.split('-')[1] || 'center';
  const rail = rebateBox(frameRect, apertureRect, effectiveAnchor);
  const horizontal = side === 'top' || side === 'bottom';
  const railLength = horizontal ? rail.width : rail.height;
  const cross = horizontal ? rail.height : rail.width;
  const length = Math.max(markerSize, railLength * spanRatio);
  const thickness = Math.max(1, Math.min(cross * 0.72, markerSize * 1.45));
  const edgePadding = Math.min(markerSize * 0.55, Math.max(0, (railLength - length) / 2));
  const offset = position === 'start' ? edgePadding : position === 'end' ? railLength - length - edgePadding : (railLength - length) / 2;
  return {
    anchor: effectiveAnchor,
    box: horizontal
      ? rect(rail.x + offset, rail.y + (rail.height - thickness) / 2, length, thickness)
      : rect(rail.x + (rail.width - thickness) / 2, rail.y + offset, thickness, length)
  };
}

function layoutFilmDecorations({ frameRect, apertureRect, rebates, canonicalStyle, orientation, frameIndex }) {
  const config = canonicalStyle.decorations;
  const common = { frameRect, apertureRect, rebates, orientation, orientationPolicy: canonicalStyle.geometry.orientationPolicy };
  const mapText = item => {
    const resolved = resolveDecorationAnchor({ ...common, anchor: item.anchor, sizeRatio: item.sizeRatio, spanRatio: item.spanRatio });
    return { box: resolved.box, ...resolved.box, anchor: resolved.anchor, text: item.text, color: item.color, fontSize: Math.max(8, Math.round(Math.min(frameRect.width, frameRect.height) * item.sizeRatio)), rotation: resolvePortraitRotation(item.portraitRotation, orientation) };
  };
  const mapNumber = item => {
    const resolved = resolveDecorationAnchor({ ...common, anchor: item.anchor, sizeRatio: item.sizeRatio, spanRatio: item.spanRatio });
    return { box: resolved.box, ...resolved.box, anchor: resolved.anchor, text: resolveFrameNumberValue(item.value, frameIndex), color: item.color, fontSize: Math.max(8, Math.round(Math.min(frameRect.width, frameRect.height) * item.sizeRatio)), rotation: resolvePortraitRotation(item.portraitRotation, orientation) };
  };
  const mapMarker = item => {
    const resolved = resolveDecorationAnchor({ ...common, anchor: item.anchor, sizeRatio: item.sizeRatio, spanRatio: item.spanRatio });
    return { box: resolved.box, ...resolved.box, anchor: resolved.anchor, type: item.type, color: item.color };
  };
  return {
    perforations: layoutFilmPerforations(frameRect, rebates, canonicalStyle, orientation),
    labels: config.labels.filter(item => item.enabled).map(mapText),
    frameNumbers: config.frameNumbers.filter(item => item.enabled).map(mapNumber),
    markers: config.markers.filter(item => item.enabled).map(mapMarker),
    aperture: apertureRect
  };
}

function layoutInnerFrame({ outputRect, outerLayout = {}, imageAspect = 1, style, frameSizePreset = 'standard', orientation, frameIndex = 1 } = {}) {
  if (!outputRect || !style) throw new Error('outputRect and style are required');
  const canonicalStyle = normalizeFilmFrameStyle(style);
  const output = rect(positive(outputRect.x), positive(outputRect.y), Math.max(1, positive(outputRect.width, 1)), Math.max(1, positive(outputRect.height, 1)));
  const padding = typeof outerLayout.padding === 'number'
    ? { top: outerLayout.padding, right: outerLayout.padding, bottom: outerLayout.padding, left: outerLayout.padding }
    : (outerLayout.padding || {});
  const baseAvailable = inset(output, padding);
  const available = scaleAroundCenter(baseAvailable, outerLayout.zoom == null ? 1 : outerLayout.zoom, output);
  const resolvedOrientation = orientation || (positive(imageAspect, 1) < 1 ? 'portrait' : 'landscape');
  const rebates = resolveRebates(canonicalStyle, frameSizePreset, resolvedOrientation);
  const frameRect = fitFrameRect(available, imageAspect, rebates);
  const apertureRect = apertureFromFrame(frameRect, rebates);
  const decorations = layoutFilmDecorations({ frameRect, apertureRect, rebates, canonicalStyle, orientation: resolvedOrientation, frameIndex });
  return {
    outputRect: output,
    innerAvailableRect: available,
    frameRect,
    apertureRect,
    decorationRects: decorations,
    rebates,
    orientation: resolvedOrientation,
    frameSizePreset,
    style: canonicalStyle,
    containsFrame: contains(available, frameRect),
    containsAperture: contains(frameRect, apertureRect)
  };
}

module.exports = {
  rect,
  contains,
  layoutInnerFrame,
  resolveRebates,
  apertureFromFrame,
  resolveDecorationAnchor,
  layoutFilmDecorations,
  layoutFilmPerforations,
  resolvePerforationPositions
};
