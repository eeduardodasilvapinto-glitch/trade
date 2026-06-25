// ============================================================================
// SCRIPT: ESTUDAR.JS — Estudo noturno automático
// Execução: node estudar.js [--skip-download] [--quick]
// ============================================================================

const https = require('https');
const fs = require('fs');
const path = require('path');
const scanner = require('./engine/scanner');

const DATA_DIR = path.join(__dirname, 'data');
const YH_SYMBOL = '^BVSP';

// Timeframes e intervalos do Yahoo Finance
const TIMEFRAMES = {
  M5:  { interval: '5m',  range: '60d', label: '5 minutos' },
  M15: { interval: '15m', range: '60d', label: '15 minutos' },
  M30: { interval: '30m', range: '60d', label: '30 minutos' },
  H1:  { interval: '1h',  range: '2y',  label: '1 hora' },
  H4:  { interval: '1h',  range: '2y',  label: '4 horas (resample)' },
  D1:  { interval: '1d',  range: '5y',  label: 'Diário' },
  W1:  { interval: '1wk', range: '5y',  label: 'Semanal' },
};

// ============================================================================
// DOWNLOAD DATA FROM YAHOO FINANCE
// ============================================================================
function downloadYahoo(tf, interval, range) {
  return new Promise((resolve, reject) => {
    const filePath = path.join(DATA_DIR, `ohlcv_${tf}.json`);

    // Check cache (don't re-download if recent)
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      const ageHours = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60);
      if (ageHours < 4) {
        console.log(`  [${tf}] Cache válido (${ageHours.toFixed(1)}h)`);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return resolve(data);
      }
    }

    console.log(`  [${tf}] Baixando ${interval} ${range}...`);

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${YH_SYMBOL}?range=${range}&interval=${interval}`;

    const options = {
      hostname: 'query1.finance.yahoo.com',
      path: `/v8/finance/chart/${YH_SYMBOL}?range=${range}&interval=${interval}`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'application/json',
      },
    };

    https.get(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (!json.chart?.result?.[0]) {
            console.error(`  [${tf}] Erro: sem dados`);
            return resolve([]);
          }

          const r = json.chart.result[0];
          const q = r.indicators.quote[0];
          const timestamps = r.timestamp;

          const data = [];
          for (let i = 0; i < timestamps.length; i++) {
            if (q.open[i] !== null) {
              data.push({
                t: timestamps[i] * 1000,
                o: q.open[i],
                h: q.high[i],
                l: q.low[i],
                c: q.close[i],
                v: q.volume[i] || 0,
              });
            }
          }

          // Save
          fs.writeFileSync(filePath, JSON.stringify(data, null, 0));
          console.log(`  [${tf}] ${data.length} candles salvos`);
          resolve(data);
        } catch (e) {
          console.error(`  [${tf}] Parse error:`, e.message);
          resolve([]);
        }
      });
    }).on('error', (e) => {
      console.error(`  [${tf}] Network error:`, e.message);
      resolve([]);
    });
  });
}

// ============================================================================
// RESAMPLE H4 (4 hour from 1 hour)
// ============================================================================
function resampleH4(h1Data) {
  const result = [];
  for (let i = 0; i < h1Data.length; i += 4) {
    const chunk = h1Data.slice(i, i + 4);
    if (chunk.length === 0) continue;
    result.push({
      t: chunk[0].t,
      o: chunk[0].o,
      h: Math.max(...chunk.map(c => c.h)),
      l: Math.min(...chunk.map(c => c.l)),
      c: chunk[chunk.length - 1].c,
      v: chunk.reduce((s, c) => s + c.v, 0),
    });
  }
  return result;
}

// ============================================================================
// MAIN STUDY ROUTINE
// ============================================================================
async function estudar(skipDownload = false, quickMode = false) {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   🌙  WINFUT — ESTUDO AUTOMÁTICO  🌙    ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`Início: ${new Date().toLocaleString('pt-BR')}`);
  console.log(`Modo: ${quickMode ? 'Rápido' : 'Completo'}`);
  console.log(`Símbolo: ${YH_SYMBOL}`);
  console.log('');

  // Phase 1: Download data
  console.log('═══ FASE 1: Download de Dados ═══');

  const dataMap = {};
  const tfsToDownload = quickMode
    ? ['M5', 'M15', 'H1', 'D1']
    : Object.keys(TIMEFRAMES);

  if (!skipDownload) {
    for (const tf of tfsToDownload) {
      const config = TIMEFRAMES[tf];
      if (tf === 'H4') continue; // handled separately

      try {
        const data = await downloadYahoo(tf, config.interval, config.range);
        if (data.length > 0) {
          dataMap[tf] = data;
        }
      } catch (e) {
        console.error(`  [${tf}] Falha:`, e.message);
      }
    }

    // Generate H4 from H1
    if (dataMap['H1'] && dataMap['H1'].length > 0) {
      dataMap['H4'] = resampleH4(dataMap['H1']);
      const h4Path = path.join(DATA_DIR, 'ohlcv_H4.json');
      fs.writeFileSync(h4Path, JSON.stringify(dataMap['H4'], null, 0));
      console.log(`  [H4] ${dataMap['H4'].length} candles (resample de H1)`);
    }
  } else {
    // Load from cache
    console.log('  Modo skip-download: carregando cache...');
    for (const tf of tfsToDownload) {
      const filePath = path.join(DATA_DIR, `ohlcv_${tf}.json`);
      if (fs.existsSync(filePath)) {
        dataMap[tf] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        console.log(`  [${tf}] ${dataMap[tf].length} candles do cache`);
      }
    }
    // H4
    const h4Path = path.join(DATA_DIR, 'ohlcv_H4.json');
    if (fs.existsSync(h4Path)) {
      dataMap['H4'] = JSON.parse(fs.readFileSync(h4Path, 'utf-8'));
      console.log(`  [H4] ${dataMap['H4'].length} candles do cache`);
    } else if (dataMap['H1']) {
      dataMap['H4'] = resampleH4(dataMap['H1']);
    }
  }

  // Add W1 from D1 resample
  if (dataMap['D1'] && dataMap['D1'].length > 0 && !dataMap['W1']) {
    dataMap['W1'] = resampleWeekly(dataMap['D1']);
    const w1Path = path.join(DATA_DIR, 'ohlcv_W1.json');
    fs.writeFileSync(w1Path, JSON.stringify(dataMap['W1'], null, 0));
    console.log(`  [W1] ${dataMap['W1'].length} candles (resample de D1)`);
  }

  if (Object.keys(dataMap).length === 0) {
    console.error('\n❌ Nenhum dado disponível. Execute sem --skip-download.');
    return;
  }

  console.log(`\n✅ Dados carregados: ${Object.keys(dataMap).length} timeframes`);

  // Phase 2: Pattern scanning
  console.log('\n═══ FASE 2: Varredura de Padrões ═══');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const allResults = scanner.scanAllTimeframes(dataMap);

  // Phase 3: Statistics
  console.log('\n═══ FASE 3: Cálculo de Estatísticas ═══');

  const stats = scanner.calculatePatternStats(allResults);
  const ranked = scanner.rankPatterns(stats, quickMode ? 3 : 10);
  const report = scanner.generateLearningReport(stats);

  // Phase 4: Save
  console.log('\n═══ FASE 4: Persistência ═══');

  scanner.saveResults(allResults, stats, report, timestamp);

  // Phase 5: Print summary
  console.log('\n═══════════════════════════════════════════');
  console.log('  📊  TOP 10 PADRÕES (por score)');
  console.log('═══════════════════════════════════════════');

  const top10 = ranked.slice(0, 10);
  for (let i = 0; i < top10.length; i++) {
    const p = top10[i];
    console.log(`  ${(i + 1).toString().padStart(2)}. ${p.pattern.padEnd(30)} ${p.timeframe.padEnd(4)} WR:${p.winRate_5?.toFixed(1).padStart(6)}%  PF:${p.profitFactor_5?.toFixed(2).padStart(6)}  N:${p.occurrences}`);
  }

  console.log('\n═══════════════════════════════════════════');
  console.log('  📋  RESUMO POR CATEGORIA');
  console.log('═══════════════════════════════════════════');

  for (const [cat, info] of Object.entries(report.byCategory)) {
    console.log(`  ${cat.padEnd(15)} ${info.count} padrões  ${info.totalOcc} ocorrências  WR médio: ${info.avgWR}%`);
  }

  console.log('\n═══════════════════════════════════════════');
  console.log('  📋  RESUMO POR TIMEFRAME');
  console.log('═══════════════════════════════════════════');

  for (const [tf, info] of Object.entries(report.byTimeframe)) {
    console.log(`  ${tf.padEnd(6)} ${info.count} padrões  ${info.totalOcc} ocorrências  WR médio: ${info.avgWR}%`);
  }

  console.log(`\n✅ Estudo concluído em ${new Date().toLocaleString('pt-BR')}`);
  console.log(`📁 Dados salvos em: ${DATA_DIR}/`);
}

// ============================================================================
// WEEKLY RESAMPLE
// ============================================================================
function resampleWeekly(dailyData) {
  const result = [];
  let weekStart = null;
  let weekData = [];

  for (const d of dailyData) {
    const date = new Date(d.t);
    const dayOfWeek = date.getDay();

    if (dayOfWeek === 1 || weekStart === null) { // Monday
      if (weekData.length > 0) {
        result.push({
          t: weekData[0].t,
          o: weekData[0].o,
          h: Math.max(...weekData.map(c => c.h)),
          l: Math.min(...weekData.map(c => c.l)),
          c: weekData[weekData.length - 1].c,
          v: weekData.reduce((s, c) => s + c.v, 0),
        });
      }
      weekStart = d.t;
      weekData = [d];
    } else {
      weekData.push(d);
    }
  }

  // Last week
  if (weekData.length > 0) {
    result.push({
      t: weekData[0].t,
      o: weekData[0].o,
      h: Math.max(...weekData.map(c => c.h)),
      l: Math.min(...weekData.map(c => c.l)),
      c: weekData[weekData.length - 1].c,
      v: weekData.reduce((s, c) => s + c.v, 0),
    });
  }

  return result;
}

// ============================================================================
// CLI
// ============================================================================
if (require.main === module) {
  const skipDownload = process.argv.includes('--skip-download');
  const quickMode = process.argv.includes('--quick');

  estudar(skipDownload, quickMode).catch(err => {
    console.error('❌ Erro fatal:', err);
    process.exit(1);
  });
}

module.exports = { estudar, downloadYahoo };
