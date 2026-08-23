const { getInnerFrameStyle, getEdgeStrength } = require('./innerFrameStyles');
const { calculateImageRect, getLongEdge, scaleFrameWidth } = require('./frameGeometry');
const { drawImageWithInnerFrame } = require('./innerFrameRenderer');

/**
 * The only Canvas composition entry point used by preview and export.
 * It intentionally receives an already-loaded image so image loading remains
 * in the page/service adapter and this function stays deterministic.
 */
function renderComposite({
  ctx,
  outWidth,
  outHeight,
  image,
  imageId,
  imageSeed,
  layoutSettings = {},
  outerBackgroundSettings = {},
  innerFrameSettings = {}
}) {
  const width = Math.max(1, Number(outWidth) || 1);
  const height = Math.max(1, Number(outHeight) || 1);
  ctx.clearRect(0, 0, width, height);

  if (outerBackgroundSettings.enabled) {
    ctx.fillStyle = outerBackgroundSettings.color || '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#e5e5e5';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
  }

  if (!image) return { imageRect: null, frameWidth: 0, styleId: 'none' };
  const imageRect = calculateImageRect({
    outWidth: width,
    outHeight: height,
    imageWidth: image.width,
    imageHeight: image.height,
    zoom: layoutSettings.zoom,
    fit: layoutSettings.fit || 'contain',
    layoutPadding: layoutSettings.layoutPadding
  });

  const style = getInnerFrameStyle(innerFrameSettings.styleId);
  const enabled = innerFrameSettings.enabled !== false && style.id !== 'none';
  const longEdge = getLongEdge(width, height);
  const widthAt1800 = enabled
    ? (Number(innerFrameSettings.widthAt1800) || style.widthAt1800)
    : 0;
  const frameWidth = scaleFrameWidth(widthAt1800, longEdge);
  const strength = getEdgeStrength(innerFrameSettings.strengthLevel) * (Number(innerFrameSettings.strength) || 1);
  const frameColor = style.id === 'clean-black'
    ? (innerFrameSettings.color || style.color)
    : style.color;

  const paths = drawImageWithInnerFrame({
    ctx,
    image,
    photoRect: imageRect,
    frameWidth,
    styleId: enabled ? style.id : 'none',
    color: enabled ? frameColor : undefined,
    seed: imageSeed || imageId || 'default',
    strength,
    maskImages: innerFrameSettings.maskImages
  });

  return {
    imageRect,
    frameWidth,
    styleId: enabled ? style.id : 'none',
    paths
  };
}

module.exports = { renderComposite };
