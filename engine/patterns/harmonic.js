// ============================================================================
// ENGINE: HARMONIC PATTERN DETECTOR — 11 padrões de Fibonacci
// Fonte: Scott Carney, Larry Pesavento
// ============================================================================

/**
 * Find swing points for harmonic pattern detection
 * Returns array of { idx, price, type: 'high'|'low' }
 */
function findHarmonicSwings(data, lookLeft = 3, lookRight = 3) {
  const swings = [];
  for (let i = lookLeft; i < data.length - lookRight; i++) {
    let isHigh = true, isLow = true;
    for (let j = i - lookLeft; j <= i + lookRight; j++) {
      if (j === i) continue;
      if (data[j].h >= data[i].h) isHigh = false;
      if (data[j].l <= data[i].l) isLow = false;
    }
    if (isHigh) swings.push({ idx: i, price: data[i].h, type: 'high' });
    if (isLow) swings.push({ idx: i, price: data[i].l, type: 'low' });
  }
  swings.sort((a, b) => a.idx - b.idx);
  return swings;
}

/**
 * Extract 5-point patterns (XABCD) from swing sequence
 * X->A is first leg, A->B retracement, B->C continuation, C->D final leg
 */
function extractXABCD(swings, endIdx) {
  // Get last 5 swing points before endIdx
  const relevant = swings.filter(s => s.idx <= endIdx).slice(-6);
  if (relevant.length < 5) return null;

  const x = relevant[relevant.length - 5];
  const a = relevant[relevant.length - 4];
  const b = relevant[relevant.length - 3];
  const c = relevant[relevant.length - 2];
  const d = relevant[relevant.length - 1];

  // Must alternate high/low
  if (x.type === a.type || a.type === b.type || b.type === c.type || c.type === d.type) return null;

  const xa = Math.abs(a.price - x.price);
  const ab = Math.abs(b.price - a.price);
  const bc = Math.abs(c.price - b.price);
  const cd = Math.abs(d.price - c.price);
  const ad = Math.abs(d.price - x.price);

  if (xa === 0 || ab === 0 || bc === 0) return null;

  const abRetrace = ab / xa;
  const bcRetrace = bc / ab;
  const cdExt = cd / bc;
  const xadExt = ad / xa;

  return { x, a, b, c, d, xa, ab, bc, cd, ad, abRetrace, bcRetrace, cdExt, xadExt };
}

function inRange(val, min, max) { return val >= min && val <= max; }

/**
 * Gartley: XA 0.618, AB ret 0.618, BC ext 1.272-1.618
 */
function detectGartley(data, idx) {
  const swings = findHarmonicSwings(data.slice(0, idx + 1), 3, 3);
  const xp = extractXABCD(swings, idx);
  if (!xp) return null;

  const bullish = xp.x.type === 'high';
  if (bullish) {
    if (inRange(xp.abRetrace, 0.618, 0.618, 0.03) &&
        inRange(xp.bcRetrace, 0.382, 0.886, 0.05) &&
        inRange(xp.cdExt, 1.272, 1.618, 0.05) &&
        inRange(xp.xadExt, 0.786, 0.786, 0.03))
      return { type: 'Gartley_Bullish', direction: 'bullish', strength: 4, entry: xp.d.price };
  } else {
    if (inRange(xp.abRetrace, 0.618, 0.618, 0.03) &&
        inRange(xp.bcRetrace, 0.382, 0.886, 0.05) &&
        inRange(xp.cdExt, 1.272, 1.618, 0.05) &&
        inRange(xp.xadExt, 0.786, 0.786, 0.03))
      return { type: 'Gartley_Bearish', direction: 'bearish', strength: 4, entry: xp.d.price };
  }
  return null;
}

function detectBat(data, idx) {
  const swings = findHarmonicSwings(data.slice(0, idx + 1), 3, 3);
  const xp = extractXABCD(swings, idx);
  if (!xp) return null;

  const bullish = xp.x.type === 'high';
  if (bullish) {
    if (inRange(xp.abRetrace, 0.382, 0.50, 0.03) &&
        inRange(xp.bcRetrace, 0.382, 0.886, 0.05) &&
        inRange(xp.cdExt, 1.618, 2.618, 0.05) &&
        inRange(xp.xadExt, 0.886, 0.886, 0.03))
      return { type: 'Bat_Bullish', direction: 'bullish', strength: 4, entry: xp.d.price };
  } else {
    if (inRange(xp.abRetrace, 0.382, 0.50, 0.03) &&
        inRange(xp.bcRetrace, 0.382, 0.886, 0.05) &&
        inRange(xp.cdExt, 1.618, 2.618, 0.05) &&
        inRange(xp.xadExt, 0.886, 0.886, 0.03))
      return { type: 'Bat_Bearish', direction: 'bearish', strength: 4, entry: xp.d.price };
  }
  return null;
}

function detectButterfly(data, idx) {
  const swings = findHarmonicSwings(data.slice(0, idx + 1), 3, 3);
  const xp = extractXABCD(swings, idx);
  if (!xp) return null;

  const bullish = xp.x.type === 'high';
  if (bullish) {
    if (inRange(xp.abRetrace, 0.786, 0.786, 0.03) &&
        inRange(xp.bcRetrace, 0.382, 0.886, 0.05) &&
        inRange(xp.cdExt, 1.618, 2.24, 0.08) &&
        inRange(xp.xadExt, 1.27, 1.27, 0.03))
      return { type: 'Butterfly_Bullish', direction: 'bullish', strength: 4, entry: xp.d.price };
  } else {
    if (inRange(xp.abRetrace, 0.786, 0.786, 0.03) &&
        inRange(xp.bcRetrace, 0.382, 0.886, 0.05) &&
        inRange(xp.cdExt, 1.618, 2.24, 0.08) &&
        inRange(xp.xadExt, 1.27, 1.27, 0.03))
      return { type: 'Butterfly_Bearish', direction: 'bearish', strength: 4, entry: xp.d.price };
  }
  return null;
}

function detectCrab(data, idx) {
  const swings = findHarmonicSwings(data.slice(0, idx + 1), 3, 3);
  const xp = extractXABCD(swings, idx);
  if (!xp) return null;

  const bullish = xp.x.type === 'high';
  if (bullish) {
    if (inRange(xp.abRetrace, 0.382, 0.618, 0.03) &&
        inRange(xp.bcRetrace, 0.382, 0.886, 0.05) &&
        inRange(xp.cdExt, 2.618, 3.618, 0.08) &&
        inRange(xp.xadExt, 1.618, 1.618, 0.03))
      return { type: 'Crab_Bullish', direction: 'bullish', strength: 4, entry: xp.d.price };
  } else {
    if (inRange(xp.abRetrace, 0.382, 0.618, 0.03) &&
        inRange(xp.bcRetrace, 0.382, 0.886, 0.05) &&
        inRange(xp.cdExt, 2.618, 3.618, 0.08) &&
        inRange(xp.xadExt, 1.618, 1.618, 0.03))
      return { type: 'Crab_Bearish', direction: 'bearish', strength: 4, entry: xp.d.price };
  }
  return null;
}

function detectDeepCrab(data, idx) {
  const swings = findHarmonicSwings(data.slice(0, idx + 1), 3, 3);
  const xp = extractXABCD(swings, idx);
  if (!xp) return null;

  const bullish = xp.x.type === 'high';
  if (bullish) {
    if (inRange(xp.abRetrace, 0.886, 0.886, 0.03) &&
        inRange(xp.bcRetrace, 0.382, 0.886, 0.05) &&
        inRange(xp.cdExt, 2.618, 3.618, 0.08) &&
        inRange(xp.xadExt, 1.618, 1.618, 0.03))
      return { type: 'Deep_Crab_Bullish', direction: 'bullish', strength: 5, entry: xp.d.price };
  } else {
    if (inRange(xp.abRetrace, 0.886, 0.886, 0.03) &&
        inRange(xp.bcRetrace, 0.382, 0.886, 0.05) &&
        inRange(xp.cdExt, 2.618, 3.618, 0.08) &&
        inRange(xp.xadExt, 1.618, 1.618, 0.03))
      return { type: 'Deep_Crab_Bearish', direction: 'bearish', strength: 5, entry: xp.d.price };
  }
  return null;
}

function detectShark(data, idx) {
  const swings = findHarmonicSwings(data.slice(0, idx + 1), 3, 3);
  const xp = extractXABCD(swings, idx);
  if (!xp) return null;

  const bullish = xp.x.type === 'high';
  if (bullish) {
    if (inRange(xp.abRetrace, 0.886, 1.13, 0.05) &&
        inRange(xp.bcRetrace, 1.13, 1.618, 0.08) &&
        inRange(xp.cdExt, 0.886, 1.13, 0.05))
      return { type: 'Shark_Bullish', direction: 'bullish', strength: 4, entry: xp.d.price };
  } else {
    if (inRange(xp.abRetrace, 0.886, 1.13, 0.05) &&
        inRange(xp.bcRetrace, 1.13, 1.618, 0.08) &&
        inRange(xp.cdExt, 0.886, 1.13, 0.05))
      return { type: 'Shark_Bearish', direction: 'bearish', strength: 4, entry: xp.d.price };
  }
  return null;
}

function detectCypher(data, idx) {
  const swings = findHarmonicSwings(data.slice(0, idx + 1), 3, 3);
  const xp = extractXABCD(swings, idx);
  if (!xp) return null;

  const bullish = xp.x.type === 'high';
  if (bullish) {
    if (inRange(xp.abRetrace, 0.382, 0.618, 0.03) &&
        inRange(xp.bcRetrace, 1.13, 1.414, 0.08) &&
        inRange(xp.cdExt, 0.786, 0.786, 0.05))
      return { type: 'Cypher_Bullish', direction: 'bullish', strength: 4, entry: xp.d.price };
  } else {
    if (inRange(xp.abRetrace, 0.382, 0.618, 0.03) &&
        inRange(xp.bcRetrace, 1.13, 1.414, 0.08) &&
        inRange(xp.cdExt, 0.786, 0.786, 0.05))
      return { type: 'Cypher_Bearish', direction: 'bearish', strength: 4, entry: xp.d.price };
  }
  return null;
}

function detectAB_CD(data, idx) {
  const swings = findHarmonicSwings(data.slice(0, idx + 1), 2, 2);
  if (swings.length < 4) return null;

  // Simple AB=CD: 3 swings where CD ≈ AB
  const a = swings[swings.length - 4];
  const b = swings[swings.length - 3];
  const c = swings[swings.length - 2];
  const d = swings[swings.length - 1];
  if (!a || !b || !c || !d) return null;

  const ab = Math.abs(b.price - a.price);
  const cd = Math.abs(d.price - c.price);
  if (ab === 0) return null;

  const ratio = cd / ab;
  if (inRange(ratio, 0.618, 1.618, 0.05)) {
    const bullish = d.type === 'low';
    return { type: 'AB_CD_' + (bullish ? 'Bullish' : 'Bearish'), direction: bullish ? 'bullish' : 'bearish', strength: 3, entry: d.price };
  }
  return null;
}

function detectThreeDrives(data, idx) {
  const swings = findHarmonicSwings(data.slice(0, idx + 1), 3, 3);
  if (swings.length < 6) return null;

  // Three drives: 3 pushes in same direction, each at 1.13 or 1.27 extension
  const d1 = swings[swings.length - 6];
  const d2 = swings[swings.length - 4];
  const d3 = swings[swings.length - 2];
  if (!d1 || !d2 || !d3) return null;
  if (d1.type !== d2.type || d2.type !== d3.type) return null;

  const leg1 = Math.abs(d1.price - swings[swings.length - 5].price);
  const leg2 = Math.abs(d2.price - swings[swings.length - 3].price);
  if (leg1 === 0) return null;

  const ratio = leg2 / leg1;
  if (inRange(ratio, 1.13, 1.27, 0.05)) {
    const bullish = d3.type === 'low';
    return { type: 'Three_Drives_' + (bullish ? 'Bullish' : 'Bearish'), direction: bullish ? 'bullish' : 'bearish', strength: 4, entry: d3.price };
  }
  return null;
}

function detect5_0(data, idx) {
  const swings = findHarmonicSwings(data.slice(0, idx + 1), 3, 3);
  const xp = extractXABCD(swings, idx);
  if (!xp) return null;

  // 5-0: BC is 1.618-2.24 of AB, and CD retraces 50% of BC
  if (inRange(xp.bcRetrace, 1.618, 2.24, 0.08) && inRange(xp.cdExt, 0.50, 0.50, 0.05)) {
    const bullish = xp.b.type === 'low';
    return { type: '5_0_' + (bullish ? 'Bullish' : 'Bearish'), direction: bullish ? 'bullish' : 'bearish', strength: 3, entry: xp.d.price };
  }
  return null;
}

// ==============================
// MASTER DETECTOR
// ==============================
function detectAllHarmonic(data, idx) {
  const results = [];
  const detectors = [
    detectGartley, detectBat, detectButterfly,
    detectCrab, detectDeepCrab, detectShark,
    detectCypher, detectAB_CD, detectThreeDrives, detect5_0,
  ];
  for (const fn of detectors) {
    const result = fn(data, idx);
    if (result) results.push(result);
  }
  return results;
}

// ==============================
// EXPORT
// ==============================
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    findHarmonicSwings, extractXABCD,
    detectGartley, detectBat, detectButterfly,
    detectCrab, detectDeepCrab, detectShark,
    detectCypher, detectAB_CD, detectThreeDrives, detect5_0,
    detectAllHarmonic,
  };
}
