const { FRAME_RENDERER_TYPES } = require('./innerFrameStyles');

const VALID_SIDES = ['top', 'right', 'bottom', 'left'];
const VALID_ANCHORS = [
  'top-start', 'top-center', 'top-end',
  'right-start', 'right-center', 'right-end',
  'bottom-start', 'bottom-center', 'bottom-end',
  'left-start', 'left-center', 'left-end',
  'corner-top-left', 'corner-top-right',
  'corner-bottom-left', 'corner-bottom-right'
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeRendererType(renderer) {
  if (renderer === FRAME_RENDERER_TYPES.FILM_REBATE_LAYOUT || renderer === 'film-rebate-layout') {
    return FRAME_RENDERER_TYPES.FILM_FRAME;
  }
  return renderer;
}

function isFilmFrameStyle(style) {
  if (!style) return false;
  return normalizeRendererType(style.renderer) === FRAME_RENDERER_TYPES.FILM_FRAME ||
    style.layoutModel === 'film-frame' || style.layoutModel === 'film-rebate';
}

function normalizeRebates(raw) {
  const source = raw || {};
  return {
    top: clamp(number(source.top, number(source.topRatio, 0.032)), 0.005, 0.45),
    right: clamp(number(source.right, number(source.rightRatio, 0.032)), 0.005, 0.45),
    bottom: clamp(number(source.bottom, number(source.bottomRatio, 0.032)), 0.005, 0.45),
    left: clamp(number(source.left, number(source.leftRatio, 0.032)), 0.005, 0.45)
  };
}

function normalizeSizePresets(raw) {
  const source = raw || {};
  const fallback = { top: 1, right: 1, bottom: 1, left: 1 };
  const normalizePreset = preset => {
    const value = preset || {};
    return {
      top: clamp(number(value.top, number(value.topScale, 1)), 0.3, 1.5),
      right: clamp(number(value.right, number(value.rightScale, 1)), 0.3, 1.5),
      bottom: clamp(number(value.bottom, number(value.bottomScale, 1)), 0.3, 1.5),
      left: clamp(number(value.left, number(value.leftScale, 1)), 0.3, 1.5)
    };
  };
  const result = {};
  Object.keys(source).forEach(key => { result[key] = normalizePreset(source[key]); });
  if (!result.standard) result.standard = { ...fallback };
  if (!result.compact) result.compact = { ...result.standard };
  return result;
}

function legacyAnchor(value, fallback) {
  const map = {
    'top-left': 'top-start', 'top-center': 'top-center', 'top-right': 'top-end',
    'right-top': 'right-start', 'right-center': 'right-center', 'right-bottom': 'right-end',
    'bottom-left': 'bottom-start', 'bottom-center': 'bottom-center', 'bottom-right': 'bottom-end',
    'left-top': 'left-start', 'left-center': 'left-center', 'left-bottom': 'left-end'
  };
  const anchor = map[value] || value || fallback;
  return VALID_ANCHORS.indexOf(anchor) >= 0 ? anchor : fallback;
}

function normalizeDecoration(item, fallback) {
  const source = item || {};
  return {
    enabled: source.enabled !== false,
    anchor: legacyAnchor(source.anchor || source.position, fallback.anchor),
    color: source.color || fallback.color || '#F3A126',
    sizeRatio: clamp(number(source.sizeRatio, fallback.sizeRatio || 0.035), 0.008, 0.12),
    spanRatio: clamp(number(source.spanRatio, fallback.spanRatio || 0.18), 0.04, 0.9),
    portraitRotation: source.portraitRotation || fallback.portraitRotation || 'none',
    text: source.text || source.textPreset || fallback.text || '',
    value: source.value || fallback.value || 'literal',
    type: source.type || fallback.type || 'triangle'
  };
}

function normalizeDecorations(style, legacy) {
  const canonical = style.decorations || {};
  const legacyLabel = style.labels || {};
  const legacyNumbers = style.frameNumbers || {};
  const legacyMarkers = style.markers || {};
  const labelSource = canonical.labels || (legacyLabel.enabled || legacy.edgeLabel
    ? [{ enabled: legacyLabel.enabled, position: legacyLabel.position, text: legacyLabel.text || legacyLabel.textPreset }]
    : []);
  const numberSource = canonical.frameNumbers || (legacyNumbers.enabled || legacy.frameNumber
    ? (legacyNumbers.positions || ['bottom-left']).map((position, index) => ({
      enabled: legacyNumbers.enabled,
      position,
      value: index === 0 ? 'sequence-2-digit' : 'sequence-alpha'
    }))
    : []);
  const markerSource = canonical.markers || (legacyMarkers.enabled || legacy.markers
    ? (legacyMarkers.positions || ['bottom-right']).map(position => ({ enabled: legacyMarkers.enabled, position, type: 'triangle' }))
    : []);
  return {
    labels: labelSource.map(item => normalizeDecoration(item, {
      anchor: 'top-start', text: 'BATCHFRAME COLOR 400', spanRatio: 0.35, sizeRatio: 0.035
    })),
    frameNumbers: numberSource.map(item => normalizeDecoration(item, {
      anchor: 'bottom-start', value: 'sequence-2-digit', spanRatio: 0.12, sizeRatio: 0.04
    })),
    markers: markerSource.map(item => normalizeDecoration(item, {
      anchor: 'bottom-end', type: 'triangle', spanRatio: 0.04, sizeRatio: 0.025
    }))
  };
}

function normalizePerforations(style, legacy) {
  const source = style.perforations || legacy.perforations || {};
  const enabled = source.enabled === true;
  const sides = (source.sides || (enabled ? ['top', 'bottom'] : []))
    .filter(side => VALID_SIDES.indexOf(side) >= 0);
  const shape = ['rect', 'rounded-rect', 'circle'].indexOf(source.shape) >= 0
    ? source.shape
    : 'rounded-rect';
  return {
    enabled,
    sides,
    count: Math.max(0, Math.min(64, Math.floor(number(source.count, enabled ? 8 : 0)))),
    shape,
    widthRatio: clamp(number(source.widthRatio, 0.055), 0.002, 0.3),
    heightRatio: clamp(number(source.heightRatio, 0.077), 0.002, 0.3),
    cornerRadiusRatio: clamp(number(source.cornerRadiusRatio, 0.018), 0, 0.1),
    gapPolicy: source.gapPolicy === 'fixed' ? 'fixed' : 'even',
    color: source.color || 'outer-background'
  };
}

function normalizeTextureOverlay(style) {
  const source = style.material && style.material.textureOverlay;
  if (!source || !source.root) return null;
  return {
    type: source.type || 'segmented-mask',
    root: String(source.root).replace(/^\/+/, ''),
    variants: Math.max(1, Math.min(8, Math.floor(number(source.variants, 1)))),
    placement: ['outer-edge', 'frame-body', 'inner-edge'].indexOf(source.placement) >= 0
      ? source.placement
      : 'outer-edge',
    tint: source.tint || null,
    tiered: source.tiered === true
  };
}

function normalizeFilmFrameStyle(style) {
  const source = style || {};
  const legacy = source.filmLayout || {};
  const geometrySource = source.geometry || legacy.geometry || {};
  const frameSource = source.frame || {};
  const apertureSource = geometrySource.aperture || {};
  const orientationPolicy = geometrySource.orientationPolicy === 'fixed'
    ? 'fixed'
    : 'rotate-film-layout';
  return {
    id: source.id || 'film-frame',
    name: source.name || '',
    category: source.category || 'film-rebate',
    renderer: FRAME_RENDERER_TYPES.FILM_FRAME,
    layoutModel: 'film-frame',
    frame: {
      color: frameSource.color || source.color || '#030303',
      sizePresets: normalizeSizePresets(frameSource.sizePresets || source.sizePresets || legacy.sizePresets)
    },
    geometry: {
      rebates: normalizeRebates(geometrySource.rebates),
      orientationPolicy,
      aperture: {
        shape: apertureSource.shape === 'rounded-rect' ? 'rounded-rect' : 'rect',
        cornerRadiusRatio: clamp(number(apertureSource.cornerRadiusRatio, 0), 0, 0.01)
      }
    },
    perforations: normalizePerforations(source, legacy),
    decorations: normalizeDecorations(source, legacy),
    material: { textureOverlay: normalizeTextureOverlay(source) }
  };
}

function resolveFrameNumberValue(rule, frameIndex) {
  const index = Math.max(1, Math.floor(number(frameIndex, 1)));
  if (rule == null || rule === 'literal') return '';
  if (typeof rule === 'object' && rule.literal != null) return String(rule.literal);
  if (typeof rule === 'string' && rule.indexOf('literal:') === 0) return rule.slice(8);
  switch (rule) {
    case 'sequence': return String(index);
    case 'sequence-2-digit': return String(index).padStart(2, '0');
    case 'sequence-alpha': return `${index}A`;
    default: return String(rule);
  }
}

function resolvePortraitRotation(value, orientation) {
  if (orientation !== 'portrait') return 0;
  if (value === 'counter-clockwise') return -Math.PI / 2;
  if (value === 'clockwise') return Math.PI / 2;
  return 0;
}

module.exports = {
  VALID_ANCHORS,
  normalizeRendererType,
  isFilmFrameStyle,
  normalizeFilmFrameStyle,
  resolveFrameNumberValue,
  resolvePortraitRotation
};
