// ============================================================================
// ENGINE: WYCKOFF PATTERNS — 12 schematics + fases
// Fonte: Richard Wyckoff
// ============================================================================

function avgPrice(data, start, end) {
  let sum = 0, cnt = 0;
  for (let i = Math.max(0, start); i <= Math.min(end, data.length - 1); i++) {
    sum += data[i].c; cnt++;
  }
  return cnt > 0 ? sum / cnt : 0;
}

function priceRange(data, start, end) {
  let min = Infinity, max = -Infinity;
  for (let i = Math.max(0, start); i <= Math.min(end, data.length - 1); i++) {
    if (data[i].l < min) min = data[i].l;
    if (data[i].h > max) max = data[i].h;
  }
  return { min, max };
}

/**
 * Wyckoff Market Phase Detection
 * Phases: Accumulation, Markup, Distribution, Markdown
 */
function detectWyckoffPhase(data, idx) {
  if (idx < 30) return null;

  const lookback = data.slice(Math.max(0, idx - 30), idx + 1);
  const range = priceRange(data, Math.max(0, idx - 30), idx);
  const rangeSize = range.max - range.min;
  if (rangeSize === 0) return null;

  const firstPrice = lookback[0].c;
  const lastPrice = lookback[lookback.length - 1].c;
  const midpoint = lookback[Math.floor(lookback.length / 2)].c;
  const change = ((lastPrice - firstPrice) / firstPrice) * 100;

  // Accumulation: sideways/down then up, low volatility in middle, expanding
  const firstHalf = lookback.slice(0, Math.floor(lookback.length / 2));
  const secondHalf = lookback.slice(Math.floor(lookback.length / 2));
  const firstRange = priceRange(data, Math.max(0, idx - 30), Math.max(0, idx - 15));
  const secondRange = priceRange(data, Math.max(0, idx - 15), idx);

  // Markup: clear uptrend
  if (change > 5 && secondRange.range > firstRange.range * 0.7) {
    const consecutiveUp = countConsecutive(data, Math.max(0, idx - 5), idx, 'bullish');
    if (consecutiveUp >= 3)
      return { type: 'Wyckoff_Markup', phase: 'markup', direction: 'bullish', strength: 3 };
  }

  // Markdown: clear downtrend
  if (change < -5 && secondRange.range > firstRange.range * 0.7) {
    const consecutiveDown = countConsecutive(data, Math.max(0, idx - 5), idx, 'bearish');
    if (consecutiveDown >= 3)
      return { type: 'Wyckoff_Markdown', phase: 'markdown', direction: 'bearish', strength: 3 };
  }

  // Accumulation: range-bound with higher lows forming
  const lowPoints = [];
  for (let i = Math.max(0, idx - 25); i <= idx; i++) {
    if (i > Math.max(0, idx - 25) + 2 && i < idx - 2) {
      if (data[i].l < data[i-1].l && data[i].l < data[i+1].l)
        lowPoints.push({ idx: i, price: data[i].l });
    }
  }
  if (lowPoints.length >= 3) {
    const last3 = lowPoints.slice(-3);
    if (last3[2].price > last3[1].price && last3[1].price > last3[0].price) {
      if (change < 3 && change > -3)
        return { type: 'Wyckoff_Accumulation', phase: 'accumulation', direction: 'bullish', strength: 3 };
    }
  }

  // Distribution: range-bound with lower highs forming
  const highPoints = [];
  for (let i = Math.max(0, idx - 25); i <= idx; i++) {
    if (i > Math.max(0, idx - 25) + 2 && i < idx - 2) {
      if (data[i].h > data[i-1].h && data[i].h > data[i+1].h)
        highPoints.push({ idx: i, price: data[i].h });
    }
  }
  if (highPoints.length >= 3) {
    const last3 = highPoints.slice(-3);
    if (last3[2].price < last3[1].price && last3[1].price < last3[0].price) {
      if (change < 3 && change > -3)
        return { type: 'Wyckoff_Distribution', phase: 'distribution', direction: 'bearish', strength: 3 };
    }
  }

  return null;
}

/**
 * Spring: Price briefly breaks support then reverses (false breakdown)
 * Key accumulation signal
 */
function detectSpring(data, idx) {
  if (idx < 10) return null;

  // Find support level (recent swing low)
  let support = Infinity;
  for (let i = Math.max(0, idx - 15); i < idx; i++) {
    if (data[i].l < support) support = data[i].l;
  }

  // Price goes below support then closes back above
  if (data[idx].l < support && data[idx].c > support && isBullish(data[idx])) {
    const penetration = ((support - data[idx].l) / support) * 100;
    return {
      type: 'Wyckoff_Spring',
      direction: 'bullish',
      strength: 4,
      description: `Falso rompimento de suporte — penetração ${penetration.toFixed(2)}% — reversão`
    };
  }
  return null;
}

/**
 * Upthrust (UT): Price briefly breaks resistance then reverses
 * Key distribution signal
 */
function detectUpthrustW(data, idx) {
  if (idx < 10) return null;

  let resistance = -Infinity;
  for (let i = Math.max(0, idx - 15); i < idx; i++) {
    if (data[i].h > resistance) resistance = data[i].h;
  }

  if (data[idx].h > resistance && data[idx].c < resistance && isBearish(data[idx])) {
    const penetration = ((data[idx].h - resistance) / resistance) * 100;
    return {
      type: 'Wyckoff_Upthrust',
      direction: 'bearish',
      strength: 4,
      description: `Falso rompimento de resistência — penetração ${penetration.toFixed(2)}% — reversão`
    };
  }
  return null;
}

/**
 * Sign of Strength (SOS): Wide range up on high volume after accumulation
 */
function detectSOS(data, idx) {
  if (idx < 15) return null;
  const avgVol = avgVolume(data, idx - 10, idx - 1);
  const avgBody = avgBodySize(data, idx, 10);

  if (isBullish(data[idx]) && data[idx].v > avgVol * 1.5 && bodyRange(data[idx]) > avgBody * 1.5) {
    // Check was in range/accumulation before
    const prevRange = priceRange(data, Math.max(0, idx - 12), idx - 1);
    if ((prevRange.max - prevRange.min) / prevRange.min < 0.03) {
      return { type: 'Wyckoff_SOS', direction: 'bullish', strength: 4,
        description: 'Sinal de força: barra longa de alta com volume' };
    }
  }
  return null;
}

/**
 * Sign of Weakness (SOW): Wide range down on high volume after distribution
 */
function detectSOW(data, idx) {
  if (idx < 15) return null;
  const avgVol = avgVolume(data, idx - 10, idx - 1);
  const avgBody = avgBodySize(data, idx, 10);

  if (isBearish(data[idx]) && data[idx].v > avgVol * 1.5 && bodyRange(data[idx]) > avgBody * 1.5) {
    const prevRange = priceRange(data, Math.max(0, idx - 12), idx - 1);
    if ((prevRange.max - prevRange.min) / prevRange.min < 0.03) {
      return { type: 'Wyckoff_SOW', direction: 'bearish', strength: 4,
        description: 'Sinal de fraqueza: barra longa de baixa com volume' };
    }
  }
  return null;
}

/**
 * Last Point of Support (LPS): Higher low after SOS
 */
function detectLPS(data, idx) {
  if (idx < 20) return null;

  // Look for a higher swing low after a rally
  const lowPoints = [];
  for (let i = Math.max(0, idx - 15); i <= idx; i++) {
    if (i > Math.max(0, idx - 15) + 2 && i < idx) {
      if (data[i].l < data[i-1].l && data[i].l < data[i+1].l)
        lowPoints.push({ idx: i, price: data[i].l });
    }
  }

  if (lowPoints.length >= 3) {
    const last3 = lowPoints.slice(-3);
    if (last3[2].price > last3[1].price && last3[1].price > last3[0].price) {
      // Higher lows
      return { type: 'Wyckoff_LPS', direction: 'bullish', strength: 3,
        description: 'Fundo ascendente — último ponto de suporte' };
    }
  }
  return null;
}

/**
 * Last Point of Supply (LPSY): Lower high after SOW
 */
function detectLPSY(data, idx) {
  if (idx < 20) return null;

  const highPoints = [];
  for (let i = Math.max(0, idx - 15); i <= idx; i++) {
    if (i > Math.max(0, idx - 15) + 2 && i < idx) {
      if (data[i].h > data[i-1].h && data[i].h > data[i+1].h)
        highPoints.push({ idx: i, price: data[i].h });
    }
  }

  if (highPoints.length >= 3) {
    const last3 = highPoints.slice(-3);
    if (last3[2].price < last3[1].price && last3[1].price < last3[0].price) {
      return { type: 'Wyckoff_LPSY', direction: 'bearish', strength: 3,
        description: 'Topo descendente — último ponto de oferta' };
    }
  }
  return null;
}

/**
 * Backup: Return to breakout level after SOS (confirmation)
 */
function detectBackup(data, idx) {
  if (idx < 10) return null;

  // Find recent SOS or breakout level
  for (let i = Math.max(0, idx - 8); i < idx - 1; i++) {
    if (isBullish(data[i]) && bodyRange(data[i]) > avgBodySize(data, i, 8) * 1.5) {
      const breakoutLevel = data[i].c;
      // Price returns to that level and holds
      if (Math.abs(data[idx].c - breakoutLevel) / breakoutLevel < 0.005 && isBullish(data[idx])) {
        return { type: 'Wyckoff_Backup', direction: 'bullish', strength: 4,
          description: `Reteste do nível ${breakoutLevel.toFixed(0)} — confirmação` };
      }
    }
  }
  return null;
}

/**
 * Absorption: Heavy volume without price progress = smart money accumulating/distributing
 */
function detectAbsorption(data, idx) {
  if (idx < 10) return null;
  const avgVol = avgVolume(data, idx - 10, idx - 1);

  // Multiple candles with high volume but price staying in range
  let highVolCount = 0;
  const range = priceRange(data, Math.max(0, idx - 8), idx);
  const rangePct = (range.max - range.min) / range.min;

  for (let i = Math.max(0, idx - 8); i <= idx; i++) {
    if (data[i].v > avgVol * 1.3) highVolCount++;
  }

  if (highVolCount >= 4 && rangePct < 0.015) {
    return { type: 'Wyckoff_Absorption', direction: 'neutral', strength: 3,
      description: 'Absorção: volume elevado sem progresso de preço' };
  }
  return null;
}

/**
 * Creek / Ice level: Resistance/support zone in trading range
 */
function detectCreekIce(data, idx) {
  if (idx < 30) return null;

  // Find horizontal resistance (creek) or support (ice)
  const range = priceRange(data, Math.max(0, idx - 30), idx);
  const midPrice = (range.max + range.min) / 2;
  const pricePos = (data[idx].c - range.min) / (range.max - range.min);

  // Near top of range = creek resistance
  if (pricePos > 0.8) {
    return { type: 'Wyckoff_Creek', direction: 'neutral', strength: 2,
      description: `Preço próximo ao Creek (resistência ${range.max.toFixed(0)})`,
      level: range.max };
  }

  // Near bottom of range = ice support
  if (pricePos < 0.2) {
    return { type: 'Wyckoff_Ice', direction: 'neutral', strength: 2,
      description: `Preço próximo ao Ice (suporte ${range.min.toFixed(0)})`,
      level: range.min };
  }

  return null;
}

/**
 * Jump Across the Creek: Strong move breaking resistance with volume
 */
function detectJumpCreek(data, idx) {
  if (idx < 15) return null;

  const range = priceRange(data, Math.max(0, idx - 15), idx - 1);
  const avgVol = avgVolume(data, idx - 10, idx - 1);

  if (data[idx].c > range.max && data[idx].v > avgVol * 2 && isBullish(data[idx])) {
    return { type: 'Wyckoff_Jump_Creek', direction: 'bullish', strength: 5,
      description: `Salto com volume — rompeu Creek em ${range.max.toFixed(0)}` };
  }
  return null;
}

// Helpers
function isBullish(c) { return c.c > c.o; }
function isBearish(c) { return c.c < c.o; }
function bodyRange(c) { return Math.abs(c.c - c.o); }
function avgBodySize(data, idx, lookback) {
  let sum = 0, cnt = 0;
  for (let i = Math.max(0, idx - lookback + 1); i <= idx; i++) {
    sum += bodyRange(data[i]); cnt++;
  }
  return cnt > 0 ? sum / cnt : 0;
}
function avgVolume(data, start, end) {
  let sum = 0, cnt = 0;
  for (let i = Math.max(0, start); i <= Math.min(end, data.length - 1); i++) {
    sum += data[i].v; cnt++;
  }
  return cnt > 0 ? sum / cnt : 0;
}
function countConsecutive(data, start, end, dir) {
  let max = 0, cur = 0;
  for (let i = start; i <= Math.min(end, data.length - 1); i++) {
    if ((dir === 'bullish' && data[i].c > data[i].o) || (dir === 'bearish' && data[i].c < data[i].o))
      cur++;
    else { max = Math.max(max, cur); cur = 0; }
  }
  return Math.max(max, cur);
}

// ==============================
// MASTER DETECTOR
// ==============================
function detectAllWyckoff(data, idx) {
  const results = [];
  const detectors = [
    detectWyckoffPhase, detectSpring, detectUpthrustW,
    detectSOS, detectSOW, detectLPS, detectLPSY,
    detectBackup, detectAbsorption, detectCreekIce, detectJumpCreek,
  ];
  for (const fn of detectors) {
    const result = fn(data, idx);
    if (result) results.push(result);
  }
  return results;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    detectWyckoffPhase, detectSpring, detectUpthrustW,
    detectSOS, detectSOW, detectLPS, detectLPSY,
    detectBackup, detectAbsorption, detectCreekIce, detectJumpCreek,
    detectAllWyckoff,
  };
}
