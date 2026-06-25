// ============================================================================
// ENGINE: MASTER SCANNER — Varredura multi-TF de todos os padrões
// ============================================================================

const candlestick = require('./patterns/candlestick');
const chart = require('./patterns/chart');
const harmonic = require('./patterns/harmonic');
const liquidity = require('./patterns/liquidity');
const volume = require('./patterns/volume');
const wyckoff = require('./patterns/wyckoff');

/**
 * Scan ALL patterns across ALL loaded timeframes
 * Returns massive pattern database
 */
function scanAllTimeframes(dataMap) {
  // dataMap = { M5: [...], M15: [...], H1: [...], H4: [...], D1: [...] }
  const allResults = {};

  for (const [tf, data] of Object.entries(dataMap)) {
    console.log(`\n[SCANNER] Timeframe: ${tf} — ${data.length} candles`);

    const tfResults = {
      candlestick: [],
      chart: [],
      harmonic: [],
      liquidity: [],
      volume: [],
      wyckoff: [],
      summary: {},
    };

    // Scan candle by candle
    let totalDetections = 0;

    for (let i = 5; i < data.length; i++) {
      const candle = data[i];

      // Candlestick patterns
      const candResults = candlestick.detectAllCandlestick(candle, data, i);
      for (const r of candResults) {
        tfResults.candlestick.push(createRecord(r, data, i, tf));
        totalDetections++;
      }

      // Chart patterns (only every N candles for performance)
      if (i % 5 === 0 || i === data.length - 1) {
        const chartResults = chart.detectAllChartPatterns(data, i);
        for (const r of chartResults) {
          tfResults.chart.push(createRecord(r, data, i, tf));
          totalDetections++;
        }
      }

      // Harmonic patterns (every 5 candles)
      if (i % 5 === 0) {
        const harmResults = harmonic.detectAllHarmonic(data, i);
        for (const r of harmResults) {
          tfResults.harmonic.push(createRecord(r, data, i, tf));
          totalDetections++;
        }
      }

      // Liquidity patterns
      if (i % 2 === 0) {
        const liqResults = liquidity.detectAllLiquidity(data, i);
        for (const r of liqResults) {
          tfResults.liquidity.push(createRecord(r, data, i, tf));
          totalDetections++;
        }
      }

      // Volume (VSA) patterns
      const volResults = volume.detectAllVolume(data, i);
      for (const r of volResults) {
        tfResults.volume.push(createRecord(r, data, i, tf));
        totalDetections++;
      }

      // Wyckoff patterns (every 10 candles)
      if (i % 10 === 0) {
        const wykResults = wyckoff.detectAllWyckoff(data, i);
        for (const r of wykResults) {
          tfResults.wyckoff.push(createRecord(r, data, i, tf));
          totalDetections++;
        }
      }
    }

    // Summary
    tfResults.summary = {
      totalDetections,
      candlestick: tfResults.candlestick.length,
      chart: tfResults.chart.length,
      harmonic: tfResults.harmonic.length,
      liquidity: tfResults.liquidity.length,
      volume: tfResults.volume.length,
      wyckoff: tfResults.wyckoff.length,
    };

    console.log(`  → ${totalDetections} padrões detectados:`);
    console.log(`     Candlestick: ${tfResults.candlestick.length}`);
    console.log(`     Chart: ${tfResults.chart.length}`);
    console.log(`     Harmonic: ${tfResults.harmonic.length}`);
    console.log(`     Liquidity: ${tfResults.liquidity.length}`);
    console.log(`     Volume: ${tfResults.volume.length}`);
    console.log(`     Wyckoff: ${tfResults.wyckoff.length}`);

    allResults[tf] = tfResults;
  }

  return allResults;
}

/**
 * Create a standardized record for each detected pattern
 */
function createRecord(pattern, data, idx, tf) {
  const candle = data[idx];
  const date = candle.t ? new Date(candle.t) : new Date();

  // Forward performance (what happened after the pattern)
  const forward5 = idx + 5 < data.length ? data[idx + 5].c : null;
  const forward10 = idx + 10 < data.length ? data[idx + 10].c : null;
  const forward20 = idx + 20 < data.length ? data[idx + 20].c : null;
  const forward50 = idx + 50 < data.length ? data[idx + 50].c : null;

  const price = candle.c;
  const result5 = forward5 ? forward5 - price : null;
  const result10 = forward10 ? forward10 - price : null;
  const result20 = forward20 ? forward20 - price : null;
  const result50 = forward50 ? forward50 - price : null;

  return {
    pattern: pattern.type || pattern.name,
    category: pattern.category || 'unknown',
    direction: pattern.direction,
    strength: pattern.strength || 1,
    date: date.toISOString(),
    timeframe: tf,
    price,
    candle: { o: candle.o, h: candle.h, l: candle.l, c: candle.c },
    forward5: forward5,
    forward10: forward10,
    forward20: forward20,
    forward50: forward50,
    result_5pts: result5,
    result_10pts: result10,
    result_20pts: result20,
    result_50pts: result50,
    success_5: pattern.direction === 'bullish' ? (result5 > 0) : pattern.direction === 'bearish' ? (result5 < 0) : null,
    success_10: pattern.direction === 'bullish' ? (result10 > 0) : pattern.direction === 'bearish' ? (result10 < 0) : null,
    success_20: pattern.direction === 'bullish' ? (result20 > 0) : pattern.direction === 'bearish' ? (result20 < 0) : null,
    description: pattern.description || '',
    entry: pattern.entry || price,
    extra: pattern,
  };
}

// ============================================================================
// STATISTICS ENGINE
// ============================================================================

/**
 * Calculate comprehensive statistics for each pattern type
 */
function calculatePatternStats(allResults) {
  const stats = {};

  for (const [tf, tfData] of Object.entries(allResults)) {
    const allPatterns = [
      ...tfData.candlestick,
      ...tfData.chart,
      ...tfData.harmonic,
      ...tfData.liquidity,
      ...tfData.volume,
      ...tfData.wyckoff,
    ];

    // Group by pattern name
    const groups = {};
    for (const p of allPatterns) {
      if (!groups[p.pattern]) groups[p.pattern] = [];
      groups[p.pattern].push(p);
    }

    for (const [name, patterns] of Object.entries(groups)) {
      const key = `${tf}:${name}`;

      // Win rates at different horizons
      const wr5 = calcWinRate(patterns, 'success_5');
      const wr10 = calcWinRate(patterns, 'success_10');
      const wr20 = calcWinRate(patterns, 'success_20');

      // Average gain / loss
      const avgWin5 = calcAvg(patterns.filter(p => p.success_5 === true).map(p => Math.abs(p.result_5pts)));
      const avgLoss5 = calcAvg(patterns.filter(p => p.success_5 === false).map(p => Math.abs(p.result_5pts)));

      const avgWin10 = calcAvg(patterns.filter(p => p.success_10 === true).map(p => Math.abs(p.result_10pts)));
      const avgLoss10 = calcAvg(patterns.filter(p => p.success_10 === false).map(p => Math.abs(p.result_10pts)));

      // Profit factor
      const pf5 = (avgLoss5 && avgLoss5 > 0) ? (avgWin5 * patterns.filter(p => p.success_5 === true).length) / (avgLoss5 * patterns.filter(p => p.success_5 === false).length) : 0;

      // Expectancy
      const expect5 = calcExpectancy(patterns, 'result_5pts');
      const expect20 = calcExpectancy(patterns, 'result_20pts');

      // Standard deviation of returns
      const std5 = calcStdDev(patterns.map(p => p.result_5pts).filter(v => v !== null));

      // Sharpe ratio (simplified, annualized not applied)
      const sharpe5 = std5 > 0 ? expect5 / std5 : 0;

      stats[key] = {
        pattern: name,
        timeframe: tf,
        category: patterns[0]?.category || 'unknown',
        direction: patterns[0]?.direction || 'neutral',
        occurrences: patterns.length,
        winRate_5: wr5,
        winRate_10: wr10,
        winRate_20: wr20,
        avgGain_5pts: avgWin5,
        avgLoss_5pts: avgLoss5,
        avgGain_10pts: avgWin10,
        avgLoss_10pts: avgLoss10,
        profitFactor_5: pf5,
        expectancy_5: expect5,
        expectancy_20: expect20,
        stdDev_5: std5,
        sharpe_5: sharpe5,
        reliability: wr5 > 55 ? 'Alta' : wr5 > 45 ? 'Média' : 'Baixa',
        bestHorizon: wr5 >= wr10 && wr5 >= wr20 ? '5' : wr10 >= wr20 ? '10' : '20',
      };
    }
  }

  return stats;
}

/**
 * Generate top patterns ranking
 */
function rankPatterns(stats, minOccurrences = 10) {
  const ranked = Object.values(stats)
    .filter(s => s.occurrences >= minOccurrences && s.winRate_5 !== null)
    .sort((a, b) => {
      // Score = winRate * profitFactor * occurrences weight
      const scoreA = a.winRate_5 * (a.profitFactor_5 || 1) * Math.log(a.occurrences);
      const scoreB = b.winRate_5 * (b.profitFactor_5 || 1) * Math.log(b.occurrences);
      return scoreB - scoreA;
    });
  return ranked;
}

/**
 * Generate learning report
 */
function generateLearningReport(stats) {
  const ranked = rankPatterns(stats, 5);
  const top10 = ranked.slice(0, 10);
  const bottom10 = ranked.slice(-10).reverse();

  const report = {
    generatedAt: new Date().toISOString(),
    totalPatterns: Object.keys(stats).length,
    totalDetections: Object.values(stats).reduce((s, p) => s + p.occurrences, 0),
    topPerformers: top10.map(p => ({
      name: p.pattern,
      tf: p.timeframe,
      wr: p.winRate_5?.toFixed(1) + '%',
      pf: p.profitFactor_5?.toFixed(2),
      exp: p.expectancy_5?.toFixed(1),
      occ: p.occurrences,
    })),
    worstPerformers: bottom10.map(p => ({
      name: p.pattern,
      tf: p.timeframe,
      wr: p.winRate_5?.toFixed(1) + '%',
      occ: p.occurrences,
    })),
    byCategory: {},
    byTimeframe: {},
  };

  // Group by category
  for (const [key, p] of Object.entries(stats)) {
    if (!report.byCategory[p.category]) {
      report.byCategory[p.category] = { count: 0, totalOcc: 0, avgWR: 0, patterns: [] };
    }
    report.byCategory[p.category].count++;
    report.byCategory[p.category].totalOcc += p.occurrences;
    report.byCategory[p.category].patterns.push(p);
    report.byCategory[p.category].avgWR += p.winRate_5 || 0;
  }

  for (const cat of Object.keys(report.byCategory)) {
    const c = report.byCategory[cat];
    c.avgWR = (c.avgWR / c.count).toFixed(1);
  }

  // Group by timeframe
  for (const [key, p] of Object.entries(stats)) {
    if (!report.byTimeframe[p.timeframe]) {
      report.byTimeframe[p.timeframe] = { count: 0, totalOcc: 0, avgWR: 0 };
    }
    report.byTimeframe[p.timeframe].count++;
    report.byTimeframe[p.timeframe].totalOcc += p.occurrences;
    report.byTimeframe[p.timeframe].avgWR += p.winRate_5 || 0;
  }

  for (const tf of Object.keys(report.byTimeframe)) {
    const t = report.byTimeframe[tf];
    t.avgWR = (t.avgWR / t.count).toFixed(1);
  }

  return report;
}

// ==============================
// HELPERS
// ==============================
function calcWinRate(patterns, field) {
  const valid = patterns.filter(p => p[field] !== null && p[field] !== undefined);
  if (valid.length === 0) return null;
  return (valid.filter(p => p[field] === true).length / valid.length) * 100;
}
function calcAvg(arr) { return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function calcExpectancy(patterns, field) {
  const valid = patterns.filter(p => p[field] !== null);
  if (valid.length === 0) return 0;
  return valid.reduce((s, p) => s + p[field], 0) / valid.length;
}
function calcStdDev(arr) {
  if (arr.length < 2) return 0;
  const mean = calcAvg(arr);
  const variance = arr.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / arr.length;
  return Math.sqrt(variance);
}

// ============================================================================
// DATABASE MANAGER
// ============================================================================
const fs = require('fs');
const path = require('path');
const DB_PATH = path.join(__dirname, '..', 'data');

function ensureDataDir() {
  if (!fs.existsSync(DB_PATH)) fs.mkdirSync(DB_PATH, { recursive: true });
}

function saveResults(allResults, stats, report, label) {
  ensureDataDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileLabel = label || timestamp;

  fs.writeFileSync(
    path.join(DB_PATH, `scan_${fileLabel}.json`),
    JSON.stringify({
      scanDate: new Date().toISOString(),
      label: fileLabel,
      results: allResults,
      stats,
      report,
    }, null, 2)
  );

  // Also save aggregated stats
  fs.writeFileSync(
    path.join(DB_PATH, 'pattern_stats.json'),
    JSON.stringify(stats, null, 2)
  );

  fs.writeFileSync(
    path.join(DB_PATH, 'learning_report.json'),
    JSON.stringify(report, null, 2)
  );

  console.log(`\n[DB] Resultados salvos em data/scan_${fileLabel}.json`);
  console.log(`[DB] Estatísticas salvas em data/pattern_stats.json`);
  console.log(`[DB] Relatório salvo em data/learning_report.json`);
}

function loadStats() {
  const statsPath = path.join(DB_PATH, 'pattern_stats.json');
  if (fs.existsSync(statsPath)) {
    return JSON.parse(fs.readFileSync(statsPath, 'utf-8'));
  }
  return {};
}

// ==============================
// EXPORT
// ==============================
module.exports = {
  scanAllTimeframes, createRecord,
  calculatePatternStats, rankPatterns, generateLearningReport,
  saveResults, loadStats, DB_PATH,
};
