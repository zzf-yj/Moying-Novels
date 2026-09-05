// On fractional-DPI displays (e.g. 150%) DIP bounds map to fractional physical pixels and
// Chromium rounds every edge independently, so the on-screen size wobbles ±1px whenever the
// position changes — each drag frame then forces a full content reflow. Constraining every
// edge to the smallest DIP step that lands on whole physical pixels keeps the geometry exact.
export function dipStep(scale: number): number {
  for (let q = 1; q <= 8; q++) if (Number.isInteger(q * scale)) return q
  return 1
}

export function snapDown(value: number, step: number): number {
  return Math.floor(value / step) * step
}

export function snapNearest(value: number, step: number): number {
  return Math.round(value / step) * step
}

export function snapUp(value: number, step: number): number {
  return Math.ceil(value / step) * step
}
