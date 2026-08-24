const { getInnerFrameStyle, getEdgeStrength } = require('./innerFrameStyles');
const { calculateImageRect, getLongEdge, scaleFrameWidth } = require('./frameGeometry');
const { drawImageWithInnerFrame } = require('./innerFrameRenderer');
const { layoutInnerFrame } = require('./innerFrameLayout');

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
  const style = getInnerFrameStyle(innerFrameSettings.styleId);
  const enabled = innerFrameSettings.enabled !== false && style.id !== 'none';
  if (enabled && style.layoutModel === 'film-rebate') {
    const layout = layoutInnerFrame({
      outputRect: { x: 0, y: 0, width, height },
      outerLayout: {
        padding: layoutSettings.layoutPadding == null ? 18 : layoutSettings.layoutPadding,
        zoom: layoutSettings.zoom == null ? 1 : layoutSettings.zoom
      },
      imageAspect: image.width / Math.max(1, image.height),
      style,
      frameSizePreset: innerFrameSettings.frameSizePreset || 'standard',
      orientation: image.width < image.height ? 'portrait' : 'landscape'
    });
    const filmPaths = drawImageWithInnerFrame({
      ctx,
      image,
      styleId: style.id,
      style,
      layout,
      color: style.color,
      backgroundColor: outerBackgroundSettings.enabled ? outerBackgroundSettings.color : 'transparent',
      imageZoom: innerFrameSettings.imageZoom || 1,
      framePerforationsEnabled: innerFrameSettings.perforationsEnabled !== false,
      frameEdgeLabelEnabled: innerFrameSettings.edgeLabelEnabled !== false,
      frameNumberEnabled: innerFrameSettings.frameNumberEnabled !== false,
      frameMarkersEnabled: innerFrameSettings.markersEnabled !== false,
      frameIndex: innerFrameSettings.frameIndex || 1
    });
    return {
      imageRect: layout.apertureRect,
      frameWidth: 0,
      styleId: style.id,
      innerAvailableRect: layout.innerAvailableRect,
      frameRect: layout.frameRect,
      apertureRect: layout.apertureRect,
      decorationRects: layout.decorationRects,
      imageDrawRect: filmPaths && filmPaths.imageDrawRect,
      paths: filmPaths
    };
  }

  const imageRect = calculateImageRect({
    outWidth: width,
    outHeight: height,
    imageWidth: image.width,
    imageHeight: image.height,
    zoom: (Number(layoutSettings.zoom) || 1) * (Number(innerFrameSettings.imageZoom) || 1),
    fit: layoutSettings.fit || 'contain',
    layoutPadding: layoutSettings.layoutPadding
  });

  const longEdge = getLongEdge(width, height);
  const widthAt1800 = enabled
    ? (Number(innerFrameSettings.widthAt1800) || style.widthAt1800)
    : 0;
  const frameWidth = scaleFrameWidth(widthAt1800, longEdge);
  const strengthLevel = innerFrameSettings.strengthLevel || 'medium';
  const strength = getEdgeStrength(strengthLevel) * (Number(innerFrameSettings.strength) || 1);
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
    strengthLevel,
    maskImages: innerFrameSettings.maskImages,
    backgroundColor: outerBackgroundSettings.enabled ? outerBackgroundSettings.color : 'transparent'
  });

  return {
    imageRect,
    frameWidth,
    styleId: enabled ? style.id : 'none',
    paths
  };
}

module.exports = { renderComposite };
