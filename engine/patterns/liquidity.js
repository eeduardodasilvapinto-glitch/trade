// ============================================================================
// ENGINE: LIQUIDITY & MANIPULATION PATTERNS — 12 padrões ICT/SMC
// ============================================================================

/**
 * Fair Value Gap (FVG / Imbalance)
 * 3-candle pattern where candle 1 and 3 don't overlap
 * Price tends to return to fill the gap
 */
function detectFVG(data, idx) {
  if (idx < 2) return null;
  const c1 = data[idx - 2], c2 = data[idx - 1], c3 = data[idx];

  // Bullish FVG: candle 1 high < candle 3 low (gap up)
  if (c1.h < c3.l) {
    const gapTop = c3.l;
    const gapBottom = c1.h;
    const filled = data[idx].l <= gapTop;
    return {
      type: 'FVG_Bullish',
      direction: 'bullish',
      strength: filled ? 1 : 3,
      gapTop, gapBottom,
      filled,
      description: `Gap ${(c3.l - c1.h).toFixed(0)} pts, ${filled ? 'preenchido' : 'aberto'}`
    };
  }

  // Bearish FVG: candle 1 low > candle 3 high (gap down)
  if (c1.l > c3.h) {
    const gapTop = c1.l;
    const gapBottom = c3.h;
    const filled = data[idx].h >= gapBottom;
    return {
      type: 'FVG_Bearish',
      direction: 'bearish',
      strength: filled ? 1 : 3,
      gapTop, gapBottom,
      filled,
      description: `Gap ${(c1.l - c3.h).toFixed(0)} pts, ${filled ? 'preenchido' : 'aberto'}`
    };
  }

  return null;
}

/**
 * Order Block: Last opposite-color candle before a strong impulse move
 */
function detectOrderBlock(data, idx) {
  if (idx < 5) return null;

  // Look for a strong move (3+ consecutive same-color candles)
  const c = data[idx];
  let direction = null;

  // Check last 4 candles for strong bullish sequence
  if (idx >= 3 &&
      isBullish(data[idx]) && isBullish(data[idx-1]) && isBullish(data[idx-2]) &&
      isBearish(data[idx-3])) {
    direction = 'bullish';
    const ob = data[idx - 3];
    const obHigh = ob.h, obLow = ob.l;
    return { type: 'Order_Block_Bullish', direction: 'bullish', strength: 3,
      obHigh, obLow, obClose: ob.c, obOpen: ob.o };
  }

  // Strong bearish sequence
  if (idx >= 3 &&
      isBearish(data[idx]) && isBearish(data[idx-1]) && isBearish(data[idx-2]) &&
      isBullish(data[idx-3])) {
    direction = 'bearish';
    const ob = data[idx - 3];
    const obHigh = ob.h, obLow = ob.l;
    return { type: 'Order_Block_Bearish', direction: 'bearish', strength: 3,
      obHigh, obLow, obClose: ob.c, obOpen: ob.o };
  }

  return null;
}

/**
 * Liquidity Sweep: Price takes out previous high/low then reverses
 */
function detectLiquiditySweep(data, idx) {
  if (idx < 5) return null;

  // Find recent swing high/low before idx
  let recentHigh = -Infinity, recentLow = Infinity;
  let recentHighIdx = -1, recentLowIdx = -1;

  for (let i = Math.max(0, idx - 10); i < idx; i++) {
    if (data[i].h > recentHigh) { recentHigh = data[i].h; recentHighIdx = i; }
    if (data[i].l < recentLow) { recentLow = data[i].l; recentLowIdx = i; }
  }

  // Sweep of highs (price takes out high then closes below)
  if (data[idx].h > recentHigh && data[idx].c < recentHigh && isBearish(data[idx])) {
    return { type: 'Liquidity_Sweep_High', direction: 'bearish', strength: 4,
      sweptLevel: recentHigh, sweptIdx: recentHighIdx,
      description: `Caça-stops em ${recentHigh.toFixed(0)}` };
  }

  // Sweep of lows
  if (data[idx].l < recentLow && data[idx].c > recentLow && isBullish(data[idx])) {
    return { type: 'Liquidity_Sweep_Low', direction: 'bullish', strength: 4,
      sweptLevel: recentLow, sweptIdx: recentLowIdx,
      description: `Caça-stops em ${recentLow.toFixed(0)}` };
  }

  return null;
}

/**
 * Market Structure Shift (Change of Character — CHoCH)
 * Price breaks previous market structure
 */
function detectStructureShift(data, idx) {
  if (idx < 10) return null;

  // Find recent swing points
  let lastHH = -Infinity, lastHL = Infinity;
  let lastLH = -Infinity, lastLL = Infinity;
  let prevHH = -Infinity, prevLL = Infinity;

  for (let i = Math.max(0, idx - 20); i < idx; i++) {
    // Simplified: use 3-candle local swings
    if (i >= 3 && i < idx && data[i].h > data[i-1].h && data[i].h > data[i+1].h) {
      prevHH = lastHH;
      lastHH = data[i].h;
    }
    if (i >= 3 && i < idx && data[i].l < data[i-1].l && data[i].l < data[i+1].l) {
      prevLL = lastLL;
      lastLL = data[i].l;
    }
  }

  // Bullish CHoCH: price breaks above last lower high (in a downtrend)
  if (lastHH > 0 && prevHH > 0 && lastHH < prevHH) {
    // Was downtrend (lower highs)
    if (data[idx].c > lastHH && data[idx].c > prevHH * 0.995) {
      return { type: 'CHoCH_Bullish', direction: 'bullish', strength: 5,
        description: 'Mudança de estrutura: baixista → altista' };
    }
  }

  // Bearish CHoCH: price breaks below last higher low (in uptrend)
  if (lastLL > 0 && prevLL > 0 && lastLL > prevLL) {
    if (data[idx].c < lastLL && data[idx].c < prevLL * 1.005) {
      return { type: 'CHoCH_Bearish', direction: 'bearish', strength: 5,
        description: 'Mudança de estrutura: altista → baixista' };
    }
  }

  return null;
}

/**
 * Break of Structure (BOS): Continuation
 */
function detectBOS(data, idx) {
  if (idx < 10) return null;

  // Bullish BOS: price breaks above recent high in an uptrend
  let recentHigh = -Infinity;
  for (let i = Math.max(0, idx - 15); i < idx; i++) {
    if (data[i].h > recentHigh) recentHigh = data[i].h;
  }

  if (data[idx].c > recentHigh && isBullish(data[idx])) {
    // Check if in uptrend
    const trendUp = detectTrend(data, idx, 8) === 'up';
    return {
      type: 'BOS_Bullish',
      direction: 'bullish',
      strength: trendUp ? 3 : 2,
      description: `Rompimento de máxima ${recentHigh.toFixed(0)}`
    };
  }

  // Bearish BOS
  let recentLow = Infinity;
  for (let i = Math.max(0, idx - 15); i < idx; i++) {
    if (data[i].l < recentLow) recentLow = data[i].l;
  }

  if (data[idx].c < recentLow && isBearish(data[idx])) {
    const trendDown = detectTrend(data, idx, 8) === 'down';
    return {
      type: 'BOS_Bearish',
      direction: 'bearish',
      strength: trendDown ? 3 : 2,
      description: `Rompimento de mínima ${recentLow.toFixed(0)}`
    };
  }

  return null;
}

/**
 * Judas Swing: False open direction then real move
 * On higher TF, the first candle goes one way, then reverses
 */
function detectJudasSwing(data, idx) {
  if (idx < 10) return null;

  // Look for open candle making a high/low then reversing
  const firstCandle = data[idx - 5];
  if (!firstCandle) return null;

  // Candle goes above open but closes below
  if (firstCandle.h > firstCandle.o * 1.003 && firstCandle.c < firstCandle.o) {
    // Check if rest follow
    let bearishCount = 0;
    for (let i = idx - 4; i <= idx; i++) if (isBearish(data[i])) bearishCount++;
    if (bearishCount >= 3)
      return { type: 'Judas_Swing_Bearish', direction: 'bearish', strength: 3 };
  }

  if (firstCandle.l < firstCandle.o * 0.997 && firstCandle.c > firstCandle.o) {
    let bullishCount = 0;
    for (let i = idx - 4; i <= idx; i++) if (isBullish(data[i])) bullishCount++;
    if (bullishCount >= 3)
      return { type: 'Judas_Swing_Bullish', direction: 'bullish', strength: 3 };
  }

  return null;
}

/**
 * Turtle Soup: False breakout trapping breakout traders
 * Price barely breaks a level then immediately reverses
 */
function detectTurtleSoup(data, idx) {
  if (idx < 5) return null;

  // Recent swing points
  let recentHigh = -Infinity, recentLow = Infinity;
  for (let i = Math.max(0, idx - 20); i < idx - 2; i++) {
    if (data[i].h > recentHigh) recentHigh = data[i].h;
    if (data[i].l < recentLow) recentLow = data[i].l;
  }

  // False break above high
  if (data[idx - 1].c > recentHigh && data[idx].c < recentHigh && isBearish(data[idx])) {
    return { type: 'Turtle_Soup_Short', direction: 'bearish', strength: 4,
      description: `Falso rompimento de alta — armadilha` };
  }

  // False break below low
  if (data[idx - 1].c < recentLow && data[idx].c > recentLow && isBullish(data[idx])) {
    return { type: 'Turtle_Soup_Long', direction: 'bullish', strength: 4,
      description: `Falso rompimento de baixa — armadilha` };
  }

  return null;
}

/**
 * Equal Highs/Lows: Magnet for liquidity
 */
function detectEqualLevels(data, idx) {
  if (idx < 5) return null;

  // Equal Highs within tolerance
  let equalHighs = [];
  for (let i = Math.max(0, idx - 20); i <= idx; i++) {
    for (let j = i + 1; j <= idx; j++) {
      if (Math.abs(data[i].h - data[j].h) / data[i].h < 0.0005) {
        equalHighs.push({ i, j, price: data[i].h });
      }
    }
  }

  if (equalHighs.length >= 2 && data[idx].h > equalHighs[0].price * 1.0005 && isBearish(data[idx])) {
    return { type: 'Equal_Highs_Swept', direction: 'bearish', strength: 3,
      description: `Liquidez em ${equalHighs[0].price.toFixed(0)} varrida` };
  }

  let equalLows = [];
  for (let i = Math.max(0, idx - 20); i <= idx; i++) {
    for (let j = i + 1; j <= idx; j++) {
      if (Math.abs(data[i].l - data[j].l) / data[i].l < 0.0005) {
        equalLows.push({ i, j, price: data[i].l });
      }
    }
  }

  if (equalLows.length >= 2 && data[idx].l < equalLows[0].price * 0.9995 && isBullish(data[idx])) {
    return { type: 'Equal_Lows_Swept', direction: 'bullish', strength: 3,
      description: `Liquidez em ${equalLows[0].price.toFixed(0)} varrida` };
  }

  if (equalHighs.length >= 2) {
    return { type: 'Equal_Highs_Building', direction: 'bearish', strength: 1,
      description: `Liquidez acumulando em ${equalHighs[0].price.toFixed(0)}` };
  }

  if (equalLows.length >= 2) {
    return { type: 'Equal_Lows_Building', direction: 'bullish', strength: 1,
      description: `Liquidez acumulando em ${equalLows[0].price.toFixed(0)}` };
  }

  return null;
}

/**
 * Breaker Block: Old order block that got violated and reversed role
 */
function detectBreakerBlock(data, idx) {
  if (idx < 10) return null;

  // Find an order block that was broken and now acts as opposite
  let obCandles = [];
  for (let i = Math.max(0, idx - 5); i <= idx; i++) {
    for (let j = Math.max(0, i - 15); j < i - 2; j++) {
      if (isBullish(data[i]) && isBearish(data[j])) {
        obCandles.push({ obIdx: j, breakIdx: i, dir: 'bullish' });
      }
      if (isBearish(data[i]) && isBullish(data[j])) {
        obCandles.push({ obIdx: j, breakIdx: i, dir: 'bearish' });
      }
    }
  }

  // If price returns to that broken OB
  for (const ob of obCandles) {
    const obHigh = data[ob.obIdx].h, obLow = data[ob.obIdx].l;
    if (data[idx].l <= obHigh && data[idx].h >= obLow) {
      return {
        type: 'Breaker_Block_' + (ob.dir === 'bullish' ? 'Bearish' : 'Bullish'),
        direction: ob.dir === 'bullish' ? 'bearish' : 'bullish',
        strength: 3,
        description: `Order Block em ${obLow.toFixed(0)}-${obHigh.toFixed(0)} quebrado e revisitado`
      };
    }
  }

  return null;
}

/**
 * Volume Imbalance: Candle with no wick overlap (gap between bodies)
 */
function detectImbalance(data, idx) {
  if (idx < 1) return null;

  // Check if current and previous bodies don't overlap
  const prev = data[idx - 1];
  const prevLow = Math.min(prev.o, prev.c), prevHigh = Math.max(prev.o, prev.c);
  const curLow = Math.min(data[idx].o, data[idx].c), curHigh = Math.max(data[idx].o, data[idx].c);

  if (curLow > prevHigh) {
    return { type: 'Imbalance_Bullish', direction: 'bullish', strength: 2,
      gap: curLow - prevHigh, description: `Desequilíbrio de compra` };
  }

  if (curHigh < prevLow) {
    return { type: 'Imbalance_Bearish', direction: 'bearish', strength: 2,
      gap: prevLow - curHigh, description: `Desequilíbrio de venda` };
  }

  return null;
}

/**
 * Bull/Bear Trap detection
 */
function detectTraps(data, idx) {
  if (idx < 3) return null;

  // Bull trap: breaks high then reverses sharply
  const prevHigh = Math.max(data[idx-2].h, data[idx-1].h);
  if (data[idx].h > prevHigh && isBearish(data[idx]) && data[idx].c < data[idx-1].c) {
    return { type: 'Bull_Trap', direction: 'bearish', strength: 4,
      description: `Armadilha de alta: rompeu ${prevHigh.toFixed(0)} e reverteu` };
  }

  // Bear trap: breaks low then reverses sharply
  const prevLow = Math.min(data[idx-2].l, data[idx-1].l);
  if (data[idx].l < prevLow && isBullish(data[idx]) && data[idx].c > data[idx-1].c) {
    return { type: 'Bear_Trap', direction: 'bullish', strength: 4,
      description: `Armadilha de baixa: rompeu ${prevLow.toFixed(0)} e reverteu` };
  }

  return null;
}

// Helpers
function isBullish(c) { return c.c > c.o; }
function isBearish(c) { return c.c < c.o; }
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
// MASTER DETECTOR
// ==============================
function detectAllLiquidity(data, idx) {
  const results = [];
  const detectors = [
    detectFVG, detectOrderBlock, detectLiquiditySweep,
    detectStructureShift, detectBOS, detectJudasSwing,
    detectTurtleSoup, detectEqualLevels, detectBreakerBlock,
    detectImbalance, detectTraps,
  ];
  for (const fn of detectors) {
    const result = fn(data, idx);
    if (result) results.push(result);
  }
  return results;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    detectFVG, detectOrderBlock, detectLiquiditySweep,
    detectStructureShift, detectBOS, detectJudasSwing,
    detectTurtleSoup, detectEqualLevels, detectBreakerBlock,
    detectImbalance, detectTraps, detectAllLiquidity,
  };
}
