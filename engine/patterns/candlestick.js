// ============================================================================
// ENGINE: CANDLESTICK PATTERN DETECTOR — 42 padrões
// Fonte: Steve Nison, Bulkowski, Wikipedia
// ============================================================================

/**
 * Candle helpers
 */
function body(c) { return Math.abs(c.c - c.o); }
function upperShadow(c) { return c.h - Math.max(c.o, c.c); }
function lowerShadow(c) { return Math.min(c.o, c.c) - c.l; }
function totalRange(c) { return c.h - c.l; }
function isBullish(c) { return c.c > c.o; }
function isBearish(c) { return c.c < c.o; }
function bodyRatio(c) { const r = totalRange(c); return r > 0 ? body(c) / r : 0; }
function upperRatio(c) { const r = totalRange(c); return r > 0 ? upperShadow(c) / r : 0; }
function lowerRatio(c) { const r = totalRange(c); return r > 0 ? lowerShadow(c) / r : 0; }
function gapUp(curr, prev) { return curr.l > prev.h; }
function gapDown(curr, prev) { return curr.h < prev.l; }
function avgBody(data, lookback, idx) {
  let sum = 0, cnt = 0;
  for (let i = Math.max(0, idx - lookback); i < idx; i++) {
    sum += body(data[i]); cnt++;
  }
  return cnt > 0 ? sum / cnt : 0;
}

// ==============================
// SINGLE CANDLE PATTERNS (16)
// ==============================

const SINGLE = {
  // --- Doji family ---
  Doji: (c, data, idx) => {
    const b = body(c), r = totalRange(c);
    if (r === 0) return null;
    if (b / r > 0.05) return null; // body < 5% of range
    const isDragonfly = upperShadow(c) / r < 0.1 && lowerShadow(c) / r > 0.6;
    const isGravestone = lowerShadow(c) / r < 0.1 && upperShadow(c) / r > 0.6;
    const isLongLegged = upperShadow(c) / r > 0.3 && lowerShadow(c) / r > 0.3;
    if (isDragonfly) return { type: 'Dragonfly_Doji', direction: 'bullish', strength: 3 };
    if (isGravestone) return { type: 'Gravestone_Doji', direction: 'bearish', strength: 3 };
    if (isLongLegged) return { type: 'Long_Legged_Doji', direction: 'neutral', strength: 2 };
    return { type: 'Doji', direction: 'neutral', strength: 2 };
  },

  Dragonfly_Doji: (c, data, idx) => {
    const r = totalRange(c); if (r === 0) return null;
    if (body(c)/r > 0.05) return null;
    if (upperShadow(c)/r < 0.1 && lowerShadow(c)/r > 0.6)
      return { type: 'Dragonfly_Doji', direction: 'bullish', strength: 3 };
    return null;
  },

  Gravestone_Doji: (c, data, idx) => {
    const r = totalRange(c); if (r === 0) return null;
    if (body(c)/r > 0.05) return null;
    if (lowerShadow(c)/r < 0.1 && upperShadow(c)/r > 0.6)
      return { type: 'Gravestone_Doji', direction: 'bearish', strength: 3 };
    return null;
  },

  Long_Legged_Doji: (c, data, idx) => {
    const r = totalRange(c); if (r === 0) return null;
    if (body(c)/r > 0.05) return null;
    if (upperShadow(c)/r > 0.3 && lowerShadow(c)/r > 0.3)
      return { type: 'Long_Legged_Doji', direction: 'neutral', strength: 2 };
    return null;
  },

  // --- Hammer / Hanging Man ---
  Hammer: (c, data, idx) => {
    const r = totalRange(c); if (r === 0) return null;
    const b = body(c);
    // Small body in upper third, long lower shadow, tiny upper shadow
    if (b/r > 0.35 || b/r < 0.05) return null;
    if (lowerShadow(c)/r < 0.5) return null;
    if (upperShadow(c)/r > 0.15) return null;
    // Needs to appear in downtrend
    if (idx < 3) return null;
    const trend = detectTrend(data, idx, 5);
    if (trend === 'down')
      return { type: 'Hammer', direction: 'bullish', strength: 3 };
    if (trend === 'up')
      return { type: 'Hanging_Man', direction: 'bearish', strength: 2 };
    return { type: 'Hammer_Like', direction: 'bullish', strength: 1 };
  },

  Hanging_Man: (c, data, idx) => {
    const r = totalRange(c); if (r === 0) return null;
    const b = body(c);
    if (b/r > 0.35 || b/r < 0.05) return null;
    if (lowerShadow(c)/r < 0.5) return null;
    if (upperShadow(c)/r > 0.15) return null;
    if (idx < 3) return null;
    const trend = detectTrend(data, idx, 5);
    if (trend === 'up')
      return { type: 'Hanging_Man', direction: 'bearish', strength: 3 };
    return null;
  },

  // --- Inverted Hammer / Shooting Star ---
  Inverted_Hammer: (c, data, idx) => {
    const r = totalRange(c); if (r === 0) return null;
    const b = body(c);
    if (b/r > 0.35 || b/r < 0.05) return null;
    if (upperShadow(c)/r < 0.5) return null;
    if (lowerShadow(c)/r > 0.15) return null;
    if (idx < 3) return null;
    const trend = detectTrend(data, idx, 5);
    if (trend === 'down')
      return { type: 'Inverted_Hammer', direction: 'bullish', strength: 2 };
    if (trend === 'up')
      return { type: 'Shooting_Star', direction: 'bearish', strength: 3 };
    return { type: 'Inverted_Hammer_Like', direction: 'bullish', strength: 1 };
  },

  Shooting_Star: (c, data, idx) => {
    const r = totalRange(c); if (r === 0) return null;
    const b = body(c);
    if (b/r > 0.35 || b/r < 0.05) return null;
    if (upperShadow(c)/r < 0.5) return null;
    if (lowerShadow(c)/r > 0.15) return null;
    if (idx < 3) return null;
    const trend = detectTrend(data, idx, 5);
    if (trend === 'up')
      return { type: 'Shooting_Star', direction: 'bearish', strength: 3 };
    return null;
  },

  // --- Marubozu ---
  Marubozu_Bullish: (c, data, idx) => {
    if (!isBullish(c)) return null;
    const r = totalRange(c); if (r === 0) return null;
    if (body(c)/r < 0.85) return null;
    if (upperShadow(c)/r > 0.05 && lowerShadow(c)/r > 0.05) return null;
    const ab = avgBody(data, 10, idx);
    if (body(c) < ab * 1.5) return null;
    return { type: 'Marubozu_Bullish', direction: 'bullish', strength: 3 };
  },

  Marubozu_Bearish: (c, data, idx) => {
    if (!isBearish(c)) return null;
    const r = totalRange(c); if (r === 0) return null;
    if (body(c)/r < 0.85) return null;
    if (upperShadow(c)/r > 0.05 && lowerShadow(c)/r > 0.05) return null;
    const ab = avgBody(data, 10, idx);
    if (body(c) < ab * 1.5) return null;
    return { type: 'Marubozu_Bearish', direction: 'bearish', strength: 3 };
  },

  // --- Big candles ---
  Big_Bullish: (c, data, idx) => {
    if (!isBullish(c)) return null;
    const ab = avgBody(data, 10, idx);
    if (body(c) < ab * 2) return null;
    return { type: 'Big_Bullish_Candle', direction: 'bullish', strength: 2 };
  },

  Big_Bearish: (c, data, idx) => {
    if (!isBearish(c)) return null;
    const ab = avgBody(data, 10, idx);
    if (body(c) < ab * 2) return null;
    return { type: 'Big_Bearish_Candle', direction: 'bearish', strength: 2 };
  },

  // --- Spinning Top ---
  Spinning_Top: (c, data, idx) => {
    const r = totalRange(c); if (r === 0) return null;
    const b = body(c);
    if (b/r > 0.3 || b/r < 0.03) return null;
    if (upperShadow(c)/r > 0.2 && lowerShadow(c)/r > 0.2)
      return { type: 'Spinning_Top', direction: 'neutral', strength: 1 };
    return null;
  },

  // --- High Wave ---
  High_Wave: (c, data, idx) => {
    const r = totalRange(c); if (r === 0) return null;
    const b = body(c);
    if (b/r > 0.2) return null;
    if (upperShadow(c)/r > 0.35 && lowerShadow(c)/r > 0.35)
      return { type: 'High_Wave', direction: 'neutral', strength: 2 };
    return null;
  },

  // --- Long Shadow patterns ---
  Long_Upper_Shadow: (c, data, idx) => {
    const r = totalRange(c); if (r === 0) return null;
    if (upperShadow(c)/r > 0.65 && lowerShadow(c)/r < 0.1)
      return { type: 'Long_Upper_Shadow', direction: 'bearish', strength: 1 };
    return null;
  },

  Long_Lower_Shadow: (c, data, idx) => {
    const r = totalRange(c); if (r === 0) return null;
    if (lowerShadow(c)/r > 0.65 && upperShadow(c)/r < 0.1)
      return { type: 'Long_Lower_Shadow', direction: 'bullish', strength: 1 };
    return null;
  },
};

// ==============================
// TWO-CANDLE PATTERNS (14)
// ==============================

const DOUBLE = {
  Bullish_Engulfing: (c, data, idx) => {
    if (idx < 1) return null;
    const prev = data[idx - 1];
    if (!isBearish(prev) || !isBullish(c)) return null;
    if (c.c <= prev.o || c.o >= prev.c) return null; // must engulf
    if (body(c) < body(prev) * 0.8) return null;
    if (idx < 3) return null;
    const trend = detectTrend(data, idx, 5);
    return { type: 'Bullish_Engulfing', direction: 'bullish', strength: trend === 'down' ? 4 : 2 };
  },

  Bearish_Engulfing: (c, data, idx) => {
    if (idx < 1) return null;
    const prev = data[idx - 1];
    if (!isBullish(prev) || !isBearish(c)) return null;
    if (c.c >= prev.o || c.o <= prev.c) return null;
    if (body(c) < body(prev) * 0.8) return null;
    if (idx < 3) return null;
    const trend = detectTrend(data, idx, 5);
    return { type: 'Bearish_Engulfing', direction: 'bearish', strength: trend === 'up' ? 4 : 2 };
  },

  Bullish_Harami: (c, data, idx) => {
    if (idx < 1) return null;
    const prev = data[idx - 1];
    if (!isBearish(prev) || !isBullish(c)) return null;
    if (c.o < prev.c || c.c > prev.o) return null; // contained
    if (body(c) > body(prev) * 0.6) return null;
    return { type: 'Bullish_Harami', direction: 'bullish', strength: 2 };
  },

  Bearish_Harami: (c, data, idx) => {
    if (idx < 1) return null;
    const prev = data[idx - 1];
    if (!isBullish(prev) || !isBearish(c)) return null;
    if (c.o > prev.c || c.c < prev.o) return null;
    if (body(c) > body(prev) * 0.6) return null;
    return { type: 'Bearish_Harami', direction: 'bearish', strength: 2 };
  },

  Bullish_Harami_Cross: (c, data, idx) => {
    if (idx < 1) return null;
    const prev = data[idx - 1];
    if (!isBearish(prev)) return null;
    const r = totalRange(c); if (r === 0) return null;
    if (body(c)/r > 0.05) return null; // doji
    if (c.o < prev.c || c.c > prev.o) return null;
    return { type: 'Bullish_Harami_Cross', direction: 'bullish', strength: 3 };
  },

  Bearish_Harami_Cross: (c, data, idx) => {
    if (idx < 1) return null;
    const prev = data[idx - 1];
    if (!isBullish(prev)) return null;
    const r = totalRange(c); if (r === 0) return null;
    if (body(c)/r > 0.05) return null;
    if (c.o > prev.c || c.c < prev.o) return null;
    return { type: 'Bearish_Harami_Cross', direction: 'bearish', strength: 3 };
  },

  Piercing_Line: (c, data, idx) => {
    if (idx < 1) return null;
    const prev = data[idx - 1];
    if (!isBearish(prev) || !isBullish(c)) return null;
    // Must open below prev low
    if (c.o >= prev.l) return null;
    // Must close above 50% of prev body
    const midPoint = prev.c + body(prev) / 2;
    if (c.c < midPoint) return null;
    // Must close below prev open
    if (c.c > prev.o) return null;
    return { type: 'Piercing_Line', direction: 'bullish', strength: 3 };
  },

  Dark_Cloud_Cover: (c, data, idx) => {
    if (idx < 1) return null;
    const prev = data[idx - 1];
    if (!isBullish(prev) || !isBearish(c)) return null;
    if (c.o <= prev.h) return null; // must open above
    const midPoint = prev.o + body(prev) / 2;
    if (c.c > midPoint) return null; // must close below 50%
    if (c.c < prev.o) return null; // must stay within
    return { type: 'Dark_Cloud_Cover', direction: 'bearish', strength: 3 };
  },

  Bullish_Kicking: (c, data, idx) => {
    if (idx < 1) return null;
    const prev = data[idx - 1];
    if (!isBearish(prev) || !isBullish(c)) return null;
    // Marubozu bearish + gap up + Marubozu bullish
    const pr = totalRange(prev), cr = totalRange(c);
    if (body(prev)/pr < 0.85 || body(c)/cr < 0.85) return null;
    if (!gapUp(c, prev)) return null;
    return { type: 'Bullish_Kicking', direction: 'bullish', strength: 4 };
  },

  Bearish_Kicking: (c, data, idx) => {
    if (idx < 1) return null;
    const prev = data[idx - 1];
    if (!isBullish(prev) || !isBearish(c)) return null;
    const pr = totalRange(prev), cr = totalRange(c);
    if (body(prev)/pr < 0.85 || body(c)/cr < 0.85) return null;
    if (!gapDown(c, prev)) return null;
    return { type: 'Bearish_Kicking', direction: 'bearish', strength: 4 };
  },

  Tweezer_Top: (c, data, idx) => {
    if (idx < 1) return null;
    const prev = data[idx - 1];
    const tolerance = totalRange(c) * 0.03;
    if (Math.abs(c.h - prev.h) > tolerance) return null;
    if (isBullish(prev) && isBearish(c))
      return { type: 'Tweezer_Top', direction: 'bearish', strength: 2 };
    return null;
  },

  Tweezer_Bottom: (c, data, idx) => {
    if (idx < 1) return null;
    const prev = data[idx - 1];
    const tolerance = totalRange(c) * 0.03;
    if (Math.abs(c.l - prev.l) > tolerance) return null;
    if (isBearish(prev) && isBullish(c))
      return { type: 'Tweezer_Bottom', direction: 'bullish', strength: 2 };
    return null;
  },

  On_Neckline: (c, data, idx) => {
    if (idx < 1) return null;
    const prev = data[idx - 1];
    if (!isBearish(prev) || !isBullish(c)) return null;
    if (Math.abs(c.c - prev.l) / totalRange(prev) > 0.05) return null;
    return { type: 'On_Neckline', direction: 'bearish', strength: 1 };
  },

  Doji_Star: (c, data, idx) => {
    if (idx < 1) return null;
    const prev = data[idx - 1];
    const r = totalRange(c); if (r === 0) return null;
    if (body(c)/r > 0.05) return null;
    if (gapUp(c, prev))
      return { type: 'Doji_Star_Bearish', direction: 'bearish', strength: 2 };
    if (gapDown(c, prev))
      return { type: 'Doji_Star_Bullish', direction: 'bullish', strength: 2 };
    return null;
  },
};

// ==============================
// THREE-CANDLE PATTERNS (12)
// ==============================

const TRIPLE = {
  Morning_Star: (c, data, idx) => {
    if (idx < 2) return null;
    const c1 = data[idx - 2], c2 = data[idx - 1];
    // C1: big bearish, C2: small body gaps down, C3: big bullish closes into C1
    if (!isBearish(c1) || body(c1) < avgBody(data, 10, idx - 2) * 1.2) return null;
    if (!gapDown(c2, c1)) return null;
    const r2 = totalRange(c2); if (r2 === 0) return null;
    if (body(c2)/r2 > 0.4) return null; // small body
    if (!isBullish(c) || body(c) < avgBody(data, 10, idx) * 1.2) return null;
    if (c.c < c1.o + body(c1) * 0.4) return null; // closes into C1
    return { type: 'Morning_Star', direction: 'bullish', strength: 4 };
  },

  Evening_Star: (c, data, idx) => {
    if (idx < 2) return null;
    const c1 = data[idx - 2], c2 = data[idx - 1];
    if (!isBullish(c1) || body(c1) < avgBody(data, 10, idx - 2) * 1.2) return null;
    if (!gapUp(c2, c1)) return null;
    const r2 = totalRange(c2); if (r2 === 0) return null;
    if (body(c2)/r2 > 0.4) return null;
    if (!isBearish(c) || body(c) < avgBody(data, 10, idx) * 1.2) return null;
    if (c.c > c1.o - body(c1) * 0.4) return null;
    return { type: 'Evening_Star', direction: 'bearish', strength: 4 };
  },

  Morning_Doji_Star: (c, data, idx) => {
    if (idx < 2) return null;
    const c1 = data[idx - 2], c2 = data[idx - 1];
    if (!isBearish(c1)) return null;
    if (!gapDown(c2, c1)) return null;
    const r2 = totalRange(c2); if (r2 === 0) return null;
    if (body(c2)/r2 > 0.05) return null; // must be doji
    if (!isBullish(c)) return null;
    if (c.c < c1.o + body(c1) * 0.4) return null;
    return { type: 'Morning_Doji_Star', direction: 'bullish', strength: 5 };
  },

  Evening_Doji_Star: (c, data, idx) => {
    if (idx < 2) return null;
    const c1 = data[idx - 2], c2 = data[idx - 1];
    if (!isBullish(c1)) return null;
    if (!gapUp(c2, c1)) return null;
    const r2 = totalRange(c2); if (r2 === 0) return null;
    if (body(c2)/r2 > 0.05) return null;
    if (!isBearish(c)) return null;
    if (c.c > c1.o - body(c1) * 0.4) return null;
    return { type: 'Evening_Doji_Star', direction: 'bearish', strength: 5 };
  },

  Three_White_Soldiers: (c, data, idx) => {
    if (idx < 2) return null;
    const c1 = data[idx - 2], c2 = data[idx - 1];
    if (!isBullish(c1) || !isBullish(c2) || !isBullish(c)) return null;
    if (c1.c >= c2.c || c2.c >= c.c) return null; // consecutively higher
    // Each close near its high
    if (upperRatio(c1) > 0.2 || upperRatio(c2) > 0.2 || upperRatio(c) > 0.2) return null;
    // Each open within previous body
    if (c2.o > c1.c || c2.o < c1.o) return null;
    if (c.o > c2.c || c.o < c2.o) return null;
    return { type: 'Three_White_Soldiers', direction: 'bullish', strength: 4 };
  },

  Three_Black_Crows: (c, data, idx) => {
    if (idx < 2) return null;
    const c1 = data[idx - 2], c2 = data[idx - 1];
    if (!isBearish(c1) || !isBearish(c2) || !isBearish(c)) return null;
    if (c1.c <= c2.c || c2.c <= c.c) return null;
    if (lowerRatio(c1) > 0.2 || lowerRatio(c2) > 0.2 || lowerRatio(c) > 0.2) return null;
    if (c2.o < c1.c || c2.o > c1.o) return null;
    if (c.o < c2.c || c.o > c2.o) return null;
    return { type: 'Three_Black_Crows', direction: 'bearish', strength: 4 };
  },

  Three_Inside_Up: (c, data, idx) => {
    if (idx < 2) return null;
    const c1 = data[idx - 2], c2 = data[idx - 1];
    // Harami + break above
    if (!isBearish(c1) || !isBullish(c2)) return null;
    if (c2.o < c1.c || c2.c > c1.o) return null; // c2 inside c1
    if (!isBullish(c) || c.c <= c1.h) return null; // breaks above
    return { type: 'Three_Inside_Up', direction: 'bullish', strength: 3 };
  },

  Three_Inside_Down: (c, data, idx) => {
    if (idx < 2) return null;
    const c1 = data[idx - 2], c2 = data[idx - 1];
    if (!isBullish(c1) || !isBearish(c2)) return null;
    if (c2.o > c1.c || c2.c < c1.o) return null;
    if (!isBearish(c) || c.c >= c1.l) return null;
    return { type: 'Three_Inside_Down', direction: 'bearish', strength: 3 };
  },

  Three_Outside_Up: (c, data, idx) => {
    if (idx < 2) return null;
    const c1 = data[idx - 2];
    const c2 = data[idx - 1];
    // Engulfing bullish + confirmation
    if (!isBearish(c1) || !isBullish(c2)) return null;
    if (c2.c <= c1.o || c2.o >= c1.c) return null;
    if (!isBullish(c) || c.c <= c2.c) return null;
    return { type: 'Three_Outside_Up', direction: 'bullish', strength: 4 };
  },

  Three_Outside_Down: (c, data, idx) => {
    if (idx < 2) return null;
    const c1 = data[idx - 2];
    const c2 = data[idx - 1];
    if (!isBullish(c1) || !isBearish(c2)) return null;
    if (c2.c >= c1.o || c2.o <= c1.c) return null;
    if (!isBearish(c) || c.c >= c2.c) return null;
    return { type: 'Three_Outside_Down', direction: 'bearish', strength: 4 };
  },

  Rising_Three_Methods: (c, data, idx) => {
    if (idx < 4) return null;
    const c0 = data[idx - 4], c1 = data[idx - 3], c2 = data[idx - 2], c3 = data[idx - 1];
    if (!isBullish(c0)) return null;
    const rangeMax = c0.h, rangeMin = c0.l;
    for (let i = 1; i <= 3; i++) {
      const ci = data[idx - 4 + i];
      if (ci.h > rangeMax || ci.l < rangeMin) return null;
    }
    if (!isBullish(c) || c.c <= c0.c) return null;
    return { type: 'Rising_Three_Methods', direction: 'bullish', strength: 3 };
  },

  Falling_Three_Methods: (c, data, idx) => {
    if (idx < 4) return null;
    const c0 = data[idx - 4], c1 = data[idx - 3], c2 = data[idx - 2], c3 = data[idx - 1];
    if (!isBearish(c0)) return null;
    const rangeMax = c0.h, rangeMin = c0.l;
    for (let i = 1; i <= 3; i++) {
      const ci = data[idx - 4 + i];
      if (ci.h > rangeMax || ci.l < rangeMin) return null;
    }
    if (!isBearish(c) || c.c >= c0.c) return null;
    return { type: 'Falling_Three_Methods', direction: 'bearish', strength: 3 };
  },
};

// ==============================
// TREND DETECTION
// ==============================
function detectTrend(data, idx, lookback) {
  if (idx < lookback) return 'neutral';
  let ups = 0, downs = 0;
  for (let i = idx - lookback + 1; i <= idx; i++) {
    if (data[i].c > data[i - 1].c) ups++;
    else if (data[i].c < data[i - 1].c) downs++;
  }
  if (ups > downs * 1.8) return 'up';
  if (downs > ups * 1.8) return 'down';
  return 'neutral';
}

// ==============================
// MASTER DETECTOR — runs all 42 patterns
// ==============================
function detectAllCandlestick(candle, data, idx) {
  const results = [];

  // Single candle patterns
  for (const [name, fn] of Object.entries(SINGLE)) {
    const result = fn(candle, data, idx);
    if (result) results.push({ category: 'single', name, ...result });
  }

  // Double candle patterns
  for (const [name, fn] of Object.entries(DOUBLE)) {
    const result = fn(candle, data, idx);
    if (result) results.push({ category: 'double', name, ...result });
  }

  // Triple candle patterns
  for (const [name, fn] of Object.entries(TRIPLE)) {
    const result = fn(candle, data, idx);
    if (result) results.push({ category: 'triple', name, ...result });
  }

  return results;
}

// ==============================
// EXPORT
// ==============================
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    detectAllCandlestick,
    body, upperShadow, lowerShadow, totalRange,
    isBullish, isBearish, bodyRatio, upperRatio, lowerRatio,
    gapUp, gapDown, avgBody, detectTrend,
    SINGLE, DOUBLE, TRIPLE,
  };
}
