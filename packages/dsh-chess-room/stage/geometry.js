/**
 * Board-local stage geometry, independently authored for dsh-chess-room.
 * Design review: @linxin666/dsh-pet v0.4.14 (Apache-2.0),
 * src/client/spritesheet.ts and PetSprite.tsx. No upstream code copied here;
 * unlike its viewport CSS-inset controller, this module uses local top-lefts.
 * No DOM access: pass bounding-client rectangles and unscaled root client size.
 */
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const clamp = (n, lo, hi) => Math.min(Math.max(finite(n, lo), lo), Math.max(lo, hi));

function rect(value) {
  if (!value) return null;
  const left = finite(value.left, finite(value.x));
  const top = finite(value.top, finite(value.y));
  const width = Math.max(0, finite(value.width, finite(value.right, left) - left));
  const height = Math.max(0, finite(value.height, finite(value.bottom, top) - top));
  return { x: left, y: top, left, top, width, height, right: left + width, bottom: top + height };
}
function intersection(a, b) {
  const left = Math.max(a.left, b.left), top = Math.max(a.top, b.top);
  const right = Math.max(left, Math.min(a.right, b.right));
  const bottom = Math.max(top, Math.min(a.bottom, b.bottom));
  return rect({ left, top, width: right - left, height: bottom - top });
}
function pointIn(bounds, point) {
  return { x: clamp(point.x, bounds.left, bounds.right), y: clamp(point.y, bounds.top, bounds.bottom) };
}
function fitsActor(bounds, size, point) {
  return point.x >= bounds.left && point.y >= bounds.top
    && point.x + size.width <= bounds.right && point.y + size.height <= bounds.bottom;
}
function overlapActor(point, size, obstacle) {
  return obstacle && point.x < obstacle.right && point.x + size.width > obstacle.left
    && point.y < obstacle.bottom && point.y + size.height > obstacle.top;
}

// Only emit resting points in bands that can actually fit the whole actor.
// The bottom band takes priority when the left band is too narrow (mobile).
function peripheralPoints(geometry) {
  const { bounds: b, board, actorSize: s } = geometry;
  if (!board || !overlapActor({ x: b.left, y: b.top }, { width: b.width, height: b.height }, board)) {
    return [clampActor(geometry, { x: b.left, y: b.maxY }),
      clampActor(geometry, { x: b.maxX, y: b.maxY }),
      clampActor(geometry, { x: b.maxX, y: b.top }), { x: b.left, y: b.top }];
  }
  const free = { left: board.left - b.left - s.width,
    right: b.right - board.right - s.width,
    bottom: b.bottom - board.bottom - s.height,
    top: board.top - b.top - s.height };
  const available = Object.fromEntries(Object.entries(free).map(([side, space]) => [side, space >= 0]));
  const gap = side => Math.min(12, Math.max(0, free[side]));
  const xL = available.left ? board.left - s.width - gap('left') : b.left;
  const xR = available.right ? board.right + gap('right') : b.maxX;
  const yB = available.bottom ? board.bottom + gap('bottom') : b.maxY;
  const yT = available.top ? board.top - s.height - gap('top') : b.top;
  const nodes = [{ x: xL, y: yB }, { x: xR, y: yB }, { x: xR, y: yT }, { x: xL, y: yT }];
  if (Object.values(available).every(Boolean)) return nodes;
  // A closed walk in the available-band graph, not diagonal corner shortcuts.
  // Missing bands are impassable; disconnected opposite sides are not joined.
  const edges = [[0, 1, 'bottom'], [1, 2, 'right'], [2, 3, 'top'], [3, 0, 'left']];
  const first = available.left ? 0 : available.bottom ? 0 : available.right ? 1 : available.top ? 2 : -1;
  if (first === -1) return [];
  const route = [first], visited = new Set([first]);
  const walk = node => {
    for (const [a, c, side] of edges) {
      const next = a === node ? c : c === node ? a : -1;
      if (next < 0 || !available[side] || visited.has(next)) continue;
      visited.add(next); route.push(next); walk(next); route.push(node);
    }
  };
  walk(first); if (route.length > 1) route.pop();
  return route.map(index => nodes[index]);
}

function avatarApproach(geometry) {
  const { bounds, actorSize: size, avatarBounds: target, avatarTarget: aim } = geometry;
  if (!target) return { ...geometry.home, side: 'restpoint' };
  const palmY = clamp(aim.y - size.height * .676, bounds.top, bounds.maxY);
  const palmX = clamp(aim.x - size.width * .545, bounds.left, bounds.maxX);
  const candidates = [
    { x: target.left - size.width - 8, y: palmY, side: 'left' },
    { x: target.right + 8, y: palmY, side: 'right' },
    { x: palmX, y: target.bottom + 8, side: 'bottom' },
    { x: palmX, y: target.top - size.height - 8, side: 'top' },
  ];
  return candidates.find(point => fitsActor(bounds, size, point) && !overlapActor(point, size, target))
    ?? { ...geometry.home, side: 'restpoint' };
}

/**
 * boardRect is the actual 15x15 CSS grid, NOT its frame/coordinate labels.
 * Rectangles are viewport pixels. rootSize and actorSize are local CSS pixels.
 * bounds is the root ∩ room ∩ viewport, converted using independent X/Y scales.
 * home/perimeter are actor TOP-LEFTs; avatarTarget is a local aim POINT.
 */
export function measureGeometry({ rootRect, rootSize, boardRect, avatarRect, cardRect,
  roomRect, viewportRect, actorSize = { width: 96, height: 96 } } = {}) {
  const root = rect(rootRect) ?? rect({ width: 0, height: 0 });
  const width = Math.max(0, finite(rootSize?.width, finite(rootSize?.clientWidth, root.width)));
  const height = Math.max(0, finite(rootSize?.height, finite(rootSize?.clientHeight, root.height)));
  const scaleX = root.width > 0 && width > 0 ? root.width / width : 1;
  const scaleY = root.height > 0 && height > 0 ? root.height / height : 1;
  const localRect = value => {
    const r = rect(value);
    return r ? rect({ left: (r.left - root.left) / scaleX, top: (r.top - root.top) / scaleY,
      width: r.width / scaleX, height: r.height / scaleY }) : null;
  };
  const localRoot = rect({ width, height });
  let bounds = intersection(localRoot, localRect(roomRect) ?? localRoot);
  bounds = intersection(bounds, localRect(viewportRect) ?? localRoot);
  // A disjoint viewport must not put the empty rest point outside the root.
  bounds = rect({ left: clamp(bounds.left, 0, width), top: clamp(bounds.top, 0, height),
    width: Math.min(bounds.width, Math.max(0, width - bounds.left)),
    height: Math.min(bounds.height, Math.max(0, height - bounds.top)) });
  const desiredWidth = Math.max(1, finite(actorSize?.width, 96));
  const desiredHeight = Math.max(1, finite(actorSize?.height, 96));
  const fit = Math.min(1, bounds.width / desiredWidth, bounds.height / desiredHeight);
  const size = { width: desiredWidth * fit, height: desiredHeight * fit };
  Object.assign(bounds, { minX: bounds.left, minY: bounds.top,
    maxX: Math.max(bounds.left, bounds.right - size.width),
    maxY: Math.max(bounds.top, bounds.bottom - size.height) });
  const board = localRect(boardRect);
  const geometry = { root: localRoot, bounds, board, actorSize: size,
    scale: { x: scaleX, y: scaleY }, visible: bounds.width > 0 && bounds.height > 0,
    home: { x: bounds.left, y: bounds.maxY }, perimeter: [], avatarTarget: null,
    avatarBounds: null, avatarApproach: null };
  geometry.perimeter = peripheralPoints(geometry);
  geometry.home = geometry.perimeter[0] ?? clampActor(geometry, geometry.home);
  // When the board fills the visible root, no non-overlapping rest point exists.
  if (!geometry.perimeter.length) geometry.perimeter = [geometry.home];
  for (const [source, candidate] of [['avatar', avatarRect], ['card', cardRect]]) {
    const local = localRect(candidate);
    const visible = local && intersection(bounds, local);
    if (visible?.width > 0 && visible?.height > 0) {
      geometry.avatarBounds = local;
      geometry.avatarTarget = { x: visible.left + visible.width / 2,
        y: visible.top + visible.height / 2, source };
      break;
    }
  }
  geometry.avatarTarget ??= { ...pointIn(bounds, { x: geometry.home.x + size.width * .545,
    y: geometry.home.y + size.height * .676 }), source: 'restpoint' };
  geometry.avatarApproach = avatarApproach(geometry);
  return geometry;
}

/** Local cell center; displayed row 14 is the first/top row. Invalid cells return null. */
export function boardPoint(geometry, row, col) {
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row > 14 || col < 0 || col > 14)
    return null;
  const b = geometry?.board;
  if (!b || b.width <= 0 || b.height <= 0) return null;
  return { x: b.left + (col + .5) * b.width / 15,
    y: b.top + (14 - row + .5) * b.height / 15 };
}

/** Clamp the entire actor rectangle, not just its center or feet. */
export function clampActor(geometry, point = {}) {
  const b = geometry.bounds, size = geometry.actorSize;
  return { x: clamp(point.x, b.left, b.right - size.width),
    y: clamp(point.y, b.top, b.bottom - size.height) };
}

/** Local bubble rectangle, above actor when possible, otherwise below/inside visible room. */
export function bubblePosition(geometry, actor, bubbleSize = { width: 190, height: 68 }) {
  const b = geometry.bounds;
  const width = Math.min(b.width, Math.max(0, finite(bubbleSize.width, 190)));
  const height = Math.min(b.height, Math.max(0, finite(bubbleSize.height, 68)));
  const a = clampActor(geometry, actor);
  const above = a.y - height - 8;
  const placement = above >= b.top ? 'above' : 'below';
  return { x: clamp(a.x + geometry.actorSize.width / 2 - width / 2, b.left, b.right - width),
    y: clamp(placement === 'above' ? above : a.y + geometry.actorSize.height + 8, b.top, b.bottom - height),
    width, height, placement };
}
