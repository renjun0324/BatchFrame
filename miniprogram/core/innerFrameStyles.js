/**
 * Production inner-frame catalog. The page only consumes this metadata; all
 * geometry and Canvas drawing lives in innerFrameRenderer.js.
 */
const FRAME_RENDERER_TYPES = Object.freeze({
  NONE: 'none',
  CLEAN: 'clean',
  SEGMENTED_MASK: 'segmented-mask',
  FILM_GATE: 'film-gate',
  PERFORATED_FILM: 'perforated-film',
  MEDIUM_FORMAT_REBATE: 'medium-format-rebate',
  EMULSION_MASK: 'emulsion-mask',
  SCAN_EMULSION_EDGE: 'scan-emulsion-edge',
  FILM_REBATE_LAYOUT: 'film-rebate-layout'
});

const MATERIAL_STRENGTH_PRESETS = Object.freeze({
  'full-frame-scan': Object.freeze({
    light: Object.freeze({ maskTier: 'light', intrusionScale: 0.35, irregularityScale: 0.45, fragmentDensity: 0, fragmentSize: 0, notchCount: 1 }),
    medium: Object.freeze({ maskTier: 'medium', intrusionScale: 0.7, irregularityScale: 0.85, fragmentDensity: 0, fragmentSize: 0, notchCount: 3 }),
    strong: Object.freeze({ maskTier: 'strong', intrusionScale: 1.15, irregularityScale: 1.35, fragmentDensity: 0, fragmentSize: 0, notchCount: 6 })
  }),
  'emulsion-damage': Object.freeze({
    light: Object.freeze({ maskTier: 'light', intrusionScale: 0.35, irregularityScale: 0.5, fragmentDensity: 0.025, fragmentSize: 0.7, notchCount: 2 }),
    medium: Object.freeze({ maskTier: 'medium', intrusionScale: 0.72, irregularityScale: 0.95, fragmentDensity: 0.09, fragmentSize: 1.2, notchCount: 5 }),
    strong: Object.freeze({ maskTier: 'strong', intrusionScale: 1.2, irregularityScale: 1.45, fragmentDensity: 0.2, fragmentSize: 2, notchCount: 10 })
  })
});

const INNER_FRAME_STYLES = Object.freeze([
  {
    id: 'none', name: '无内框', renderer: FRAME_RENDERER_TYPES.NONE,
    color: 'transparent', widthAt1800: 0, supportsStrength: false,
    supportsColor: false, previewAsset: '/assets/frame-previews/none.png',
    supportedRatios: ['1:1', '2:3', '3:4', '4:5', '9:16', '16:9']
  },
  {
    id: 'clean-black', name: '经典细黑边', renderer: FRAME_RENDERER_TYPES.CLEAN,
    color: '#050505', widthAt1800: 8, supportsStrength: false,
    supportsColor: true, previewAsset: '/assets/frame-previews/clean-black.png',
    supportedRatios: ['1:1', '2:3', '3:4', '4:5', '9:16', '16:9']
  },
  {
    id: 'full-frame-scan', name: '全幅扫描边', renderer: FRAME_RENDERER_TYPES.SEGMENTED_MASK,
    color: '#050505', widthAt1800: 12, supportsStrength: true, supportsColor: false,
    strengthPresets: MATERIAL_STRENGTH_PRESETS['full-frame-scan'],
    maskRoot: 'assets/frame-masks/full-frame-scan', maskVariants: 3, maskTiered: true,
    previewAsset: '/assets/frame-previews/full-frame-scan.png',
    supportedRatios: ['1:1', '2:3', '3:4', '4:5', '9:16', '16:9']
  },
  {
    id: 'scan-emulsion-edge', name: '原片扫描黑边', category: 'basic-frame',
    renderer: FRAME_RENDERER_TYPES.SCAN_EMULSION_EDGE,
    color: '#050505', widthAt1800: 18, supportsStrength: false, supportsColor: false,
    maskRoot: 'assets/frame-masks/scan-emulsion-edge', maskVariants: 3, maskTiered: false,
    previewAsset: '/assets/frame-previews/scan-emulsion-edge.png',
    supportedRatios: ['1:1', '2:3', '3:4', '4:5', '9:16', '16:9']
  },
  {
    id: 'film-gate', name: '片门压框', category: 'basic-frame', renderer: FRAME_RENDERER_TYPES.FILM_GATE,
    color: '#020202', widthAt1800: 24, supportsStrength: false, supportsColor: false,
    variants: 3, previewAsset: '/assets/frame-previews/film-gate.png',
    supportedRatios: ['1:1', '2:3', '3:4', '4:5', '9:16', '16:9']
  },
  {
    id: 'film-strip-35mm-full', name: '35mm 完整片基', category: 'film-rebate',
    renderer: FRAME_RENDERER_TYPES.FILM_REBATE_LAYOUT, layoutModel: 'film-rebate',
    color: '#030303', supportsColor: false, supportsStrength: false,
    supportsFrameSize: true, supportsPerforations: true, supportsEdgeLabel: true,
    supportsFrameNumber: true, supportsMarkers: true,
    previewAsset: '/assets/frame-previews/film-strip-35mm-full.png',
    supportedRatios: ['1:1', '2:3', '3:4', '4:5', '16:9'],
    geometry: {
      frameAspectPolicy: 'derived-from-aperture',
      rebates: { topRatio: 0.154, rightRatio: 0.027, bottomRatio: 0.154, leftRatio: 0.027 }
    },
    perforations: { enabled: true, sides: ['top', 'bottom'], shape: 'rounded-rect', count: 8, widthRatio: 0.055, heightRatio: 0.077, cornerRadiusRatio: 0.018 },
    labels: { enabled: true, position: 'top-left', textPreset: 'BATCHFRAME COLOR 400' },
    frameNumbers: { enabled: true, positions: ['bottom-left', 'bottom-center'] },
    markers: { enabled: true, positions: ['bottom-right'] },
    filmLayout: {
      geometry: { rebates: { topRatio: 0.154, rightRatio: 0.027, bottomRatio: 0.154, leftRatio: 0.027 } },
      sizePresets: {
        compact: { topScale: 0.78, rightScale: 0.82, bottomScale: 0.78, leftScale: 0.82 },
        standard: { topScale: 1, rightScale: 1, bottomScale: 1, leftScale: 1 }
      },
      perforations: { enabled: true, count: 8, widthRatio: 0.055, heightRatio: 0.077, cornerRadiusRatio: 0.018 },
      edgeLabel: true,
      frameNumber: true,
      markers: true
    }
  },
  {
    id: 'film-rebate-minimal', name: '极简胶片边码', category: 'film-rebate',
    renderer: FRAME_RENDERER_TYPES.FILM_REBATE_LAYOUT, layoutModel: 'film-rebate',
    color: '#030303', supportsColor: false, supportsStrength: false,
    supportsFrameSize: true, supportsPerforations: false, supportsEdgeLabel: true,
    supportsFrameNumber: true, supportsMarkers: true,
    previewAsset: '/assets/frame-previews/film-rebate-minimal.png',
    supportedRatios: ['1:1', '2:3', '3:4', '4:5', '9:16', '16:9'],
    geometry: {
      frameAspectPolicy: 'derived-from-aperture',
      rebates: { topRatio: 0.033, rightRatio: 0.032, bottomRatio: 0.032, leftRatio: 0.032 }
    },
    perforations: { enabled: false, sides: [], shape: 'none', count: 0, widthRatio: 0, heightRatio: 0, cornerRadiusRatio: 0 },
    labels: { enabled: true, position: 'top-left', textPreset: 'BATCHFRAME COLOR 400' },
    frameNumbers: { enabled: true, positions: ['top-right', 'bottom-center'] },
    markers: { enabled: true, positions: ['bottom-left', 'bottom-right'] },
    filmLayout: {
      geometry: { rebates: { topRatio: 0.033, rightRatio: 0.032, bottomRatio: 0.032, leftRatio: 0.032 } },
      sizePresets: {
        compact: { topScale: 0.82, rightScale: 0.82, bottomScale: 0.82, leftScale: 0.82 },
        standard: { topScale: 1, rightScale: 1, bottomScale: 1, leftScale: 1 }
      },
      perforations: { enabled: false, count: 0, widthRatio: 0, heightRatio: 0, cornerRadiusRatio: 0 },
      edgeLabel: true,
      frameNumber: true,
      markers: true
    }
  },
  {
    id: 'medium-format-120', name: '120 中画幅', category: 'film-rebate-legacy', renderer: FRAME_RENDERER_TYPES.MEDIUM_FORMAT_REBATE,
    color: '#030303', widthAt1800: 64, supportsStrength: false, supportsColor: false,
    variants: 3, previewAsset: '/assets/frame-previews/medium-format-120.png',
    supportedRatios: ['1:1', '3:4', '4:5']
  },
  {
    id: 'emulsion-damage', name: '乳剂破损边', renderer: FRAME_RENDERER_TYPES.EMULSION_MASK,
    color: '#030303', widthAt1800: 18, supportsStrength: true, supportsColor: false,
    strengthPresets: MATERIAL_STRENGTH_PRESETS['emulsion-damage'],
    maskRoot: 'assets/frame-masks/emulsion-damage', maskVariants: 3, maskTiered: true,
    previewAsset: '/assets/frame-previews/emulsion-damage.png',
    supportedRatios: ['1:1', '2:3', '3:4', '4:5', '9:16', '16:9']
  }
]);

const EDGE_STRENGTHS = Object.freeze([
  { id: 'light', name: '轻', value: 0.72 },
  { id: 'medium', name: '标准', value: 1 },
  { id: 'strong', name: '明显', value: 1.28 }
]);

const LEGACY_STYLE_IDS = Object.freeze({
  'darkroom-scan': 'full-frame-scan',
  'rough-emulsion': 'emulsion-damage',
  'negative-35mm': 'film-strip-35mm-full'
});

function migrateInnerFrameStyleId(id) {
  return LEGACY_STYLE_IDS[id] || id;
}

function getInnerFrameStyle(id) {
  const migrated = migrateInnerFrameStyleId(id);
  return INNER_FRAME_STYLES.find(style => style.id === migrated) || INNER_FRAME_STYLES[1];
}

function getEdgeStrength(level) {
  const item = EDGE_STRENGTHS.find(option => option.id === level);
  return item ? item.value : 1;
}

function getStrengthPreset(styleId, level = 'medium') {
  const style = getInnerFrameStyle(styleId);
  const presets = style.strengthPresets;
  if (!presets) return { maskTier: level, intrusionScale: 1, irregularityScale: 1, fragmentDensity: 0, fragmentSize: 1, notchCount: 0 };
  return presets[level] || presets.medium || presets.light;
}

module.exports = {
  FRAME_RENDERER_TYPES,
  INNER_FRAME_STYLES,
  EDGE_STRENGTHS,
  LEGACY_STYLE_IDS,
  migrateInnerFrameStyleId,
  getInnerFrameStyle,
  getEdgeStrength,
  getStrengthPreset
};
