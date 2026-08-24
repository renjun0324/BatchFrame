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
  EMULSION_MASK: 'emulsion-mask'
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
    maskRoot: 'assets/frame-masks/full-frame-scan', maskVariants: 3,
    previewAsset: '/assets/frame-previews/full-frame-scan.png',
    supportedRatios: ['1:1', '2:3', '3:4', '4:5', '9:16', '16:9']
  },
  {
    id: 'film-gate', name: '片门压框', renderer: FRAME_RENDERER_TYPES.FILM_GATE,
    color: '#020202', widthAt1800: 24, supportsStrength: false, supportsColor: false,
    variants: 3, previewAsset: '/assets/frame-previews/film-gate.png',
    supportedRatios: ['1:1', '2:3', '3:4', '4:5', '9:16', '16:9']
  },
  {
    id: 'negative-35mm', name: '35mm 负片', renderer: FRAME_RENDERER_TYPES.PERFORATED_FILM,
    color: '#020202', widthAt1800: 52, supportsStrength: false, supportsColor: false,
    variants: 3, previewAsset: '/assets/frame-previews/negative-35mm.png',
    supportedRatios: ['2:3', '3:4', '4:5', '16:9']
  },
  {
    id: 'medium-format-120', name: '120 中画幅', renderer: FRAME_RENDERER_TYPES.MEDIUM_FORMAT_REBATE,
    color: '#030303', widthAt1800: 64, supportsStrength: false, supportsColor: false,
    variants: 3, previewAsset: '/assets/frame-previews/medium-format-120.png',
    supportedRatios: ['1:1', '3:4', '4:5']
  },
  {
    id: 'emulsion-damage', name: '乳剂破损边', renderer: FRAME_RENDERER_TYPES.EMULSION_MASK,
    color: '#030303', widthAt1800: 18, supportsStrength: true, supportsColor: false,
    maskRoot: 'assets/frame-masks/emulsion-damage', maskVariants: 3,
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
  'rough-emulsion': 'emulsion-damage'
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

module.exports = {
  FRAME_RENDERER_TYPES,
  INNER_FRAME_STYLES,
  EDGE_STRENGTHS,
  LEGACY_STYLE_IDS,
  migrateInnerFrameStyleId,
  getInnerFrameStyle,
  getEdgeStrength
};
