/**
 * Data-only definitions for the inner film frame styles.
 * Rendering code should depend on these values, not on page-specific labels.
 */
const INNER_FRAME_STYLES = Object.freeze([
  {
    id: 'none',
    name: '无内框',
    renderer: 'none',
    color: 'transparent',
    widthAt1800: 0,
    edgeStrength: 0,
    fragmentDensity: 0
  },
  {
    id: 'clean-black',
    name: '经典细黑边',
    renderer: 'clean',
    color: '#050505',
    widthAt1800: 8,
    edgeStrength: 0,
    fragmentDensity: 0
  },
  {
    id: 'darkroom-scan',
    name: '暗房扫描边',
    renderer: 'irregular',
    color: '#050505',
    widthAt1800: 12,
    edgeStrength: 0.18,
    fragmentDensity: 0
  },
  {
    id: 'rough-emulsion',
    name: '粗粝显影边',
    renderer: 'irregular',
    color: '#030303',
    widthAt1800: 16,
    edgeStrength: 0.42,
    fragmentDensity: 0.15
  }
]);

const EDGE_STRENGTHS = Object.freeze([
  { id: 'light', name: '轻', value: 0.65 },
  { id: 'medium', name: '中', value: 1 },
  { id: 'strong', name: '重', value: 1.25 }
]);

function getInnerFrameStyle(id) {
  return INNER_FRAME_STYLES.find(style => style.id === id) || INNER_FRAME_STYLES[1];
}

function getEdgeStrength(level) {
  const item = EDGE_STRENGTHS.find(option => option.id === level);
  return item ? item.value : 1;
}

module.exports = {
  INNER_FRAME_STYLES,
  EDGE_STRENGTHS,
  getInnerFrameStyle,
  getEdgeStrength
};
