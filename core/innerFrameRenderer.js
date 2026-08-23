const { getInnerFrameStyle } = require('./innerFrameStyles');
const { clamp, getFrameRect } = require('./frameGeometry');

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

function generateNormalizedEdgeProfile({
  styleId = 'clean-black',
  seed = 'default',
  strength = 1,
  pointCount = 32
} = {}) {
  const style = getInnerFrameStyle(styleId);
  const count = Math.max(8, Math.min(64, Math.floor(pointCount)));
  const effectiveStrength = clamp(Number(strength) || 0, 0, 1.5);
  const random = createSeededRandom(`${seed}:${style.id}`);

  function createSide(sideIndex) {
    if (style.renderer !== 'irregular' || style.edgeStrength <= 0) {
      return Array.from({ length: count }, (_, index) => ({
        t: index / (count - 1),
        value: 0
      }));
    }

    const anchors = 7;
    const anchorValues = Array.from({ length: anchors }, () => random() * 2 - 1);
    const sideBias = (sideIndex - 1.5) * 0.04;
    return Array.from({ length: count }, (_, index) => {
      const t = index / (count - 1);
      const scaled = t * (anchors - 1);
      const left = Math.min(anchors - 2, Math.floor(scaled));
      const ratio = scaled - left;
      const lowFrequency = interpolate(anchorValues[left], anchorValues[left + 1], ratio);
      const highFrequency = style.fragmentDensity > 0 ? (random() * 2 - 1) * 0.16 : 0;
      const value = clamp(
        (lowFrequency * 0.82 + highFrequency + sideBias) * style.edgeStrength * effectiveStrength,
        -1,
        1
      );
      return { t, value };
    });
  }

  return {
    top: createSide(0),
    right: createSide(1),
    bottom: createSide(2),
    left: createSide(3)
  };
}

function edgeValue(profile, side, index) {
  const points = profile[side];
  return points[index] ? points[index].value : 0;
}

function buildFramePaths({
  photoRect,
  frameWidth,
  styleId = 'clean-black',
  seed = 'default',
  strength = 1,
  pointCount = 32
} = {}) {
  const width = Math.max(0, Number(frameWidth) || 0);
  const style = getInnerFrameStyle(styleId);
  if (style.id === 'none' || width <= 0) return null;

  const profile = generateNormalizedEdgeProfile({ styleId, seed, strength, pointCount });
  const outerVariation = width * (0.25 + style.edgeStrength * 0.8);
  const innerVariation = Math.min(width * 0.28, outerVariation * 0.3);
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

  return {
    outer,
    inner,
    profile,
    frameRect: getFrameRect(photoRect, width),
    outerVariation,
    innerVariation
  };
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function traceSmoothPath(ctx, points) {
  if (!points || points.length < 3) return;
  const firstMid = midpoint(points[points.length - 1], points[0]);
  ctx.beginPath();
  ctx.moveTo(firstMid.x, firstMid.y);
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const nextMid = midpoint(current, next);
    ctx.quadraticCurveTo(current.x, current.y, nextMid.x, nextMid.y);
  }
  ctx.closePath();
}

function drawImageWithInnerFrame({
  ctx,
  image,
  photoRect,
  frameWidth,
  styleId = 'clean-black',
  color,
  seed = 'default',
  strength = 1
}) {
  const style = getInnerFrameStyle(styleId);
  if (style.id === 'none' || frameWidth <= 0) {
    ctx.drawImage(image, photoRect.x, photoRect.y, photoRect.width, photoRect.height);
    return null;
  }

  const paths = buildFramePaths({ photoRect, frameWidth, styleId, seed, strength });
  ctx.save();
  traceSmoothPath(ctx, paths.outer);
  ctx.fillStyle = color || style.color;
  ctx.fill();
  ctx.restore();

  ctx.save();
  traceSmoothPath(ctx, paths.inner);
  ctx.clip();
  ctx.drawImage(image, photoRect.x, photoRect.y, photoRect.width, photoRect.height);
  ctx.restore();

  if (style.fragmentDensity > 0) {
    drawFragments(ctx, paths, seed, color || style.color, style.fragmentDensity);
  }
  return paths;
}

function drawFragments(ctx, paths, seed, color, density) {
  const random = createSeededRandom(`${seed}:fragments`);
  const count = Math.max(2, Math.round(density * 48));
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < count; i += 1) {
    const start = Math.floor(random() * paths.outer.length);
    const point = paths.outer[start];
    const next = paths.outer[(start + 1) % paths.outer.length];
    const size = 0.3 + random() * 1.2;
    const dx = next.x - point.x;
    const dy = next.y - point.y;
    const length = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    const nx = -dy / length;
    const ny = dx / length;
    const along = random();
    const x = point.x + dx * along;
    const y = point.y + dy * along;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + nx * size, y + ny * size);
    ctx.lineTo(x + nx * size * 0.3 + dx / length * size, y + ny * size * 0.3 + dy / length * size);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

module.exports = {
  hashSeed,
  createSeededRandom,
  generateNormalizedEdgeProfile,
  buildFramePaths,
  traceSmoothPath,
  drawImageWithInnerFrame
};
