const BASE_LONG_EDGE = 1800;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getLongEdge(width, height) {
  return Math.max(1, width || 0, height || 0);
}

function scaleFrameWidth(widthAt1800, currentLongEdge) {
  const width = Math.max(0, Number(widthAt1800) || 0);
  const longEdge = getLongEdge(currentLongEdge, currentLongEdge);
  return width * longEdge / BASE_LONG_EDGE;
}

function calculateImageRect({
  outWidth,
  outHeight,
  imageWidth,
  imageHeight,
  zoom = 0.95,
  fit = 'contain',
  layoutPadding = 18
}) {
  const width = Math.max(1, Number(outWidth) || 1);
  const height = Math.max(1, Number(outHeight) || 1);
  const sourceWidth = Math.max(1, Number(imageWidth) || 1);
  const sourceHeight = Math.max(1, Number(imageHeight) || 1);
  const padding = Math.max(0, Number(layoutPadding) || 0);
  const availableWidth = Math.max(1, width - padding * 2);
  const availableHeight = Math.max(1, height - padding * 2);
  const baseScale = fit === 'cover'
    ? Math.max(availableWidth / sourceWidth, availableHeight / sourceHeight)
    : Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight);
  const scale = baseScale * clamp(Number(zoom) || 1, 0.3, 2);
  const drawWidth = Math.max(1, sourceWidth * scale);
  const drawHeight = Math.max(1, sourceHeight * scale);

  return {
    x: (width - drawWidth) / 2,
    y: (height - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
    scale,
    sourceWidth,
    sourceHeight
  };
}

/**
 * Calculates a cover draw rect for a fixed aperture. Unlike calculateImageRect
 * this never changes the aperture itself: zoom only changes the photo content
 * that is clipped inside it. It keeps structured film frames stable while a
 * user adjusts the crop of an individual photo.
 */
function calculateApertureImageRect({ apertureRect, imageWidth, imageHeight, zoom = 1 }) {
  const aperture = apertureRect || {};
  const width = Math.max(1, Number(aperture.width) || 1);
  const height = Math.max(1, Number(aperture.height) || 1);
  const sourceWidth = Math.max(1, Number(imageWidth) || 1);
  const sourceHeight = Math.max(1, Number(imageHeight) || 1);
  const baseScale = Math.max(width / sourceWidth, height / sourceHeight);
  const scale = baseScale * clamp(Number(zoom) || 1, 0.5, 2);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  return {
    x: (Number(aperture.x) || 0) + (width - drawWidth) / 2,
    y: (Number(aperture.y) || 0) + (height - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
    scale,
    sourceWidth,
    sourceHeight
  };
}

function getFrameRect(photoRect, frameWidth) {
  const width = Math.max(0, Number(frameWidth) || 0);
  return {
    x: photoRect.x - width,
    y: photoRect.y - width,
    width: photoRect.width + width * 2,
    height: photoRect.height + width * 2
  };
}

module.exports = {
  BASE_LONG_EDGE,
  clamp,
  getLongEdge,
  scaleFrameWidth,
  calculateImageRect,
  calculateApertureImageRect,
  getFrameRect
};
