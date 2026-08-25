const {
  FRAME_RENDERER_TYPES,
  getInnerFrameStyle,
  getStrengthPreset
} = require('./innerFrameStyles');
const {
  normalizeFilmFrameStyle,
  normalizeRendererType
} = require('./filmFrameStyle');
const { clamp, getFrameRect, calculateApertureImageRect } = require('./frameGeometry');

const PROFILE_CACHE_LIMIT = 128;
const profileCache = Object.create(null);
const profileCacheOrder = [];
const MASK_SEGMENTS = ['top-left', 'top', 'top-right', 'right', 'bottom-right', 'bottom', 'bottom-left', 'left'];

function hashSeed(value) {
  const text = String(value == null ? 'default' : value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seed) {
  let state = hashSeed(seed) || 1;
  return function next() {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function interpolate(a, b, ratio) {
  return a + (b - a) * ratio;
}

function usesNormalizedProfile(style) {
  return style.renderer === FRAME_RENDERER_TYPES.SEGMENTED_MASK ||
    style.renderer === FRAME_RENDERER_TYPES.EMULSION_MASK;
}

function generateNormalizedEdgeProfile({ styleId = 'clean-black', seed = 'default', strength = 1, strengthLevel = 'medium', pointCount = 32 } = {}) {
  const style = getInnerFrameStyle(styleId);
  const count = Math.max(8, Math.min(64, Math.floor(pointCount)));
  const preset = getStrengthPreset(style.id, strengthLevel);
  const effectiveStrength = clamp((Number(strength) || 1) * preset.irregularityScale, 0, 2.5);
  const random = createSeededRandom(`${style.id}:${seed}:${strengthLevel}`);

  function createSide(sideIndex) {
    if (!usesNormalizedProfile(style)) {
      return Array.from({ length: count }, (_, index) => ({ t: index / (count - 1), value: 0 }));
    }
    const anchors = style.renderer === FRAME_RENDERER_TYPES.EMULSION_MASK ? 9 : 7;
    const anchorValues = Array.from({ length: anchors }, () => random() * 2 - 1);
    const sideBias = (sideIndex - 1.5) * (style.renderer === FRAME_RENDERER_TYPES.EMULSION_MASK ? 0.09 : 0.04);
    return Array.from({ length: count }, (_, index) => {
      const t = index / (count - 1);
      if (index === 0 || index === count - 1) return { t, value: 0 };
      const scaled = t * (anchors - 1);
      const left = Math.min(anchors - 2, Math.floor(scaled));
      const ratio = scaled - left;
      const low = interpolate(anchorValues[left], anchorValues[left + 1], ratio);
      const high = style.renderer === FRAME_RENDERER_TYPES.EMULSION_MASK ? (random() * 2 - 1) * 0.2 : 0;
      return { t, value: clamp((low * 0.86 + high + sideBias) * effectiveStrength, -1, 1) };
    });
  }

  return { top: createSide(0), right: createSide(1), bottom: createSide(2), left: createSide(3) };
}

function getCachedNormalizedEdgeProfile(options = {}) {
  const styleId = options.styleId || 'clean-black';
  const seed = options.seed == null ? 'default' : options.seed;
  const strength = options.strength == null ? 1 : options.strength;
  const strengthLevel = options.strengthLevel || 'medium';
  const pointCount = options.pointCount == null ? 32 : options.pointCount;
  const key = `${styleId}|${seed}|${strengthLevel}|${strength}|${pointCount}`;
  if (profileCache[key]) return profileCache[key];
  const profile = generateNormalizedEdgeProfile({ styleId, seed, strength, strengthLevel, pointCount });
  profileCache[key] = profile;
  profileCacheOrder.push(key);
  if (profileCacheOrder.length > PROFILE_CACHE_LIMIT) delete profileCache[profileCacheOrder.shift()];
  return profile;
}

function selectTextureVariant(textureOverlay, styleId, seed) {
  const count = Math.max(1, Number(textureOverlay && textureOverlay.variants) || 1);
  return hashSeed(`${styleId}:texture:${seed}`) % count + 1;
}

function selectMaskVariant(styleId, seed, strengthLevel = 'medium') {
  const style = getInnerFrameStyle(styleId);
  const canonical = normalizeRendererType(style.renderer) === FRAME_RENDERER_TYPES.FILM_FRAME
    ? normalizeFilmFrameStyle(style)
    : null;
  const overlay = canonical && canonical.material.textureOverlay;
  if (overlay) return selectTextureVariant(overlay, style.id, seed);
  const count = Math.max(1, Number(style.maskVariants) || 1);
  // A hidden stale strength value must not alter a fixed material style.
  const strengthKey = style.supportsStrength ? strengthLevel : 'fixed';
  return hashSeed(`${style.id}:${strengthKey}:${seed}:mask`) % count + 1;
}

function getMaskAssetPaths(styleId, variant, strengthLevel = 'medium') {
  const style = getInnerFrameStyle(styleId);
  const canonical = normalizeRendererType(style.renderer) === FRAME_RENDERER_TYPES.FILM_FRAME
    ? normalizeFilmFrameStyle(style)
    : null;
  const overlay = canonical && canonical.material.textureOverlay;
  const root = overlay ? overlay.root : style.maskRoot;
  const variants = overlay ? overlay.variants : style.maskVariants;
  if (!root || !variants) return null;
  const selected = Math.max(1, Math.min(variants, Number(variant) || 1));
  const variantFolder = `variant-${String(selected).padStart(2, '0')}`;
  const tier = getStrengthPreset(style.id, strengthLevel).maskTier || strengthLevel;
  const tiered = overlay ? overlay.tiered : style.maskTiered !== false;
  const basePath = tiered ? `/${root}/${tier}/${variantFolder}` : `/${root}/${variantFolder}`;
  return MASK_SEGMENTS.reduce((result, segment) => {
    result[segment] = `${basePath}/${segment}.png`;
    return result;
  }, {});
}

function edgeValue(profile, side, index) {
  return profile[side] && profile[side][index] ? profile[side][index].value : 0;
}

function buildFramePaths({ photoRect, frameWidth, styleId = 'clean-black', seed = 'default', strength = 1, strengthLevel = 'medium', pointCount = 32 } = {}) {
  const width = Math.max(0, Number(frameWidth) || 0);
  const style = getInnerFrameStyle(styleId);
  if (style.id === 'none' || width <= 0) return null;
  const preset = getStrengthPreset(style.id, strengthLevel);
  const profile = getCachedNormalizedEdgeProfile({ styleId: style.id, seed, strength, strengthLevel, pointCount });
  const baseVariation = style.renderer === FRAME_RENDERER_TYPES.EMULSION_MASK ? 0.18 : 0.18;
  const variationRange = style.renderer === FRAME_RENDERER_TYPES.EMULSION_MASK ? 0.38 : 0.36;
  const outerVariation = width * (baseVariation + variationRange * preset.intrusionScale);
  const innerVariation = Math.min(width * (style.renderer === FRAME_RENDERER_TYPES.EMULSION_MASK ? 0.28 : 0.34), outerVariation * (style.renderer === FRAME_RENDERER_TYPES.EMULSION_MASK ? 0.42 : 0.36));
  const count = profile.top.length;
  const outer = [];
  const inner = [];
  for (let i = 0; i < count; i += 1) {
    const t = profile.top[i].t;
    const value = edgeValue(profile, 'top', i);
    outer.push({ x: photoRect.x + photoRect.width * t, y: photoRect.y - width - value * outerVariation });
    inner.push({ x: photoRect.x + photoRect.width * t, y: photoRect.y + value * innerVariation });
  }
  for (let i = 0; i < count; i += 1) {
    const t = profile.right[i].t;
    const value = edgeValue(profile, 'right', i);
    outer.push({ x: photoRect.x + photoRect.width + width + value * outerVariation, y: photoRect.y + photoRect.height * t });
    inner.push({ x: photoRect.x + photoRect.width - value * innerVariation, y: photoRect.y + photoRect.height * t });
  }
  for (let i = count - 1; i >= 0; i -= 1) {
    const t = profile.bottom[i].t;
    const value = edgeValue(profile, 'bottom', i);
    outer.push({ x: photoRect.x + photoRect.width * t, y: photoRect.y + photoRect.height + width + value * outerVariation });
    inner.push({ x: photoRect.x + photoRect.width * t, y: photoRect.y + photoRect.height - value * innerVariation });
  }
  for (let i = count - 1; i >= 0; i -= 1) {
    const t = profile.left[i].t;
    const value = edgeValue(profile, 'left', i);
    outer.push({ x: photoRect.x - width - value * outerVariation, y: photoRect.y + photoRect.height * t });
    inner.push({ x: photoRect.x + value * innerVariation, y: photoRect.y + photoRect.height * t });
  }
  return { outer, inner, profile, frameRect: getFrameRect(photoRect, width), outerVariation, innerVariation, strengthPreset: preset };
}

function midpoint(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }

function traceSmoothPath(ctx, points) {
  if (!points || points.length < 3) return;
  const firstMid = midpoint(points[points.length - 1], points[0]);
  ctx.beginPath();
  ctx.moveTo(firstMid.x, firstMid.y);
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const nextMid = midpoint(current, points[(i + 1) % points.length]);
    ctx.quadraticCurveTo(current.x, current.y, nextMid.x, nextMid.y);
  }
  ctx.closePath();
}

function traceHardPolygonPath(ctx, points) {
  if (!points || points.length < 3) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
}

function traceRectPath(ctx, rect) {
  ctx.beginPath();
  if (typeof ctx.rect === 'function') {
    ctx.rect(rect.x, rect.y, rect.width, rect.height);
  } else {
    ctx.moveTo(rect.x, rect.y);
    ctx.lineTo(rect.x + rect.width, rect.y);
    ctx.lineTo(rect.x + rect.width, rect.y + rect.height);
    ctx.lineTo(rect.x, rect.y + rect.height);
    ctx.closePath();
  }
}

// Irregular edges are traced side-by-side so the four corners remain explicit.
// A single midpoint-smoothed closed path would turn a four-point rectangle into
// a capsule; this function never smooths across a corner.
function traceSideAwareProfilePath(ctx, points, pointCount) {
  if (!points || points.length < 4) return;
  const count = pointCount || Math.max(1, Math.floor(points.length / 4));
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
}

function rectanglePaths(photoRect, top, right, bottom, left) {
  const outer = [
    { x: photoRect.x - left, y: photoRect.y - top },
    { x: photoRect.x + photoRect.width + right, y: photoRect.y - top },
    { x: photoRect.x + photoRect.width + right, y: photoRect.y + photoRect.height + bottom },
    { x: photoRect.x - left, y: photoRect.y + photoRect.height + bottom }
  ];
  const inner = [
    { x: photoRect.x, y: photoRect.y },
    { x: photoRect.x + photoRect.width, y: photoRect.y },
    { x: photoRect.x + photoRect.width, y: photoRect.y + photoRect.height },
    { x: photoRect.x, y: photoRect.y + photoRect.height }
  ];
  return { outer, inner, frameRect: { x: photoRect.x - left, y: photoRect.y - top, width: photoRect.width + left + right, height: photoRect.height + top + bottom } };
}

function fillHardFrameAndPhoto(ctx, image, photoRect, paths, color) {
  ctx.save();
  traceHardPolygonPath(ctx, paths.outer);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
  ctx.drawImage(image, photoRect.x, photoRect.y, photoRect.width, photoRect.height);
}

function drawWithoutFrame({ ctx, image, photoRect }) {
  ctx.drawImage(image, photoRect.x, photoRect.y, photoRect.width, photoRect.height);
  return null;
}

function drawCleanFrame({ ctx, image, photoRect, frameWidth, color }) {
  const paths = rectanglePaths(photoRect, frameWidth, frameWidth, frameWidth, frameWidth);
  ctx.fillStyle = color;
  ctx.fillRect(paths.frameRect.x, paths.frameRect.y, paths.frameRect.width, paths.frameRect.height);
  ctx.drawImage(image, photoRect.x, photoRect.y, photoRect.width, photoRect.height);
  return paths;
}

function drawSegmentedMaskFrame({ ctx, image, photoRect, frameWidth, color, styleId, seed, strength, strengthLevel = 'medium', maskImages }) {
  if (!maskImages || !MASK_SEGMENTS.every(segment => maskImages[segment])) return drawCleanFrame({ ctx, image, photoRect, frameWidth, color });
  const style = getInnerFrameStyle(styleId);
  const frameRect = getFrameRect(photoRect, frameWidth);
  const cornerSize = Math.max(frameWidth * 3.2, 12);
  const edgeWidth = Math.max(1, frameRect.width - cornerSize * 2);
  const edgeHeight = Math.max(1, frameRect.height - cornerSize * 2);
  const boxes = {
    'top-left': [frameRect.x, frameRect.y, cornerSize, cornerSize],
    top: [frameRect.x + cornerSize, frameRect.y, edgeWidth, frameWidth],
    'top-right': [frameRect.x + frameRect.width - cornerSize, frameRect.y, cornerSize, cornerSize],
    right: [frameRect.x + frameRect.width - frameWidth, frameRect.y + cornerSize, frameWidth, edgeHeight],
    'bottom-right': [frameRect.x + frameRect.width - cornerSize, frameRect.y + frameRect.height - cornerSize, cornerSize, cornerSize],
    bottom: [frameRect.x + cornerSize, frameRect.y + frameRect.height - frameWidth, edgeWidth, frameWidth],
    'bottom-left': [frameRect.x, frameRect.y + frameRect.height - cornerSize, cornerSize, cornerSize],
    left: [frameRect.x, frameRect.y + cornerSize, frameWidth, edgeHeight]
  };
  ctx.save();
  ctx.fillStyle = color;
  MASK_SEGMENTS.forEach(segment => {
    const box = boxes[segment];
    ctx.drawImage(maskImages[segment], box[0], box[1], box[2], box[3]);
  });
  ctx.restore();
  const paths = buildFramePaths({ photoRect, frameWidth, styleId: style.id, seed, strength: Math.max(0.55, strength), strengthLevel, pointCount: 32 });
  ctx.save();
  traceSideAwareProfilePath(ctx, paths.inner, 32);
  ctx.clip();
  ctx.drawImage(image, photoRect.x, photoRect.y, photoRect.width, photoRect.height);
  ctx.restore();
  return { ...paths, maskVariant: selectMaskVariant(style.id, seed, strengthLevel) };
}

function drawEmulsionDamageFrame(options) {
  const paths = drawSegmentedMaskFrame(options);
  if (!paths || !paths.outer) return paths;
  const preset = getStrengthPreset('emulsion-damage', options.strengthLevel || 'medium');
  drawFragments(options.ctx, paths, `${options.seed}:emulsion`, options.color, preset.fragmentDensity, preset.fragmentSize);
  return paths;
}

function getScanEmulsionSideWidths(frameWidth, style) {
  const scale = Math.max(0, Number(frameWidth) || 0) /
    Math.max(1, Number(style && style.widthAt1800) || 18);
  return {
    top: 18 * scale,
    right: 14 * scale,
    bottom: 20 * scale,
    left: 14 * scale
  };
}

function drawScanEmulsionTextures(ctx, maskImages, frameRect, sideWidths) {
  if (!maskImages || !MASK_SEGMENTS.every(segment => maskImages[segment])) return;
  const top = sideWidths.top;
  const right = sideWidths.right;
  const bottom = sideWidths.bottom;
  const left = sideWidths.left;
  const outside = Math.max(3, Math.max(top, bottom) * 0.74);
  const corner = Math.max(10, Math.max(top, bottom) * 2.05);
  const horizontalWidth = Math.max(1, frameRect.width - corner * 2);
  const verticalHeight = Math.max(1, frameRect.height - corner * 2);
  // The residue overlaps only the outer portion of the black body and extends
  // outward. It never becomes a photo clip, so the aperture remains rectangular.
  const boxes = {
    'top-left': [frameRect.x - outside, frameRect.y - outside, corner, corner],
    top: [frameRect.x + corner, frameRect.y - outside, horizontalWidth, outside + top * 0.5],
    'top-right': [frameRect.x + frameRect.width - corner, frameRect.y - outside, corner, corner],
    right: [frameRect.x + frameRect.width - right * 0.46, frameRect.y + corner, right * 0.46 + outside, verticalHeight],
    'bottom-right': [frameRect.x + frameRect.width - corner, frameRect.y + frameRect.height - corner, corner, corner],
    bottom: [frameRect.x + corner, frameRect.y + frameRect.height - bottom * 0.5, horizontalWidth, bottom * 0.5 + outside],
    'bottom-left': [frameRect.x - outside, frameRect.y + frameRect.height - corner, corner, corner],
    left: [frameRect.x - outside, frameRect.y + corner, left * 0.46 + outside, verticalHeight]
  };
  ctx.save();
  MASK_SEGMENTS.forEach(segment => {
    const box = boxes[segment];
    ctx.drawImage(maskImages[segment], box[0], box[1], box[2], box[3]);
  });
  ctx.restore();
}

// A scanned original is intentionally not an irregular picture aperture. The
// black frame is a hard, continuous mount; only its *outside* carries sparse
// warm emulsion residue from the scan/film edge.
function drawScanEmulsionEdgeFrame({ ctx, image, photoRect, frameWidth, color, styleId, seed, strengthLevel, maskImages }) {
  const style = getInnerFrameStyle(styleId || 'scan-emulsion-edge');
  const sideWidths = getScanEmulsionSideWidths(frameWidth, style);
  const paths = rectanglePaths(photoRect, sideWidths.top, sideWidths.right, sideWidths.bottom, sideWidths.left);
  fillHardFrameAndPhoto(ctx, image, photoRect, paths, color || style.color);
  drawScanEmulsionTextures(ctx, maskImages, paths.frameRect, sideWidths);
  return {
    ...paths,
    sideWidths,
    maskVariant: selectMaskVariant(style.id, seed, strengthLevel)
  };
}

function drawFilmGateFrame({ ctx, image, photoRect, frameWidth, color, seed }) {
  const random = createSeededRandom(`${seed}:film-gate`);
  const top = frameWidth * (0.76 + random() * 0.12);
  const right = frameWidth * (1.02 + random() * 0.16);
  const bottom = frameWidth * (1.18 + random() * 0.16);
  const left = frameWidth * (1.08 + random() * 0.18);
  const paths = rectanglePaths(photoRect, top, right, bottom, left);
  fillHardFrameAndPhoto(ctx, image, photoRect, paths, color);
  // Hard片门 corners: a small deterministic accumulation, not random noise.
  ctx.save();
  ctx.fillStyle = color;
  const corner = Math.max(2, frameWidth * 0.55);
  ctx.fillRect(photoRect.x - left, photoRect.y - top, corner, corner);
  ctx.fillRect(photoRect.x + photoRect.width + right - corner, photoRect.y + photoRect.height + bottom - corner, corner, corner);
  ctx.restore();
  return { ...paths, variant: hashSeed(`${seed}:film-gate`) % 3 + 1 };
}

function drawCutout(ctx, x, y, width, height, backgroundColor) {
  if (backgroundColor && backgroundColor !== 'transparent') {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(x, y, width, height);
    return;
  }
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillRect(x, y, width, height);
  ctx.restore();
}

function drawPerforations(ctx, frameRect, frameWidth, backgroundColor, seed) {
  const holeWidth = clamp(frameWidth * 0.58, 3, 18);
  const holeHeight = clamp(frameWidth * 0.44, 3, 14);
  const gap = Math.max(holeWidth * 1.28, frameWidth * 0.9);
  const startOffset = (hashSeed(`${seed}:perforations`) % Math.max(1, Math.round(gap))) - gap / 2;
  const count = Math.ceil((frameRect.width + gap) / gap);
  for (let i = 0; i < count; i += 1) {
    const x = frameRect.x + startOffset + i * gap;
    drawCutout(ctx, x, frameRect.y + frameWidth * 0.25, holeWidth, holeHeight, backgroundColor);
    drawCutout(ctx, x, frameRect.y + frameRect.height - frameWidth * 0.25 - holeHeight, holeWidth, holeHeight, backgroundColor);
  }
}

function drawFrameCode(ctx, frameRect, frameWidth, seed, backgroundColor) {
  if (typeof ctx.fillText !== 'function') return;
  ctx.save();
  const transparent = !backgroundColor || backgroundColor === 'transparent';
  if (transparent) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000000';
  } else {
    ctx.fillStyle = backgroundColor;
  }
  ctx.font = `${Math.max(8, Math.round(frameWidth * 0.38))}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${String(hashSeed(`${seed}:frame`) % 90 + 10).padStart(2, '0')}A`, frameRect.x + frameRect.width / 2, frameRect.y + frameWidth * 0.72);
  ctx.restore();
}

function drawPerforatedFilmFrame({ ctx, image, photoRect, frameWidth, color, seed, backgroundColor }) {
  const paths = rectanglePaths(photoRect, frameWidth, frameWidth, frameWidth, frameWidth);
  fillHardFrameAndPhoto(ctx, image, photoRect, paths, color);
  drawPerforations(ctx, paths.frameRect, frameWidth, backgroundColor, seed);
  drawFrameCode(ctx, paths.frameRect, frameWidth, seed, backgroundColor);
  return { ...paths, perforationPitch: Math.max(frameWidth * 1.28, frameWidth * 0.9) };
}

function drawMediumFormatFrame({ ctx, image, photoRect, frameWidth, color, seed, backgroundColor }) {
  const random = createSeededRandom(`${seed}:medium-format`);
  const top = frameWidth * (0.9 + random() * 0.12);
  const right = frameWidth * (1.05 + random() * 0.14);
  const bottom = frameWidth * (1.28 + random() * 0.16);
  const left = frameWidth * (1.5 + random() * 0.2);
  const paths = rectanglePaths(photoRect, top, right, bottom, left);
  fillHardFrameAndPhoto(ctx, image, photoRect, paths, color);
  ctx.save();
  ctx.fillStyle = backgroundColor && backgroundColor !== 'transparent' ? backgroundColor : '#FFFFFF';
  if (typeof ctx.arc === 'function') {
    ctx.beginPath();
    ctx.arc(photoRect.x - left * 0.5, photoRect.y + photoRect.height * 0.5, Math.max(2, frameWidth * 0.18), 0, Math.PI * 2);
    ctx.fill();
  }
  drawFrameCode(ctx, paths.frameRect, frameWidth, `${seed}:120`, backgroundColor);
  ctx.restore();
  return { ...paths, mediumFormat: true };
}

function drawFilmText(ctx, decoration) {
  if (!decoration || !decoration.text || typeof ctx.fillText !== 'function') return;
  const box = decoration.box;
  ctx.save();
  ctx.fillStyle = decoration.color;
  ctx.font = `${Math.max(8, decoration.fontSize || Math.round(Math.min(box.width, box.height) * 0.9))}px sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  if (decoration.rotation && typeof ctx.translate === 'function' && typeof ctx.rotate === 'function') {
    ctx.translate(box.x + box.width / 2, box.y + box.height / 2);
    ctx.rotate(decoration.rotation);
    ctx.fillText(decoration.text, -box.height / 2, 0);
  } else {
    ctx.fillText(decoration.text, box.x, box.y + box.height / 2);
  }
  ctx.restore();
}

function traceLayoutRectPath(ctx, rectangle) {
  ctx.beginPath();
  if (typeof ctx.rect === 'function') {
    ctx.rect(rectangle.x, rectangle.y, rectangle.width, rectangle.height);
  } else {
    ctx.moveTo(rectangle.x, rectangle.y);
    ctx.lineTo(rectangle.x + rectangle.width, rectangle.y);
    ctx.lineTo(rectangle.x + rectangle.width, rectangle.y + rectangle.height);
    ctx.lineTo(rectangle.x, rectangle.y + rectangle.height);
    ctx.closePath();
  }
}

function traceRoundedRectPath(ctx, rectangle, radius) {
  const r = Math.max(0, Math.min(radius || 0, rectangle.width / 2, rectangle.height / 2));
  if (!r) return traceLayoutRectPath(ctx, rectangle);
  ctx.beginPath();
  ctx.moveTo(rectangle.x + r, rectangle.y);
  ctx.lineTo(rectangle.x + rectangle.width - r, rectangle.y);
  ctx.quadraticCurveTo(rectangle.x + rectangle.width, rectangle.y, rectangle.x + rectangle.width, rectangle.y + r);
  ctx.lineTo(rectangle.x + rectangle.width, rectangle.y + rectangle.height - r);
  ctx.quadraticCurveTo(rectangle.x + rectangle.width, rectangle.y + rectangle.height, rectangle.x + rectangle.width - r, rectangle.y + rectangle.height);
  ctx.lineTo(rectangle.x + r, rectangle.y + rectangle.height);
  ctx.quadraticCurveTo(rectangle.x, rectangle.y + rectangle.height, rectangle.x, rectangle.y + rectangle.height - r);
  ctx.lineTo(rectangle.x, rectangle.y + r);
  ctx.quadraticCurveTo(rectangle.x, rectangle.y, rectangle.x + r, rectangle.y);
  ctx.closePath();
}

function traceAperturePath(ctx, aperture, config) {
  if (config && config.shape === 'rounded-rect' && config.cornerRadiusRatio > 0) {
    return traceRoundedRectPath(ctx, aperture, Math.min(aperture.width, aperture.height) * config.cornerRadiusRatio);
  }
  return traceLayoutRectPath(ctx, aperture);
}

function drawFilmMarker(ctx, marker) {
  if (!marker || !marker.box) return;
  const box = marker.box;
  const color = marker.color || '#F3A126';
  ctx.save();
  ctx.fillStyle = color;
  if (marker.type === 'square') {
    ctx.fillRect(box.x, box.y, box.width, box.height);
  } else if (marker.type === 'circle' && typeof ctx.arc === 'function') {
    ctx.beginPath();
    ctx.arc(box.x + box.width / 2, box.y + box.height / 2, Math.min(box.width, box.height) / 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (marker.type === 'line') {
    ctx.fillRect(box.x, box.y + box.height * 0.42, box.width, Math.max(1, box.height * 0.16));
  } else {
    ctx.beginPath();
    if (marker.type === 'arrow') {
      ctx.moveTo(box.x, box.y + box.height * 0.36);
      ctx.lineTo(box.x + box.width * 0.62, box.y + box.height * 0.36);
      ctx.lineTo(box.x + box.width * 0.62, box.y);
      ctx.lineTo(box.x + box.width, box.y + box.height / 2);
      ctx.lineTo(box.x + box.width * 0.62, box.y + box.height);
      ctx.lineTo(box.x + box.width * 0.62, box.y + box.height * 0.64);
      ctx.lineTo(box.x, box.y + box.height * 0.64);
    } else {
      ctx.moveTo(box.x, box.y + box.height);
      ctx.lineTo(box.x + box.width, box.y + box.height / 2);
      ctx.lineTo(box.x, box.y);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawFilmCutout(ctx, perforation, backgroundColor) {
  if (!perforation || !perforation.box) return;
  const box = perforation.box;
  const color = perforation.color === 'outer-background'
    ? backgroundColor
    : perforation.color;
  const erase = !color || color === 'transparent';
  ctx.save();
  if (erase) ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = erase ? '#000000' : color;
  if (perforation.shape === 'circle' && typeof ctx.arc === 'function') {
    ctx.beginPath();
    ctx.arc(box.x + box.width / 2, box.y + box.height / 2, Math.min(box.width, box.height) / 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (perforation.shape === 'rounded-rect') {
    traceRoundedRectPath(ctx, box, Math.min(box.width, box.height) * (perforation.cornerRadiusRatio || 0));
    ctx.fill();
  } else {
    ctx.fillRect(box.x, box.y, box.width, box.height);
  }
  ctx.restore();
}

function drawTextureOverlay(ctx, textureOverlay, maskImages, frameRect, apertureRect) {
  if (!textureOverlay || !maskImages || !MASK_SEGMENTS.every(segment => maskImages[segment])) return;
  const thickness = Math.max(2, Math.min(frameRect.width, frameRect.height) * 0.045);
  const corner = Math.max(thickness * 2, 8);
  const horizontal = Math.max(1, frameRect.width - corner * 2);
  const vertical = Math.max(1, frameRect.height - corner * 2);
  const outer = textureOverlay.placement === 'outer-edge' ? thickness * 0.72 : 0;
  const inner = textureOverlay.placement === 'inner-edge' ? thickness * 0.55 : 0;
  const boxes = {
    'top-left': [frameRect.x - outer, frameRect.y - outer, corner + outer, corner + outer],
    top: [frameRect.x + corner, frameRect.y - outer + inner, horizontal, thickness + outer],
    'top-right': [frameRect.x + frameRect.width - corner, frameRect.y - outer, corner + outer, corner + outer],
    right: [frameRect.x + frameRect.width - thickness - inner, frameRect.y + corner, thickness + outer, vertical],
    'bottom-right': [frameRect.x + frameRect.width - corner, frameRect.y + frameRect.height - corner, corner + outer, corner + outer],
    bottom: [frameRect.x + corner, frameRect.y + frameRect.height - thickness - inner, horizontal, thickness + outer],
    'bottom-left': [frameRect.x - outer, frameRect.y + frameRect.height - corner, corner + outer, corner + outer],
    left: [frameRect.x - outer + inner, frameRect.y + corner, thickness + outer, vertical]
  };
  ctx.save();
  MASK_SEGMENTS.forEach(segment => {
    const box = boxes[segment];
    ctx.drawImage(maskImages[segment], box[0], box[1], box[2], box[3]);
  });
  ctx.restore();
}

function drawFilmFrame({ ctx, image, layout, style, color, backgroundColor, imageZoom = 1, framePerforationsEnabled = true, frameEdgeLabelEnabled = true, frameNumberEnabled = true, frameMarkersEnabled = true, maskImages }) {
  if (!layout || !layout.frameRect || !layout.apertureRect) return null;
  const canonical = layout.style || normalizeFilmFrameStyle(style);
  const frame = layout.frameRect;
  const aperture = layout.apertureRect;
  const decoration = layout.decorationRects || {};
  ctx.save();
  ctx.fillStyle = color || canonical.frame.color || '#030303';
  ctx.fillRect(frame.x, frame.y, frame.width, frame.height);
  ctx.restore();

  // The aperture is always a hard rectangle. Structured rebates must never
  // reuse the smooth irregular path used by material-like borders.
  ctx.save();
  traceAperturePath(ctx, aperture, canonical.geometry.aperture);
  ctx.clip();
  const imageDrawRect = calculateApertureImageRect({
    apertureRect: aperture,
    imageWidth: image.width,
    imageHeight: image.height,
    zoom: imageZoom
  });
  ctx.drawImage(image, imageDrawRect.x, imageDrawRect.y, imageDrawRect.width, imageDrawRect.height);
  ctx.restore();

  if (framePerforationsEnabled) decoration.perforations.forEach(perforation => drawFilmCutout(ctx, perforation, backgroundColor));
  if (frameEdgeLabelEnabled) decoration.labels.forEach(label => drawFilmText(ctx, label));
  if (frameNumberEnabled) decoration.frameNumbers.forEach(number => drawFilmText(ctx, number));
  if (frameMarkersEnabled) decoration.markers.forEach(marker => drawFilmMarker(ctx, marker));
  drawTextureOverlay(ctx, canonical.material.textureOverlay, maskImages, frame, aperture);
  return {
    frameRect: frame,
    apertureRect: aperture,
    decorationRects: decoration,
    imageDrawRect,
    orientation: layout.orientation,
    frameSizePreset: layout.frameSizePreset,
    material: canonical.material
  };
}

// Retained as the public compatibility entry for saved legacy renderer types.
function drawFilmRebateLayoutFrame(options) {
  return drawFilmFrame(options);
}

function drawFragments(ctx, paths, seed, color, density, sizeScale = 1) {
  const random = createSeededRandom(`${seed}:fragments`);
  const count = Math.max(0, Math.round(density * 72));
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < count; i += 1) {
    const start = Math.floor(random() * paths.outer.length);
    const point = paths.outer[start];
    const next = paths.outer[(start + 1) % paths.outer.length];
    const size = (0.5 + random() * 2.2) * sizeScale;
    const dx = next.x - point.x;
    const dy = next.y - point.y;
    const length = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    const along = random();
    const x = point.x + dx * along;
    const y = point.y + dy * along;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - dy / length * size, y + dx / length * size);
    ctx.lineTo(x + dx / length * size, y + dy / length * size);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

const FRAME_RENDERERS = Object.freeze({
  [FRAME_RENDERER_TYPES.NONE]: drawWithoutFrame,
  [FRAME_RENDERER_TYPES.CLEAN]: drawCleanFrame,
  [FRAME_RENDERER_TYPES.SEGMENTED_MASK]: drawSegmentedMaskFrame,
  [FRAME_RENDERER_TYPES.FILM_GATE]: drawFilmGateFrame,
  [FRAME_RENDERER_TYPES.PERFORATED_FILM]: drawPerforatedFilmFrame,
  [FRAME_RENDERER_TYPES.MEDIUM_FORMAT_REBATE]: drawMediumFormatFrame,
  [FRAME_RENDERER_TYPES.EMULSION_MASK]: drawEmulsionDamageFrame,
  [FRAME_RENDERER_TYPES.SCAN_EMULSION_EDGE]: drawScanEmulsionEdgeFrame,
  [FRAME_RENDERER_TYPES.FILM_FRAME]: drawFilmFrame,
  [FRAME_RENDERER_TYPES.FILM_REBATE_LAYOUT]: drawFilmRebateLayoutFrame
});

function drawImageWithInnerFrame(options) {
  const style = getInnerFrameStyle(options.styleId || 'clean-black');
  const renderer = FRAME_RENDERERS[style.renderer] || FRAME_RENDERERS[FRAME_RENDERER_TYPES.CLEAN];
  const result = renderer({ ...options, styleId: style.id, color: options.color || style.color });
  return result;
}

module.exports = {
  FRAME_RENDERERS,
  MASK_SEGMENTS,
  hashSeed,
  createSeededRandom,
  generateNormalizedEdgeProfile,
  getCachedNormalizedEdgeProfile,
  selectTextureVariant,
  selectMaskVariant,
  getMaskAssetPaths,
  buildFramePaths,
  traceHardPolygonPath,
  traceRectPath,
  traceSideAwareProfilePath,
  traceSmoothPath,
  drawImageWithInnerFrame,
  drawImageWithSegmentedMask: drawSegmentedMaskFrame,
  drawFilmGateFrame,
  drawPerforatedFilmFrame,
  drawMediumFormatFrame,
  drawEmulsionDamageFrame,
  drawScanEmulsionEdgeFrame,
  drawFilmFrame,
  drawFilmRebateLayoutFrame,
  drawFilmMarker,
  drawTextureOverlay,
  getScanEmulsionSideWidths,
  traceAperturePath
};
