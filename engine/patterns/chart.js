// ============================================================================
// ENGINE: CHART PATTERN DETECTOR — 21 padrões estruturais
// Fonte: Bulkowski, Murphy, Edwards & Magee
// ============================================================================

// Helpers
function isBullish(c) { return c.c > c.o; }
function isBearish(c) { return c.c < c.o; }

/**
 * Find swing highs and lows in price data
 * A swing point is a candle where price reverses by at least N candles on each side
 */
function findSwings(data, lookLeft = 3, lookRight = 3) {
  const pivotHighs = [];
  const pivotLows = [];

  for (let i = lookLeft; i < data.length - lookRight; i++) {
    let isHigh = true, isLow = true;
    for (let j = i - lookLeft; j <= i + lookRight; j++) {
      if (j === i) continue;
      if (data[j].h >= data[i].h) isHigh = false;
      if (data[j].l <= data[i].l) isLow = false;
    }
    if (isHigh) pivotHighs.push({ idx: i, price: data[i].h, candle: data[i] });
    if (isLow) pivotLows.push({ idx: i, price: data[i].l, candle: data[i] });
  }

  return { pivotHighs, pivotLows };
}

function priceRange(data, start, end) {
  let min = Infinity, max = -Infinity;
  for (let i = start; i <= end && i < data.length; i++) {
    if (data[i].l < min) min = data[i].l;
    if (data[i].h > max) max = data[i].h;
  }
  return { min, max, range: max - min };
}

// ==============================
// PATTERN DETECTORS
// ==============================

/**
 * Double Top: Two similar highs with a valley between them, in an uptrend
 */
function detectDoubleTop(data, idx) {
  if (idx < 30) return null;
  const { pivotHighs } = findSwings(data.slice(0, idx + 1), 4, 4);
  if (pivotHighs.length < 2) return null;

  const h1 = pivotHighs[pivotHighs.length - 2];
  const h2 = pivotHighs[pivotHighs.length - 1];
  if (!h1 || !h2) return null;

  const tolerance = (h1.price * 0.01); // 1%
  if (Math.abs(h1.price - h2.price) > tolerance) return null;
  if (h2.idx - h1.idx < 5) return null; // minimum separation

  // Find valley between tops
  const valley = priceRange(data, h1.idx, h2.idx);
  const valleyDepth = (h1.price - valley.min) / h1.price;

  if (valleyDepth < 0.02) return null; // meaningful valley
  if (data[idx].c < valley.min) // neckline break
    return { type: 'Double_Top', direction: 'bearish', strength: 4, neckline: valley.min, target: h1.price - (h1.price - valley.min) };

  return { type: 'Double_Top_Forming', direction: 'bearish', strength: 2, neckline: valley.min };
}

/**
 * Double Bottom: Two similar lows with a peak between them, in a downtrend
 */
function detectDoubleBottom(data, idx) {
  if (idx < 30) return null;
  const { pivotLows } = findSwings(data.slice(0, idx + 1), 4, 4);
  if (pivotLows.length < 2) return null;

  const l1 = pivotLows[pivotLows.length - 2];
  const l2 = pivotLows[pivotLows.length - 1];
  if (!l1 || !l2) return null;

  const tolerance = (l1.price * 0.01);
  if (Math.abs(l1.price - l2.price) > tolerance) return null;
  if (l2.idx - l1.idx < 5) return null;

  const peak = priceRange(data, l1.idx, l2.idx);
  const peakHeight = (peak.max - l1.price) / l1.price;
  if (peakHeight < 0.02) return null;

  if (data[idx].c > peak.max)
    return { type: 'Double_Bottom', direction: 'bullish', strength: 4, neckline: peak.max, target: l1.price + (peak.max - l1.price) * 2 };

  return { type: 'Double_Bottom_Forming', direction: 'bullish', strength: 2, neckline: peak.max };
}

/**
 * Head and Shoulders: Three peaks, middle highest
 */
function detectHeadShoulders(data, idx) {
  if (idx < 40) return null;
  const { pivotHighs } = findSwings(data.slice(0, idx + 1), 5, 5);
  if (pivotHighs.length < 3) return null;

  for (let i = pivotHighs.length - 3; i >= 0; i--) {
    const ls = pivotHighs[i];       // left shoulder
    const hd = pivotHighs[i + 1];   // head
    const rs = pivotHighs[i + 2];   // right shoulder

    if (hd.price <= ls.price || hd.price <= rs.price) continue;
    if (Math.abs(ls.price - rs.price) / ls.price > 0.05) continue;
    if (rs.idx - ls.idx > 60) continue; // too wide

    // Neckline connects lows between peaks
    const neckLow1 = priceRange(data, ls.idx, hd.idx).min;
    const neckLow2 = priceRange(data, hd.idx, rs.idx).min;

    if (data[idx].c < Math.min(neckLow1, neckLow2))
      return { type: 'Head_Shoulders_Top', direction: 'bearish', strength: 5, target: rs.price - (hd.price - Math.min(neckLow1, neckLow2)) };

    return { type: 'Head_Shoulders_Forming', direction: 'bearish', strength: 3 };
  }
  return null;
}

/**
 * Inverted Head and Shoulders: Three valleys, middle lowest
 */
function detectInvHeadShoulders(data, idx) {
  if (idx < 40) return null;
  const { pivotLows } = findSwings(data.slice(0, idx + 1), 5, 5);
  if (pivotLows.length < 3) return null;

  for (let i = pivotLows.length - 3; i >= 0; i--) {
    const ls = pivotLows[i];
    const hd = pivotLows[i + 1];
    const rs = pivotLows[i + 2];

    if (hd.price >= ls.price || hd.price >= rs.price) continue;
    if (Math.abs(ls.price - rs.price) / ls.price > 0.05) continue;
    if (rs.idx - ls.idx > 60) continue;

    const neckHigh1 = priceRange(data, ls.idx, hd.idx).max;
    const neckHigh2 = priceRange(data, hd.idx, rs.idx).max;

    if (data[idx].c > Math.max(neckHigh1, neckHigh2))
      return { type: 'Inverse_Head_Shoulders', direction: 'bullish', strength: 5, target: rs.price + (Math.max(neckHigh1, neckHigh2) - hd.price) };

    return { type: 'Inverse_HS_Forming', direction: 'bullish', strength: 3 };
  }
  return null;
}

/**
 * Triple Top / Bottom
 */
function detectTripleTop(data, idx) {
  if (idx < 40) return null;
  const { pivotHighs } = findSwings(data.slice(0, idx + 1), 4, 4);
  if (pivotHighs.length < 3) return null;

  const p1 = pivotHighs[pivotHighs.length - 3];
  const p2 = pivotHighs[pivotHighs.length - 2];
  const p3 = pivotHighs[pivotHighs.length - 1];
  if (!p1 || !p2 || !p3) return null;

  const tol = p1.price * 0.015;
  if (Math.abs(p1.price - p2.price) > tol || Math.abs(p2.price - p3.price) > tol) return null;

  const valleyMin = Math.min(
    priceRange(data, p1.idx, p2.idx).min,
    priceRange(data, p2.idx, p3.idx).min
  );

  if (data[idx].c < valleyMin)
    return { type: 'Triple_Top', direction: 'bearish', strength: 5 };

  return { type: 'Triple_Top_Forming', direction: 'bearish', strength: 3 };
}

function detectTripleBottom(data, idx) {
  if (idx < 40) return null;
  const { pivotLows } = findSwings(data.slice(0, idx + 1), 4, 4);
  if (pivotLows.length < 3) return null;

  const p1 = pivotLows[pivotLows.length - 3];
  const p2 = pivotLows[pivotLows.length - 2];
  const p3 = pivotLows[pivotLows.length - 1];
  if (!p1 || !p2 || !p3) return null;

  const tol = p1.price * 0.015;
  if (Math.abs(p1.price - p2.price) > tol || Math.abs(p2.price - p3.price) > tol) return null;

  const peakMax = Math.max(
    priceRange(data, p1.idx, p2.idx).max,
    priceRange(data, p2.idx, p3.idx).max
  );

  if (data[idx].c > peakMax)
    return { type: 'Triple_Bottom', direction: 'bullish', strength: 5 };

  return { type: 'Triple_Bottom_Forming', direction: 'bullish', strength: 3 };
}

/**
 * Triangles: Ascending, Descending, Symmetrical
 */
function detectTriangles(data, idx) {
  if (idx < 20) return null;
  const { pivotHighs, pivotLows } = findSwings(data.slice(Math.max(0, idx - 40), idx + 1), 3, 3);
  if (pivotHighs.length < 2 || pivotLows.length < 2) return null;

  // Last 3-4 swing highs/lows
  const recentHighs = pivotHighs.slice(-4);
  const recentLows = pivotLows.slice(-4);
  if (recentHighs.length < 2 || recentLows.length < 2) return null;

  // Check if highs form a line (flat or descending) and lows form a line (flat or ascending)
  const highSlope = recentHighs.length >= 2
    ? (recentHighs[recentHighs.length - 1].price - recentHighs[0].price) / recentHighs.length : 0;
  const lowSlope = recentLows.length >= 2
    ? (recentLows[recentLows.length - 1].price - recentLows[0].price) / recentLows.length : 0;

  const hSlopePct = highSlope / data[idx].c;
  const lSlopePct = lowSlope / data[idx].c;

  const HIGH_FLAT = 0.0001; // 0.01%
  const price = data[idx].c;

  // Ascending Triangle: flat top, rising lows
  if (Math.abs(hSlopePct) < HIGH_FLAT && lSlopePct > HIGH_FLAT) {
    if (data[idx].c > recentHighs[recentHighs.length - 1].price)
      return { type: 'Ascending_Triangle_Breakout', direction: 'bullish', strength: 4 };
    return { type: 'Ascending_Triangle', direction: 'bullish', strength: 2 };
  }

  // Descending Triangle: flat bottom, falling highs
  if (Math.abs(lSlopePct) < HIGH_FLAT && hSlopePct < -HIGH_FLAT) {
    if (data[idx].c < recentLows[recentLows.length - 1].price)
      return { type: 'Descending_Triangle_Breakdown', direction: 'bearish', strength: 4 };
    return { type: 'Descending_Triangle', direction: 'bearish', strength: 2 };
  }

  // Symmetrical Triangle: converging slopes
  if (hSlopePct < -HIGH_FLAT && lSlopePct > HIGH_FLAT) {
    const midpoint = (recentHighs[recentHighs.length - 1].price + recentLows[recentLows.length - 1].price) / 2;
    if (data[idx].c > midpoint)
      return { type: 'Symmetrical_Triangle_Up', direction: 'bullish', strength: 3 };
    return { type: 'Symmetrical_Triangle', direction: 'neutral', strength: 2 };
  }

  return null;
}

/**
 * Flags and Pennants: Sharp move (pole) followed by consolidation
 */
function detectFlagPennant(data, idx) {
  if (idx < 15) return null;

  // Look for sharp move (pole) in last 10-15 candles
  const poleStart = Math.max(0, idx - 15);
  const poleEnd = Math.max(poleStart + 5, idx - 7);
  const poleCandles = data.slice(poleStart, poleEnd);
  const consolidation = data.slice(poleEnd, idx + 1);

  if (poleCandles.length < 5 || consolidation.length < 4) return null;

  const poleMove = ((poleCandles[poleCandles.length - 1].c - poleCandles[0].c) / poleCandles[0].c) * 100;
  const consolidationRange = priceRange(data, poleEnd, idx);

  // Sharp pole (>1.5%)
  if (Math.abs(poleMove) < 1.0) return null;

  // Consolidation range small compared to pole
  const poleRange = Math.abs(poleCandles[poleCandles.length - 1].c - poleCandles[0].c);
  if (consolidationRange.range > poleRange * 0.5) return null;

  // Determine flag vs pennant
  const isPennant = consolidationRange.range < poleRange * 0.2;

  if (poleMove > 0) {
    if (isPennant) return { type: 'Bullish_Pennant', direction: 'bullish', strength: 3 };
    return { type: 'Bullish_Flag', direction: 'bullish', strength: 3 };
  } else {
    if (isPennant) return { type: 'Bearish_Pennant', direction: 'bearish', strength: 3 };
    return { type: 'Bearish_Flag', direction: 'bearish', strength: 3 };
  }
}

/**
 * Wedges: Rising or Falling
 */
function detectWedge(data, idx) {
  if (idx < 20) return null;
  const { pivotHighs, pivotLows } = findSwings(data.slice(Math.max(0, idx - 35), idx + 1), 3, 3);
  if (pivotHighs.length < 3 || pivotLows.length < 3) return null;

  const recentHighs = pivotHighs.slice(-3);
  const recentLows = pivotLows.slice(-3);
  if (recentHighs.length < 3 || recentLows.length < 3) return null;

  // Both series moving in same direction and converging
  const highSlope = (recentHighs[2].price - recentHighs[0].price) / recentHighs.length;
  const lowSlope = (recentLows[2].price - recentLows[0].price) / recentLows.length;

  const convergenceRatio = Math.abs(highSlope) > Math.abs(lowSlope)
    ? Math.abs(lowSlope) / Math.abs(highSlope)
    : Math.abs(highSlope) / Math.abs(lowSlope);

  // Rising wedge: both slopes positive, converging
  if (highSlope > 0 && lowSlope > 0 && Math.abs(highSlope) > Math.abs(lowSlope) * 1.1) {
    return { type: 'Rising_Wedge', direction: 'bearish', strength: 3 };
  }

  // Falling wedge: both slopes negative, converging
  if (highSlope < 0 && lowSlope < 0 && Math.abs(lowSlope) > Math.abs(highSlope) * 1.1) {
    return { type: 'Falling_Wedge', direction: 'bullish', strength: 3 };
  }

  return null;
}

/**
 * Channel: Parallel trend lines
 */
function detectChannel(data, idx) {
  if (idx < 20) return null;
  const { pivotHighs, pivotLows } = findSwings(data.slice(Math.max(0, idx - 40), idx + 1), 3, 3);
  if (pivotHighs.length < 3 || pivotLows.length < 3) return null;

  const recentHighs = pivotHighs.slice(-4);
  const recentLows = pivotLows.slice(-4);

  const highSlope = recentHighs.length >= 3
    ? (recentHighs[recentHighs.length - 1].price - recentHighs[0].price) / recentHighs.length : 0;
  const lowSlope = recentLows.length >= 3
    ? (recentLows[recentLows.length - 1].price - recentLows[0].price) / recentLows.length : 0;

  // Slopes roughly parallel
  const slopeDiff = Math.abs(highSlope - lowSlope) / data[idx].c;
  if (slopeDiff > 0.0003) return null;

  const avgSlope = (highSlope + lowSlope) / 2;

  if (avgSlope > 0.0001) return { type: 'Ascending_Channel', direction: 'bullish', strength: 2 };
  if (avgSlope < -0.0001) return { type: 'Descending_Channel', direction: 'bearish', strength: 2 };
  return { type: 'Horizontal_Channel', direction: 'neutral', strength: 2 };
}

/**
 * Cup & Handle: U-shaped recovery + small consolidation
 */
function detectCupHandle(data, idx) {
  if (idx < 30) return null;

  const { pivotHighs, pivotLows } = findSwings(data.slice(Math.max(0, idx - 50), idx + 1), 5, 5);
  if (pivotHighs.length < 3 || pivotLows.length < 1) return null;

  // Find a significant low between two similar highs
  const firstHigh = pivotHighs[pivotHighs.length - 3];
  const cupLow = pivotLows[pivotLows.length - 1];
  const secondHigh = pivotHighs[pivotHighs.length - 1];

  if (!firstHigh || !cupLow || !secondHigh) return null;
  if (cupLow.idx <= firstHigh.idx || cupLow.idx >= secondHigh.idx) return null;

  const lipTolerance = firstHigh.price * 0.015;
  if (Math.abs(firstHigh.price - secondHigh.price) > lipTolerance) return null;

  const cupDepth = (firstHigh.price - cupLow.price) / firstHigh.price;
  if (cupDepth < 0.03 || cupDepth > 0.20) return null;

  // Handle: small decline after right lip
  const handleCandles = data.slice(secondHigh.idx, idx + 1);
  if (handleCandles.length < 3) return null;

  if (data[idx].c > secondHigh.price)
    return { type: 'Cup_Handle_Breakout', direction: 'bullish', strength: 4 };

  return { type: 'Cup_Handle', direction: 'bullish', strength: 2 };
}

/**
 * Rounding Top / Bottom
 */
function detectRounding(data, idx) {
  if (idx < 25) return null;
  const lookback = data.slice(Math.max(0, idx - 30), idx + 1);
  if (lookback.length < 20) return null;

  const firstPrice = lookback[0].c;
  const lastPrice = data[idx].c;
  const midpoint = lookback[Math.floor(lookback.length / 2)].c;

  // Rounding Bottom: U shape
  const isUBottom = midpoint < firstPrice * 0.98 && midpoint < lastPrice * 0.98
    && Math.abs(firstPrice - lastPrice) / firstPrice < 0.03;
  if (isUBottom)
    return { type: 'Rounding_Bottom', direction: 'bullish', strength: 3 };

  // Rounding Top: inverted U
  const isInvertedU = midpoint > firstPrice * 1.02 && midpoint > lastPrice * 1.02
    && Math.abs(firstPrice - lastPrice) / firstPrice < 0.03;
  if (isInvertedU)
    return { type: 'Rounding_Top', direction: 'bearish', strength: 3 };

  return null;
}

/**
 * Broadening pattern (megaphone)
 */
function detectBroadening(data, idx) {
  if (idx < 20) return null;
  const { pivotHighs, pivotLows } = findSwings(data.slice(Math.max(0, idx - 35), idx + 1), 3, 3);
  if (pivotHighs.length < 3 || pivotLows.length < 3) return null;

  const recentHighs = pivotHighs.slice(-3);
  const recentLows = pivotLows.slice(-3);

  const highsRising = recentHighs[2].price > recentHighs[1].price && recentHighs[1].price > recentHighs[0].price;
  const lowsFalling = recentLows[2].price < recentLows[1].price && recentLows[1].price < recentLows[0].price;

  if (highsRising && lowsFalling)
    return { type: 'Broadening_Formation', direction: 'bearish', strength: 3 };

  return null;
}

/**
 * Island Reversal: Gap up + consolidation + gap down (or vice versa)
 */
function detectIslandReversal(data, idx) {
  if (idx < 8) return null;

  // Look for island (gap, consolidation, gap)
  for (let i = idx; i >= idx - 5 && i >= 4; i--) {
    const before = data[i - 3];
    const islandStart = data[i - 2];
    const islandEnd = data[i - 1];
    const after = data[i];

    // Island Top: gap up, consolidation, gap down
    if (islandStart.l > before.h && after.h < islandEnd.l) {
      // Check consolidation (island body)
      const islandRange = priceRange(data, i - 2, i - 1);
      if (islandRange.range / before.c < 0.02) // small island
        return { type: 'Island_Reversal_Top', direction: 'bearish', strength: 5 };
    }

    // Island Bottom: gap down, consolidation, gap up
    if (islandStart.h < before.l && after.l > islandEnd.h) {
      const islandRange = priceRange(data, i - 2, i - 1);
      if (islandRange.range / before.c < 0.02)
        return { type: 'Island_Reversal_Bottom', direction: 'bullish', strength: 5 };
    }
  }

  return null;
}

/**
 * Key Reversal Bar: New high/low then close opposite direction
 */
function detectKeyReversal(data, idx) {
  if (idx < 1) return null;
  const prev = data[idx - 1];

  // Key Reversal Down: new high, closes below prev close
  if (data[idx].h > prev.h && data[idx].c < prev.c && isBearish(data[idx]))
    return { type: 'Key_Reversal_Down', direction: 'bearish', strength: 3 };

  // Key Reversal Up: new low, closes above prev close
  if (data[idx].l < prev.l && data[idx].c > prev.c && isBullish(data[idx]))
    return { type: 'Key_Reversal_Up', direction: 'bullish', strength: 3 };

  return null;
}

// ==============================
// MASTER DETECTOR
// ==============================
function detectAllChartPatterns(data, idx) {
  const results = [];

  const detectors = [
    detectDoubleTop,
    detectDoubleBottom,
    detectHeadShoulders,
    detectInvHeadShoulders,
    detectTripleTop,
    detectTripleBottom,
    detectTriangles,
    detectFlagPennant,
    detectWedge,
    detectChannel,
    detectCupHandle,
    detectRounding,
    detectBroadening,
    detectIslandReversal,
    detectKeyReversal,
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
    findSwings, detectAllChartPatterns,
    detectDoubleTop, detectDoubleBottom,
    detectHeadShoulders, detectInvHeadShoulders,
    detectTripleTop, detectTripleBottom,
    detectTriangles, detectFlagPennant,
    detectWedge, detectChannel,
    detectCupHandle, detectRounding,
    detectBroadening, detectIslandReversal,
    detectKeyReversal,
  };
}
