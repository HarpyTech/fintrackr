/**
 * Chart scaling primitives.
 *
 * Pure functions with no React or DOM dependency, so they stay unit-testable
 * and can be reasoned about in isolation. Everything here exists to keep a
 * chart legible as the underlying dataset grows:
 *
 *   - niceScale      → Y axes derived from the actual data, on round numbers
 *   - labelInterval  → X axes that thin their labels instead of overlapping
 *   - topNWithOther  → bounded series for unbounded, free-text dimensions
 *   - rankSeriesKeys → stable top-N series for multi-series charts
 */

/**
 * Round a range to a "nice" number: 1, 2, 2.5, 5 or 10 × a power of ten.
 * Heckbert's algorithm (Graphics Gems, 1990).
 *
 * @param {number} range Positive magnitude to round.
 * @param {boolean} round Round to nearest (true) vs round up (false).
 */
export function niceNum(range, round) {
  if (!Number.isFinite(range) || range <= 0) return 1;

  const exponent = Math.floor(Math.log10(range));
  const fraction = range / 10 ** exponent;
  let niceFraction;

  if (round) {
    if (fraction < 1.5) niceFraction = 1;
    else if (fraction < 3) niceFraction = 2;
    else if (fraction < 7) niceFraction = 5;
    else niceFraction = 10;
  } else if (fraction <= 1) niceFraction = 1;
  else if (fraction <= 2) niceFraction = 2;
  else if (fraction <= 5) niceFraction = 5;
  else niceFraction = 10;

  return niceFraction * 10 ** exponent;
}

/**
 * Strip binary floating-point drift from a computed tick.
 * Without this, a step of 0.1 produces 0.30000000000000004.
 */
function cleanTick(value, step) {
  // Keep one more decimal place than the step itself requires.
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  return Number(value.toFixed(Math.min(decimals, 10)));
}

/**
 * Build a Y-axis domain and explicit tick list from the data's maximum.
 *
 * This is what keeps an axis "in sync with the data": rather than letting
 * Recharts invent ticks, the caller passes both `domain` and `ticks`, so the
 * top tick always sits just above the tallest bar and every tick is a round
 * number at any magnitude (₹50 or ₹15,00,000).
 *
 * @param {number} maxValue Largest value that must fit on the axis.
 * @param {{targetTicks?: number}} [options] Desired tick count (approximate).
 * @returns {{domain: [number, number], ticks: number[], step: number}}
 */
export function niceScale(maxValue, { targetTicks = 5 } = {}) {
  const rawMax = Number.isFinite(maxValue) ? maxValue : 0;

  // All-zero series are common here: daily_summary and monthly_summary
  // zero-fill every missing day/month, so an empty month arrives as a full
  // array of 0.0 rather than an empty one.
  if (rawMax <= 0) {
    return { domain: [0, 1], ticks: [0, 1], step: 1 };
  }

  const divisions = Math.max(1, targetTicks - 1);
  const step = niceNum(rawMax / divisions, true);
  const niceMax = Math.ceil(rawMax / step) * step;

  const ticks = [];
  // Guard the loop against a pathological step; += on floats can drift, so
  // the tick value is recomputed from the index each iteration.
  const count = Math.round(niceMax / step);
  for (let i = 0; i <= count; i += 1) {
    ticks.push(cleanTick(i * step, step));
  }

  return { domain: [0, cleanTick(niceMax, step)], ticks, step };
}

/**
 * Largest value a chart must accommodate.
 *
 * @param {object[]} rows Chart rows.
 * @param {string[]} keys Value keys to consider.
 * @param {{stacked?: boolean}} [options] When stacked, bars sum per row, so
 *   the axis must fit the row total rather than the largest single series.
 */
export function maxValueOf(rows, keys, { stacked = false } = {}) {
  if (!Array.isArray(rows) || rows.length === 0 || !keys?.length) return 0;

  let max = 0;
  for (const row of rows) {
    if (stacked) {
      let sum = 0;
      for (const key of keys) sum += Number(row?.[key] || 0);
      if (sum > max) max = sum;
    } else {
      for (const key of keys) {
        const value = Number(row?.[key] || 0);
        if (value > max) max = value;
      }
    }
  }
  return max;
}

/**
 * How many X-axis labels to skip so they stop overlapping.
 *
 * Recharts' `interval` is "labels to skip between rendered labels", so 0
 * renders every label. A 31-day month on a 320px screen needs interval 4-5.
 *
 * @param {number} pointCount Number of data points.
 * @param {number} maxLabels Most labels that fit legibly.
 * @returns {number} Value for the XAxis `interval` prop.
 */
export function labelInterval(pointCount, maxLabels) {
  if (!pointCount || !maxLabels || pointCount <= maxLabels) return 0;
  return Math.ceil(pointCount / maxLabels) - 1;
}

/** Shorten a label for a cramped axis or legend, with an ellipsis. */
export function truncateLabel(text, max = 14) {
  const value = String(text ?? '');
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

/**
 * Bound an unbounded series: keep the largest `limit` entries and fold the
 * remainder into a single "Other" bucket.
 *
 * `category` and `vendor` are free-text fields with no server-side cap, so a
 * donut would otherwise grow one slice per distinct value. The API already
 * sorts these summaries descending by total, but this re-sorts defensively
 * rather than trusting call-order.
 *
 * @param {object[]} items Source rows.
 * @param {{nameKey: string, valueKey?: string, limit?: number,
 *          otherLabel?: string}} options
 * @returns {{data: object[], otherCount: number, otherTotal: number}}
 */
export function topNWithOther(items, {
  nameKey,
  valueKey = 'total',
  limit = 7,
  otherLabel = 'Other',
} = {}) {
  const rows = Array.isArray(items) ? items : [];
  if (rows.length === 0) {
    return { data: [], otherCount: 0, otherTotal: 0 };
  }

  const sorted = [...rows].sort(
    (a, b) => Number(b?.[valueKey] || 0) - Number(a?.[valueKey] || 0),
  );

  // One row over the limit would be replaced by an "Other" slice representing
  // exactly itself, which is strictly worse. Only bucket when it actually
  // collapses two or more rows.
  if (sorted.length <= limit + 1) {
    return { data: sorted, otherCount: 0, otherTotal: 0 };
  }

  const head = sorted.slice(0, limit);
  const tail = sorted.slice(limit);
  const otherTotal = tail.reduce((sum, row) => sum + Number(row?.[valueKey] || 0), 0);

  return {
    data: [
      ...head,
      {
        [nameKey]: otherLabel,
        [valueKey]: Math.round(otherTotal * 100) / 100,
        __isOther: true,
      },
    ],
    otherCount: tail.length,
    otherTotal: Math.round(otherTotal * 100) / 100,
  };
}

/**
 * Rank multi-series keys by grand total and keep the top `limit`.
 *
 * Returned in a stable, total-ranked order so a series keeps its colour when
 * the month filter changes — deriving series order from row insertion order
 * instead makes the whole chart repaint on every filter change.
 *
 * @param {object[]} rows Pivoted rows (one per X value).
 * @param {string[]} keys Candidate series keys.
 * @param {number} limit Maximum series to keep.
 * @returns {{keys: string[], overflow: string[]}}
 */
export function rankSeriesKeys(rows, keys, limit) {
  if (!keys?.length) return { keys: [], overflow: [] };

  const totals = new Map(keys.map((key) => [key, 0]));
  for (const row of rows || []) {
    for (const key of keys) {
      totals.set(key, totals.get(key) + Number(row?.[key] || 0));
    }
  }

  const ranked = [...keys].sort((a, b) => {
    const diff = totals.get(b) - totals.get(a);
    // Alphabetical tie-break keeps the order deterministic across renders.
    return diff !== 0 ? diff : String(a).localeCompare(String(b));
  });

  if (ranked.length <= limit + 1) {
    return { keys: ranked, overflow: [] };
  }

  return { keys: ranked.slice(0, limit), overflow: ranked.slice(limit) };
}
