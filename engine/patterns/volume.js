// ============================================================================
// ENGINE: VOLUME SPREAD ANALYSIS — 8 sinais de VSA
// Fonte: Tom Williams, Richard Wyckoff
// ============================================================================

function avgVolume(data, start, end) {
  let sum = 0, cnt = 0;
  for (let i = Math.max(0, start); i <= Math.min(end, data.length - 1); i++) {
    sum += data[i].v; cnt++;
  }
  return cnt > 0 ? sum / cnt : 0;
}

function bodyRange(c) { return Math.abs(c.c - c.o); }
function totalRange(c) { return c.h - c.l; }

/**
 * Buying Climax (BC): Big range up + extreme volume = exhaustion
 */
function detectBuyingClimax(data, idx) {
  if (idx < 10) return null;
  const avgVol = avgVolume(data, idx - 10, idx - 1);
  const avgBody = bodyRange(data[idx]) > 0 ? avgBodySize(data, idx, 10) : 0;

  if (data[idx].v > avgVol * 2.5 && bodyRange(data[idx]) > avgBody * 1.5) {
    // Check if candle closed near high (selling into strength)
    const upperWick = data[idx].h - Math.max(data[idx].o, data[idx].c);
    const range = totalRange(data[idx]);
    if (range > 0 && upperWick / range > 0.2) {
      return { type: 'Buying_Climax', direction: 'bearish', strength: 4,
        description: `Volume ${(data[idx].v/1000).toFixed(0)}K, ${((upperWick/range)*100).toFixed(0)}% rejeição` };
    }
  }
  return null;
}

/**
 * Selling Climax (SC): Big range down + extreme volume = exhaustion
 */
function detectSellingClimax(data, idx) {
  if (idx < 10) return null;
  const avgVol = avgVolume(data, idx - 10, idx - 1);
  const avgBody = avgBodySize(data, idx, 10);

  if (data[idx].v > avgVol * 2.5 && bodyRange(data[idx]) > avgBody * 1.5) {
    const lowerWick = Math.min(data[idx].o, data[idx].c) - data[idx].l;
    const range = totalRange(data[idx]);
    if (range > 0 && lowerWick / range > 0.2) {
      return { type: 'Selling_Climax', direction: 'bullish', strength: 4,
        description: `Volume ${(data[idx].v/1000).toFixed(0)}K, ${((lowerWick/range)*100).toFixed(0)}% rejeição` };
    }
  }
  return null;
}

/**
 * No Demand: Narrow spread + low volume in uptrend
 */
function detectNoDemand(data, idx) {
  if (idx < 10) return null;
  const avgVol = avgVolume(data, idx - 10, idx - 1);
  const avgBody = avgBodySize(data, idx, 10);

  if (data[idx].v < avgVol * 0.5 && bodyRange(data[idx]) < avgBody * 0.5 && isBullish(data[idx])) {
    const trend = detectTrend(data, idx, 8);
    if (trend === 'up')
      return { type: 'No_Demand', direction: 'bearish', strength: 3,
        description: 'Barra estreita + baixo volume em tendência de alta' };
  }
  return null;
}

/**
 * No Supply: Narrow spread + low volume in downtrend
 */
function detectNoSupply(data, idx) {
  if (idx < 10) return null;
  const avgVol = avgVolume(data, idx - 10, idx - 1);
  const avgBody = avgBodySize(data, idx, 10);

  if (data[idx].v < avgVol * 0.5 && bodyRange(data[idx]) < avgBody * 0.5 && isBearish(data[idx])) {
    const trend = detectTrend(data, idx, 8);
    if (trend === 'down')
      return { type: 'No_Supply', direction: 'bullish', strength: 3,
        description: 'Barra estreita + baixo volume em tendência de baixa' };
  }
  return null;
}

/**
 * Stopping Volume: Volume spike but narrow range = absorption
 */
function detectStoppingVolume(data, idx) {
  if (idx < 10) return null;
  const avgVol = avgVolume(data, idx - 10, idx - 1);
  const avgRange = avgRangeSize(data, idx, 10);

  if (data[idx].v > avgVol * 2 && totalRange(data[idx]) < avgRange * 0.7) {
    return { type: 'Stopping_Volume', direction: 'neutral', strength: 2,
      description: 'Volume alto + range estreito: absorção em andamento' };
  }
  return null;
}

/**
 * Effort vs Result: Volume high but price barely moves (divergence)
 */
function detectEffortVsResult(data, idx) {
  if (idx < 10) return null;
  const avgVol = avgVolume(data, idx - 10, idx - 1);
  const avgBody = avgBodySize(data, idx, 10);

  if (data[idx].v > avgVol * 1.5 && bodyRange(data[idx]) < avgBody * 0.7) {
    // Effort (volume) without result (price movement) = potential reversal
    return { type: 'Effort_vs_Result', direction: 'neutral', strength: 2,
      description: 'Esforço sem resultado: volume alto sem movimento proporcional' };
  }
  return null;
}

/**
 * Upthrust: Price spikes up but closes down = selling
 */
function detectUpthrust(data, idx) {
  if (idx < 5) return null;
  if (!isBearish(data[idx])) return null;

  const upperWick = data[idx].h - data[idx].o;
  const range = totalRange(data[idx]);

  if (range > 0 && upperWick / range > 0.6 && data[idx].v > avgVolume(data, idx - 5, idx) * 1.2) {
    return { type: 'Upthrust', direction: 'bearish', strength: 3,
      description: 'Impulso falso de alta com fechamento fraco' };
  }
  return null;
}

/**
 * Test: Low volume test of support/resistance after a move
 * Confirms the level holds
 */
function detectVolumeTest(data, idx) {
  if (idx < 5) return null;
  const avgVol = avgVolume(data, idx - 10, idx - 1);

  // Test of recent low (bullish)
  const recentLow = Math.min(...data.slice(Math.max(0, idx - 10), idx).map(d => d.l));
  if (data[idx].l <= recentLow * 1.002 && data[idx].v < avgVol * 0.6 && isBullish(data[idx])) {
    return { type: 'Test_Support_Passed', direction: 'bullish', strength: 3,
      description: `Teste de suporte ${recentLow.toFixed(0)} com baixo volume` };
  }

  // Test of recent high (bearish)
  const recentHigh = Math.max(...data.slice(Math.max(0, idx - 10), idx).map(d => d.h));
  if (data[idx].h >= recentHigh * 0.998 && data[idx].v < avgVol * 0.6 && isBearish(data[idx])) {
    return { type: 'Test_Resistance_Passed', direction: 'bearish', strength: 3,
      description: `Teste de resistência ${recentHigh.toFixed(0)} com baixo volume` };
  }

  return null;
}

// Helpers
function isBullish(c) { return c.c > c.o; }
function isBearish(c) { return c.c < c.o; }
function avgBodySize(data, idx, lookback) {
  let sum = 0, cnt = 0;
  for (let i = Math.max(0, idx - lookback + 1); i <= idx; i++) {
    sum += bodyRange(data[i]); cnt++;
  }
  return cnt > 0 ? sum / cnt : 0;
}
function avgRangeSize(data, idx, lookback) {
  let sum = 0, cnt = 0;
  for (let i = Math.max(0, idx - lookback + 1); i <= idx; i++) {
    sum += totalRange(data[i]); cnt++;
  }
  return cnt > 0 ? sum / cnt : 0;
}
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
function detectAllVolume(data, idx) {
  const results = [];
  const detectors = [
    detectBuyingClimax, detectSellingClimax, detectNoDemand,
    detectNoSupply, detectStoppingVolume, detectEffortVsResult,
    detectUpthrust, detectVolumeTest,
  ];
  for (const fn of detectors) {
    const result = fn(data, idx);
    if (result) results.push(result);
  }
  return results;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    detectBuyingClimax, detectSellingClimax, detectNoDemand,
    detectNoSupply, detectStoppingVolume, detectEffortVsResult,
    detectUpthrust, detectVolumeTest, detectAllVolume,
  };
}
