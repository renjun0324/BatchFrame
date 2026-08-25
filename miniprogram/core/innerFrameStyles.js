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
  FILM_FRAME: 'film-frame',
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
    renderer: FRAME_RENDERER_TYPES.FILM_FRAME, layoutModel: 'film-frame',
    color: '#030303', supportsColor: false, supportsStrength: false,
    supportsFrameSize: true, supportsPerforations: true, supportsEdgeLabel: true,
    supportsFrameNumber: true, supportsMarkers: true,
    previewAsset: '/assets/frame-previews/film-strip-35mm-full.png',
    supportedRatios: ['1:1', '2:3', '3:4', '4:5', '16:9'],
    frame: {
      color: '#030303',
      sizePresets: {
        compact: { top: 0.78, right: 0.82, bottom: 0.78, left: 0.82 },
        standard: { top: 1, right: 1, bottom: 1, left: 1 }
      }
    },
    geometry: {
      rebates: { top: 0.154, right: 0.027, bottom: 0.154, left: 0.027 },
      orientationPolicy: 'rotate-film-layout',
      aperture: { shape: 'rect', cornerRadiusRatio: 0 }
    },
    perforations: { enabled: true, sides: ['top', 'bottom'], shape: 'rounded-rect', count: 8, widthRatio: 0.055, heightRatio: 0.077, cornerRadiusRatio: 0.018, gapPolicy: 'even', color: 'outer-background' },
    decorations: {
      labels: [{ enabled: true, text: 'BATCHFRAME COLOR 400', color: '#F3A126', anchor: 'top-start', sizeRatio: 0.035, spanRatio: 0.35, portraitRotation: 'counter-clockwise' }],
      frameNumbers: [
        { enabled: true, value: 'sequence-2-digit', color: '#F3A126', anchor: 'bottom-start', sizeRatio: 0.04, spanRatio: 0.12 },
        { enabled: true, value: 'sequence-alpha', color: '#F3A126', anchor: 'bottom-center', sizeRatio: 0.04, spanRatio: 0.08 }
      ],
      markers: [{ enabled: true, type: 'triangle', color: '#F3A126', anchor: 'bottom-end', sizeRatio: 0.025, spanRatio: 0.04 }]
    },
    material: { textureOverlay: null }
  },
  {
    id: 'film-rebate-minimal', name: '极简胶片边码', category: 'film-rebate',
    renderer: FRAME_RENDERER_TYPES.FILM_FRAME, layoutModel: 'film-frame',
    color: '#030303', supportsColor: false, supportsStrength: false,
    supportsFrameSize: true, supportsPerforations: false, supportsEdgeLabel: true,
    supportsFrameNumber: true, supportsMarkers: true,
    previewAsset: '/assets/frame-previews/film-rebate-minimal.png',
    supportedRatios: ['1:1', '2:3', '3:4', '4:5', '9:16', '16:9'],
    frame: {
      color: '#030303',
      sizePresets: {
        compact: { top: 0.82, right: 0.82, bottom: 0.82, left: 0.82 },
        standard: { top: 1, right: 1, bottom: 1, left: 1 }
      }
    },
    geometry: {
      rebates: { top: 0.033, right: 0.032, bottom: 0.032, left: 0.032 },
      orientationPolicy: 'rotate-film-layout',
      aperture: { shape: 'rect', cornerRadiusRatio: 0 }
    },
    perforations: { enabled: false, sides: [], shape: 'rect', count: 0, widthRatio: 0.01, heightRatio: 0.01, cornerRadiusRatio: 0, gapPolicy: 'even', color: 'outer-background' },
    decorations: {
      labels: [{ enabled: true, text: 'BATCHFRAME  ·  07', color: '#F3A126', anchor: 'top-start', sizeRatio: 0.035, spanRatio: 0.4 }],
      frameNumbers: [
        { enabled: true, value: 'sequence-2-digit', color: '#F3A126', anchor: 'top-end', sizeRatio: 0.04, spanRatio: 0.1 },
        { enabled: true, value: 'sequence', color: '#F3A126', anchor: 'bottom-center', sizeRatio: 0.04, spanRatio: 0.08 }
      ],
      markers: [
        { enabled: true, type: 'triangle', color: '#F3A126', anchor: 'bottom-start', sizeRatio: 0.025, spanRatio: 0.04 },
        { enabled: true, type: 'triangle', color: '#F3A126', anchor: 'bottom-end', sizeRatio: 0.025, spanRatio: 0.04 }
      ]
    },
    material: { textureOverlay: null }
  },
  {
    id: 'film-35mm-mono', name: '35mm 黑白片基', category: 'film-rebate',
    renderer: FRAME_RENDERER_TYPES.FILM_FRAME, layoutModel: 'film-frame',
    color: '#050505', supportsColor: false, supportsStrength: false,
    supportsFrameSize: true, supportsPerforations: true, supportsEdgeLabel: true,
    supportsFrameNumber: true, supportsMarkers: true,
    previewAsset: '/assets/frame-previews/film-35mm-mono.png',
    supportedRatios: ['1:1', '2:3', '3:4', '4:5', '16:9'],
    frame: {
      color: '#050505',
      sizePresets: {
        compact: { top: 0.8, right: 0.84, bottom: 0.8, left: 0.84 },
        standard: { top: 1, right: 1, bottom: 1, left: 1 }
      }
    },
    geometry: {
      rebates: { top: 0.145, right: 0.028, bottom: 0.145, left: 0.028 },
      orientationPolicy: 'rotate-film-layout',
      aperture: { shape: 'rect', cornerRadiusRatio: 0 }
    },
    perforations: { enabled: true, sides: ['top', 'bottom'], count: 8, shape: 'rounded-rect', widthRatio: 0.052, heightRatio: 0.073, cornerRadiusRatio: 0.018, gapPolicy: 'even', color: 'outer-background' },
    decorations: {
      labels: [{ enabled: true, text: 'BF MONO 400', color: '#D8D8D2', anchor: 'top-start', sizeRatio: 0.035, spanRatio: 0.28, portraitRotation: 'counter-clockwise' }],
      frameNumbers: [{ enabled: true, value: 'sequence-2-digit', color: '#D8D8D2', anchor: 'bottom-start', sizeRatio: 0.04, spanRatio: 0.12 }],
      markers: [{ enabled: true, type: 'square', color: '#D8D8D2', anchor: 'bottom-end', sizeRatio: 0.025, spanRatio: 0.04 }]
    },
    material: { textureOverlay: null }
  },
  {
    id: 'film-35mm-warm', name: '35mm 暖调片基', category: 'film-rebate',
    renderer: FRAME_RENDERER_TYPES.FILM_FRAME, layoutModel: 'film-frame',
    color: '#130D09', supportsColor: false, supportsStrength: false,
    supportsFrameSize: true, supportsPerforations: true, supportsEdgeLabel: true,
    supportsFrameNumber: true, supportsMarkers: true,
    previewAsset: '/assets/frame-previews/film-35mm-warm.png',
    supportedRatios: ['1:1', '2:3', '3:4', '4:5', '16:9'],
    frame: {
      color: '#130D09',
      sizePresets: {
        compact: { top: 0.8, right: 0.84, bottom: 0.8, left: 0.84 },
        standard: { top: 1, right: 1, bottom: 1, left: 1 }
      }
    },
    geometry: {
      rebates: { top: 0.15, right: 0.028, bottom: 0.15, left: 0.028 },
      orientationPolicy: 'rotate-film-layout',
      aperture: { shape: 'rect', cornerRadiusRatio: 0 }
    },
    perforations: { enabled: true, sides: ['top', 'bottom'], count: 8, shape: 'rounded-rect', widthRatio: 0.055, heightRatio: 0.077, cornerRadiusRatio: 0.018, gapPolicy: 'even', color: 'outer-background' },
    decorations: {
      labels: [{ enabled: true, text: 'BF COLOR 200', color: '#D98235', anchor: 'top-start', sizeRatio: 0.035, spanRatio: 0.3, portraitRotation: 'counter-clockwise' }],
      frameNumbers: [
        { enabled: true, value: 'sequence-2-digit', color: '#D98235', anchor: 'bottom-start', sizeRatio: 0.04, spanRatio: 0.12 },
        { enabled: true, value: 'sequence-alpha', color: '#D98235', anchor: 'bottom-center', sizeRatio: 0.04, spanRatio: 0.08 }
      ],
      markers: [{ enabled: true, type: 'arrow', color: '#D98235', anchor: 'bottom-end', sizeRatio: 0.028, spanRatio: 0.05 }]
    },
    material: { textureOverlay: null }
  },
  {
    id: 'film-120-classic', name: '120 经典片基', category: 'film-rebate',
    renderer: FRAME_RENDERER_TYPES.FILM_FRAME, layoutModel: 'film-frame',
    color: '#040404', supportsColor: false, supportsStrength: false,
    supportsFrameSize: true, supportsPerforations: false, supportsEdgeLabel: true,
    supportsFrameNumber: true, supportsMarkers: true,
    previewAsset: '/assets/frame-previews/film-120-classic.png',
    supportedRatios: ['1:1', '2:3', '3:4', '4:5', '9:16', '16:9'],
    frame: {
      color: '#040404',
      sizePresets: {
        compact: { top: 0.8, right: 0.82, bottom: 0.8, left: 0.82 },
        standard: { top: 1, right: 1, bottom: 1, left: 1 }
      }
    },
    geometry: {
      rebates: { top: 0.065, right: 0.055, bottom: 0.08, left: 0.055 },
      orientationPolicy: 'rotate-film-layout',
      aperture: { shape: 'rect', cornerRadiusRatio: 0 }
    },
    perforations: { enabled: false, sides: [], count: 0, shape: 'rect', widthRatio: 0.01, heightRatio: 0.01, cornerRadiusRatio: 0, gapPolicy: 'even', color: 'outer-background' },
    decorations: {
      labels: [{ enabled: true, text: 'BF 120  ·  FRAME', color: '#DDD8CC', anchor: 'top-start', sizeRatio: 0.032, spanRatio: 0.36 }],
      frameNumbers: [{ enabled: true, value: 'sequence-2-digit', color: '#DDD8CC', anchor: 'bottom-end', sizeRatio: 0.04, spanRatio: 0.12 }],
      markers: [{ enabled: true, type: 'circle', color: '#DDD8CC', anchor: 'bottom-start', sizeRatio: 0.026, spanRatio: 0.04 }]
    },
    material: { textureOverlay: null }
  },
  {
    id: 'film-16mm-cinema', name: '16mm 电影片基', category: 'film-rebate',
    renderer: FRAME_RENDERER_TYPES.FILM_FRAME, layoutModel: 'film-frame',
    color: '#050505', supportsColor: false, supportsStrength: false,
    supportsFrameSize: true, supportsPerforations: true, supportsEdgeLabel: true,
    supportsFrameNumber: true, supportsMarkers: true,
    previewAsset: '/assets/frame-previews/film-16mm-cinema.png',
    supportedRatios: ['1:1', '2:3', '3:4', '4:5', '16:9'],
    frame: {
      color: '#050505',
      sizePresets: {
        compact: { top: 0.8, right: 0.86, bottom: 0.8, left: 0.86 },
        standard: { top: 1, right: 1, bottom: 1, left: 1 }
      }
    },
    geometry: {
      rebates: { top: 0.105, right: 0.024, bottom: 0.105, left: 0.024 },
      orientationPolicy: 'rotate-film-layout',
      aperture: { shape: 'rect', cornerRadiusRatio: 0 }
    },
    perforations: { enabled: true, sides: ['top', 'bottom'], count: 13, shape: 'rounded-rect', widthRatio: 0.027, heightRatio: 0.048, cornerRadiusRatio: 0.014, gapPolicy: 'even', color: 'outer-background' },
    decorations: {
      labels: [{ enabled: true, text: 'BF CINEMA 16', color: '#E4B45E', anchor: 'top-start', sizeRatio: 0.03, spanRatio: 0.3, portraitRotation: 'counter-clockwise' }],
      frameNumbers: [{ enabled: true, value: 'sequence-2-digit', color: '#E4B45E', anchor: 'bottom-center', sizeRatio: 0.035, spanRatio: 0.1 }],
      markers: [
        { enabled: true, type: 'square', color: '#E4B45E', anchor: 'bottom-start', sizeRatio: 0.02, spanRatio: 0.035 },
        { enabled: true, type: 'arrow', color: '#E4B45E', anchor: 'bottom-end', sizeRatio: 0.024, spanRatio: 0.05 }
      ]
    },
    material: { textureOverlay: null }
  },
  {
    id: 'film-110-pocket', name: '110 袖珍胶片', category: 'film-rebate',
    renderer: FRAME_RENDERER_TYPES.FILM_FRAME, layoutModel: 'film-frame',
    color: '#080706', supportsColor: false, supportsStrength: false,
    supportsFrameSize: true, supportsPerforations: true, supportsEdgeLabel: true,
    supportsFrameNumber: true, supportsMarkers: true,
    previewAsset: '/assets/frame-previews/film-110-pocket.png',
    supportedRatios: ['1:1', '2:3', '3:4', '4:5', '9:16', '16:9'],
    frame: {
      color: '#080706',
      sizePresets: {
        compact: { top: 0.8, right: 0.82, bottom: 0.8, left: 0.82 },
        standard: { top: 1, right: 1, bottom: 1, left: 1 }
      }
    },
    geometry: {
      rebates: { top: 0.07, right: 0.025, bottom: 0.11, left: 0.025 },
      orientationPolicy: 'rotate-film-layout',
      aperture: { shape: 'rect', cornerRadiusRatio: 0 }
    },
    perforations: { enabled: true, sides: ['bottom'], count: 8, shape: 'rounded-rect', widthRatio: 0.032, heightRatio: 0.045, cornerRadiusRatio: 0.012, gapPolicy: 'even', color: 'outer-background' },
    decorations: {
      labels: [{ enabled: true, text: 'BF 110', color: '#E1D7C5', anchor: 'top-start', sizeRatio: 0.03, spanRatio: 0.2, portraitRotation: 'counter-clockwise' }],
      frameNumbers: [{ enabled: true, value: 'sequence', color: '#E1D7C5', anchor: 'bottom-end', sizeRatio: 0.038, spanRatio: 0.08 }],
      markers: [{ enabled: true, type: 'square', color: '#E1D7C5', anchor: 'bottom-start', sizeRatio: 0.022, spanRatio: 0.04 }]
    },
    material: { textureOverlay: null }
  },
  {
    id: 'film-contact-sheet', name: '接触印样', category: 'film-rebate',
    renderer: FRAME_RENDERER_TYPES.FILM_FRAME, layoutModel: 'film-frame',
    color: '#090909', supportsColor: false, supportsStrength: false,
    supportsFrameSize: true, supportsPerforations: false, supportsEdgeLabel: true,
    supportsFrameNumber: true, supportsMarkers: true,
    previewAsset: '/assets/frame-previews/film-contact-sheet.png',
    supportedRatios: ['1:1', '2:3', '3:4', '4:5', '9:16', '16:9'],
    frame: {
      color: '#090909',
      sizePresets: {
        compact: { top: 0.82, right: 0.82, bottom: 0.82, left: 0.82 },
        standard: { top: 1, right: 1, bottom: 1, left: 1 }
      }
    },
    geometry: {
      rebates: { top: 0.07, right: 0.045, bottom: 0.095, left: 0.045 },
      orientationPolicy: 'rotate-film-layout',
      aperture: { shape: 'rect', cornerRadiusRatio: 0 }
    },
    perforations: { enabled: false, sides: [], count: 0, shape: 'rect', widthRatio: 0.01, heightRatio: 0.01, cornerRadiusRatio: 0, gapPolicy: 'even', color: 'outer-background' },
    decorations: {
      labels: [
        { enabled: true, text: 'BF CONTACT', color: '#E7E0D2', anchor: 'top-start', sizeRatio: 0.03, spanRatio: 0.26 },
        { enabled: true, text: 'ARCHIVE', color: '#A9A49A', anchor: 'top-end', sizeRatio: 0.026, spanRatio: 0.18 }
      ],
      frameNumbers: [
        { enabled: true, value: 'sequence-2-digit', color: '#E7E0D2', anchor: 'bottom-start', sizeRatio: 0.037, spanRatio: 0.1 },
        { enabled: true, value: 'sequence-alpha', color: '#A9A49A', anchor: 'bottom-center', sizeRatio: 0.032, spanRatio: 0.08 }
      ],
      markers: [
        { enabled: true, type: 'line', color: '#E7E0D2', anchor: 'bottom-end', sizeRatio: 0.02, spanRatio: 0.06 },
        { enabled: true, type: 'square', color: '#E7E0D2', anchor: 'corner-bottom-right', sizeRatio: 0.018, spanRatio: 0.04 },
        { enabled: true, type: 'line', color: '#A9A49A', anchor: 'corner-top-left', sizeRatio: 0.018, spanRatio: 0.04 }
      ]
    },
    material: { textureOverlay: null }
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
