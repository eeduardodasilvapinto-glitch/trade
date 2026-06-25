// ============================================================================
// WINFUT PRO v2.0 — Servidor Railway-Ready
// Express + WebSocket + Cron + Scanner Incremental + Proxy Yahoo Finance
// ============================================================================

const express = require('express');
const http = require('http');
const https = require('https');
const { WebSocketServer } = require('ws');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// ============================================================================
// CONFIG
// ============================================================================
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
// Use Railway volume mount path if available, otherwise local ./data
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'data')
  : path.join(__dirname, 'data');
const YH_SYMBOL = process.env.YH_SYMBOL || '^BVSP';

console.log(`[Config] DATA_DIR = ${DATA_DIR}`);
console.log(`[Config] YH_SYMBOL = ${YH_SYMBOL}`);

// Ensure data dir
try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); } catch(e) {
  console.error('[Config] Cannot create DATA_DIR:', e.message);
  console.error('[Config] Path:', DATA_DIR);
}

// ============================================================================
// PATTERN ENGINE — Safe load (don't crash server if missing)
// ============================================================================
let candlestick, chart, harmonic, liquidity, volume, wyckoff, scanner;
let engineReady = false;

try {
  candlestick = require('./engine/patterns/candlestick');
  chart = require('./engine/patterns/chart');
  harmonic = require('./engine/patterns/harmonic');
  liquidity = require('./engine/patterns/liquidity');
  volume = require('./engine/patterns/volume');
  wyckoff = require('./engine/patterns/wyckoff');
  scanner = require('./engine/scanner');
  engineReady = true;
  console.log('[Engine] Pattern detectors loaded successfully');
} catch (e) {
  console.error('[Engine] Failed to load pattern detectors:', e.message);
  console.error('[Engine] Server will run without pattern detection');
}

// ============================================================================
// GLOBAL STATE
// ============================================================================
const state = {
  isScanning: false,
  lastScanAt: null,
  lastDataFetch: {},
  alerts: [],       // Recent alerts for WebSocket push
  connectedClients: 0,
  ohlcData: {},     // In-memory cache: { M5: [...], M15: [...], ... }
  patternStats: null,
  learningReport: null,
};

// ============================================================================
// WEBSOCKET — Real-time pattern push
// ============================================================================
wss.on('connection', (ws, req) => {
  state.connectedClients++;
  console.log(`[WS] Client connected (total: ${state.connectedClients})`);

  ws.send(JSON.stringify({
    type: 'connected',
    message: `WINFUT PRO — Conectado. ${state.connectedClients} clientes.`,
    stats: state.patternStats ? Object.keys(state.patternStats).length : 0,
    lastScan: state.lastScanAt,
  }));

  ws.on('close', () => {
    state.connectedClients--;
    console.log(`[WS] Client disconnected (total: ${state.connectedClients})`);
  });
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg);
  });
}

// ============================================================================
// YAHOO FINANCE DATA FETCH
// ============================================================================
function fetchYahoo(tf, interval, range) {
  return new Promise((resolve, reject) => {
    const filePath = path.join(DATA_DIR, `ohlcv_${tf}.json`);
    const url = `/v8/finance/chart/${encodeURIComponent(YH_SYMBOL)}?range=${range}&interval=${interval}`;

    console.log(`[Fetch] ${tf}: ${interval} ${range}`);

    const options = {
      hostname: 'query1.finance.yahoo.com',
      path: url,
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
            console.log(`[Fetch] ${tf}: sem dados`);
            return resolve(null);
          }

          const r = json.chart.result[0];
          const q = r.indicators.quote[0];
          const data = [];
          for (let i = 0; i < r.timestamp.length; i++) {
            if (q.open[i] !== null) {
              data.push({
                t: r.timestamp[i] * 1000,
                o: q.open[i],
                h: q.high[i],
                l: q.low[i],
                c: q.close[i],
                v: q.volume[i] || 0,
              });
            }
          }

          // Detect new candles vs existing
          const existing = loadJSON(filePath) || [];
          const existingTs = new Set(existing.map(c => c.t));
          const newCandles = data.filter(c => !existingTs.has(c.t));

          if (newCandles.length > 0 || existing.length === 0) {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 0));
          }

          state.ohlcData[tf] = data;
          state.lastDataFetch[tf] = Date.now();

          console.log(`[Fetch] ${tf}: ${data.length} total, ${newCandles.length} novos candles`);
          resolve({ data, newCandles, total: data.length });
        } catch (e) {
          console.error(`[Fetch] ${tf} parse error:`, e.message);
          resolve(null);
        }
      });
    }).on('error', (e) => {
      console.error(`[Fetch] ${tf} error:`, e.message);
      resolve(null);
    });
  });
}

// ============================================================================
// INCREMENTAL SCAN — Only scans new candles
// ============================================================================
function scanIncremental(tf, newCandles, fullData) {
  if (!engineReady || !newCandles || newCandles.length === 0) return [];

  const results = [];
  const dataStart = Math.max(0, fullData.length - 60);
  const scanData = fullData.slice(dataStart);

  console.log(`[Scan] ${tf}: escaneando ${newCandles.length} novos candles`);

  for (const nc of newCandles) {
    const idx = scanData.findIndex(c => c.t === nc.t);
    if (idx < 5) continue;

    const candle = scanData[idx];

    // Candlestick
    const can = candlestick.detectAllCandlestick(candle, scanData, idx);
    for (const r of can) results.push({ ...r, tf, candle });

    // Chart (every 5)
    if (idx % 5 === 0) {
      const ch = chart.detectAllChartPatterns(scanData, idx);
      for (const r of ch) results.push({ ...r, tf, candle });
    }

    // Harmonic (every 5)
    if (idx % 5 === 0) {
      const hm = harmonic.detectAllHarmonic(scanData, idx);
      for (const r of hm) results.push({ ...r, tf, candle });
    }

    // Liquidity
    if (idx % 2 === 0) {
      const liq = liquidity.detectAllLiquidity(scanData, idx);
      for (const r of liq) results.push({ ...r, tf, candle });
    }

    // Volume
    const vol = volume.detectAllVolume(scanData, idx);
    for (const r of vol) results.push({ ...r, tf, candle });

    // Wyckoff (every 10)
    if (idx % 10 === 0) {
      const wy = wyckoff.detectAllWyckoff(scanData, idx);
      for (const r of wy) results.push({ ...r, tf, candle });
    }
  }

  console.log(`[Scan] ${tf}: ${results.length} padrões nos novos candles`);
  return results;
}

// ============================================================================
// FULL STUDY — Runs complete scan on all timeframes
// ============================================================================
async function runFullStudy() {
  if (!engineReady) {
    console.log('[Study] Engine not loaded, skipping');
    broadcast({ type: 'study_error', message: 'Pattern engine not available' });
    return;
  }
  if (state.isScanning) {
    console.log('[Study] Já está escaneando, ignorando...');
    return;
  }

  state.isScanning = true;
  broadcast({ type: 'study_started', message: 'Estudo iniciado...' });

  try {
    // Phase 1: Fetch all data
    console.log('\n═══ ESTUDO: Fetch Data ═══');
    const fetchTasks = [
      fetchYahoo('M5', '5m', '60d'),
      fetchYahoo('M15', '15m', '60d'),
      fetchYahoo('H1', '1h', '2y'),
      fetchYahoo('D1', '1d', '5y'),
    ];

    const results = await Promise.all(fetchTasks);

    // Resample H4 from H1, W1 from D1
    if (state.ohlcData['H1']) {
      state.ohlcData['H4'] = resample4H(state.ohlcData['H1']);
      fs.writeFileSync(path.join(DATA_DIR, 'ohlcv_H4.json'), JSON.stringify(state.ohlcData['H4'], null, 0));
    }
    if (state.ohlcData['D1']) {
      state.ohlcData['W1'] = resampleWeekly(state.ohlcData['D1']);
      fs.writeFileSync(path.join(DATA_DIR, 'ohlcv_W1.json'), JSON.stringify(state.ohlcData['W1'], null, 0));
    }

    // Phase 2: Scan all
    console.log('\n═══ ESTUDO: Scan ═══');
    const dataMap = {};
    for (const tf of ['M5', 'M15', 'H1', 'H4', 'D1', 'W1']) {
      const fPath = path.join(DATA_DIR, `ohlcv_${tf}.json`);
      if (fs.existsSync(fPath)) {
        dataMap[tf] = JSON.parse(fs.readFileSync(fPath, 'utf-8'));
      }
    }

    const allResults = scanner.scanAllTimeframes(dataMap);
    state.patternStats = scanner.calculatePatternStats(allResults);
    state.learningReport = scanner.generateLearningReport(state.patternStats);
    scanner.saveResults(allResults, state.patternStats, state.learningReport, 'latest');
    state.lastScanAt = new Date().toISOString();

    // Load into memory
    try {
      state.patternStats = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'pattern_stats.json'), 'utf-8'));
      state.learningReport = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'learning_report.json'), 'utf-8'));
    } catch(e) {}

    broadcast({
      type: 'study_completed',
      message: `Estudo concluído: ${Object.keys(state.patternStats).length} padrões analisados`,
      totalPatterns: state.learningReport?.totalPatterns || 0,
      totalDetections: state.learningReport?.totalDetections || 0,
      timestamp: state.lastScanAt,
    });

    console.log(`\n✅ Estudo concluído`);
  } catch (e) {
    console.error('[Study] Erro:', e);
    broadcast({ type: 'study_error', message: e.message });
  } finally {
    state.isScanning = false;
  }
}

// ============================================================================
// LIVE POLL — Check for new data during market hours
// ============================================================================
async function livePoll() {
  const now = new Date();
  const hourBRT = (now.getUTCHours() - 3 + 24) % 24; // Brasília time approximation
  const isMarketOpen = hourBRT >= 9 && hourBRT < 18;
  const isWeekday = now.getUTCDay() >= 1 && now.getUTCDay() <= 5;

  if (isMarketOpen && isWeekday && !state.isScanning) {
    console.log(`[LivePoll] ${new Date().toLocaleString('pt-BR')} — verificando novos candles`);

    try {
      // Fetch M5 data
      const result = await fetchYahoo('M5', '5m', '1d');
      if (result && result.newCandles.length > 0) {
        console.log(`[LivePoll] M5: ${result.newCandles.length} novos candles detectados`);

        const allData = result.data;
        const newPatterns = scanIncremental('M5', result.newCandles, allData);

        // Push alerts for high-confidence patterns
        const alerts = newPatterns.filter(p => p.strength >= 3);
        for (const alert of alerts) {
          const alertMsg = {
            type: 'live_alert',
            pattern: alert.type || alert.name,
            direction: alert.direction,
            strength: alert.strength,
            timeframe: 'M5',
            price: alert.candle?.c,
            timestamp: new Date().toISOString(),
            message: `${alert.type || alert.name}: ${alert.direction} (força ${alert.strength}) @ ${alert.candle?.c}`,
          };
          broadcast(alertMsg);
          state.alerts.push(alertMsg);
        }

        if (alerts.length > 0) {
          console.log(`[LivePoll] ${alerts.length} alertas enviados para ${state.connectedClients} clientes`);
        }

        // Keep only last 500 alerts
        if (state.alerts.length > 500) state.alerts = state.alerts.slice(-500);

        // Save alerts to file
        fs.writeFileSync(path.join(DATA_DIR, 'alerts.json'), JSON.stringify(state.alerts.slice(-100), null, 2));
      }

      // Also fetch M15 every 15 minutes
      const min = now.getMinutes();
      if (min % 15 < 5) {
        await fetchYahoo('M15', '15m', '5d');
        await fetchYahoo('H1', '1h', '30d');
      }

      broadcast({
        type: 'live_poll',
        newCandles: result?.newCandles?.length || 0,
        totalCandles: result?.total || 0,
        marketOpen: true,
      });
    } catch (e) {
      console.error('[LivePoll] Error:', e.message);
    }
  } else {
    console.log(`[LivePoll] ${new Date().toLocaleString('pt-BR')} — mercado fechado`);
    broadcast({ type: 'live_poll', marketOpen: false, message: 'Mercado fechado' });
  }
}

// ============================================================================
// HELPERS
// ============================================================================
function loadJSON(filePath) {
  try {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch(e) {}
  return null;
}

function resample4H(h1Data) {
  const result = [];
  for (let i = 0; i < h1Data.length; i += 4) {
    const chunk = h1Data.slice(i, i + 4);
    if (chunk.length === 0) continue;
    result.push({
      t: chunk[0].t, o: chunk[0].o,
      h: Math.max(...chunk.map(c => c.h)),
      l: Math.min(...chunk.map(c => c.l)),
      c: chunk[chunk.length - 1].c,
      v: chunk.reduce((s, c) => s + c.v, 0),
    });
  }
  return result;
}

function resampleWeekly(d) {
  const r = [];
  let week = [];
  d.forEach((c, i) => {
    const date = new Date(c.t);
    if (date.getDay() === 1 || i === 0) {
      if (week.length) r.push({ t: week[0].t, o: week[0].o, h: Math.max(...week.map(x => x.h)), l: Math.min(...week.map(x => x.l)), c: week.at(-1).c, v: week.reduce((s, x) => s + x.v, 0) });
      week = [c];
    } else { week.push(c); }
  });
  if (week.length) r.push({ t: week[0].t, o: week[0].o, h: Math.max(...week.map(x => x.h)), l: Math.min(...week.map(x => x.l)), c: week.at(-1).c, v: week.reduce((s, x) => s + x.v, 0) });
  return r;
}

// ============================================================================
// EXPRESS ROUTES
// ============================================================================
app.use(express.static(__dirname));

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// API: Yahoo Finance proxy
app.get('/api/yahoo', (req, res) => {
  const yahooPath = req.query.url;
  if (!yahooPath) return res.status(400).json({ error: 'Missing ?url=' });

  const options = {
    hostname: 'query1.finance.yahoo.com',
    path: yahooPath,
    method: 'GET',
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
  };

  https.get(options, (yhRes) => {
    let body = '';
    yhRes.on('data', c => body += c);
    yhRes.on('end', () => { res.status(yhRes.statusCode).json(JSON.parse(body)); });
  }).on('error', (e) => res.status(502).json({ error: e.message }));
});

// API: Download specific timeframe
app.get('/api/download/:tf', async (req, res) => {
  const configs = { M5:['5m','60d'], M15:['15m','60d'], M30:['30m','60d'], H1:['1h','2y'], D1:['1d','5y'], W1:['1wk','5y'] };
  const cfg = configs[req.params.tf];
  if (!cfg) return res.status(400).json({ error: 'Invalid TF. Use M5,M15,M30,H1,D1,W1' });
  const result = await fetchYahoo(req.params.tf, cfg[0], cfg[1]);
  res.json({ tf: req.params.tf, total: result?.total || 0, newCandles: result?.newCandles?.length || 0 });
});

// API: OHLCV data
app.get('/api/data/:tf', (req, res) => {
  const filePath = path.join(DATA_DIR, `ohlcv_${req.params.tf.toUpperCase()}.json`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'No data for this timeframe' });
  res.sendFile(filePath);
});

// API: Pattern stats
app.get('/api/stats', (req, res) => {
  const filePath = path.join(DATA_DIR, 'pattern_stats.json');
  if (!fs.existsSync(filePath)) return res.json({});
  res.sendFile(filePath);
});

// API: Learning report
app.get('/api/report', (req, res) => {
  const filePath = path.join(DATA_DIR, 'learning_report.json');
  if (!fs.existsSync(filePath)) return res.json({});
  res.sendFile(filePath);
});

// API: Scan history
app.get('/api/scans', (req, res) => {
  if (!fs.existsSync(DATA_DIR)) return res.json([]);
  const files = fs.readdirSync(DATA_DIR)
    .filter(f => f.startsWith('scan_') && f.endsWith('.json'))
    .map(f => ({ file: f, ...fs.statSync(path.join(DATA_DIR, f)), date: fs.statSync(path.join(DATA_DIR, f)).mtime }))
    .sort((a, b) => b.date - a.date)
    .slice(0, 20);
  res.json(files);
});

// API: Recent alerts
app.get('/api/alerts', (req, res) => {
  res.json(state.alerts.slice(-50));
});

// API: Trigger study
app.post('/api/study', (req, res) => {
  res.json({ status: 'started', message: 'Estudo iniciado em background' });
  runFullStudy().catch(console.error);
});

// API: Status
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    uptime: process.uptime(),
    connectedClients: state.connectedClients,
    isScanning: state.isScanning,
    lastScanAt: state.lastScanAt,
    lastDataFetch: state.lastDataFetch,
    dataTimeframes: Object.keys(state.ohlcData),
    alertsCount: state.alerts.length,
    memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
  });
});

// API: Live poll (manual trigger)
app.post('/api/livepoll', async (req, res) => {
  res.json({ status: 'polling' });
  await livePoll();
});

// API: Specific scan file
app.get('/api/scan/:file', (req, res) => {
  const filePath = path.join(DATA_DIR, req.params.file);
  if (!filePath.startsWith(DATA_DIR)) return res.status(403).json({ error: 'Forbidden' });
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
  res.sendFile(filePath);
});

// ============================================================================
// CRON JOBS
// ============================================================================

try {
  // Live polling during market hours (every 2 minutes)
  cron.schedule('*/2 12-21 * * 1-5', () => {
    livePoll().catch(console.error);
  }, { timezone: 'America/Sao_Paulo' });

  // Full study: after market close + overnight
  cron.schedule('0 19 * * 1-5', () => {
    console.log('[Cron] Estudo pós-mercado programado');
    runFullStudy().catch(console.error);
  }, { timezone: 'America/Sao_Paulo' });

  cron.schedule('0 2 * * *', () => {
    console.log('[Cron] Estudo noturno programado');
    runFullStudy().catch(console.error);
  }, { timezone: 'America/Sao_Paulo' });

  console.log('[Cron] Jobs agendados');
} catch(e) {
  console.error('[Cron] Failed to schedule jobs:', e.message);
}

// ============================================================================
// STARTUP
// ============================================================================
server.listen(PORT, HOST, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║     🎯  WINFUT PRO v2.0 — Railway Ready    ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Dashboard:  http://localhost:${PORT}           ║`);
  console.log(`║  WebSocket:  ws://localhost:${PORT}             ║`);
  console.log('╠══════════════════════════════════════════════╣');
  console.log('║  ENDPOINTS:                                 ║');
  console.log('║  /api/status     → Status do servidor       ║');
  console.log('║  /api/yahoo      → Proxy Yahoo Finance      ║');
  console.log('║  /api/data/:tf   → Dados OHLCV              ║');
  console.log('║  /api/stats      → Estatísticas de padrões  ║');
  console.log('║  /api/report     → Relatório de aprendizado ║');
  console.log('║  /api/alerts     → Alertas recentes         ║');
  console.log('║  /api/livepoll   → Poll manual              ║');
  console.log('║  POST /api/study → Iniciar estudo           ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log('║  CRON:                                      ║');
  console.log('║  Live poll: a cada 2min (Seg-Sex 9-18 BRT)  ║');
  console.log('║  Estudo: 19h (pós-mercado) + 2h (noturno)  ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');

  // Load existing data on startup
  for (const tf of ['M5', 'M15', 'H1', 'H4', 'D1', 'W1']) {
    const p = path.join(DATA_DIR, `ohlcv_${tf}.json`);
    if (fs.existsSync(p)) {
      state.ohlcData[tf] = JSON.parse(fs.readFileSync(p, 'utf-8'));
      state.lastDataFetch[tf] = Date.now();
    }
  }

  // Load stats
  try {
    state.patternStats = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'pattern_stats.json'), 'utf-8'));
    state.learningReport = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'learning_report.json'), 'utf-8'));
    console.log(`📊 Stats loaded: ${Object.keys(state.patternStats).length} patterns`);
  } catch(e) {}

  // Load alerts
  try {
    state.alerts = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'alerts.json'), 'utf-8')) || [];
  } catch(e) {}

  // Run first live poll
  setTimeout(() => livePoll().catch(console.error), 3000);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nEncerrando...');
  server.close();
  process.exit(0);
});
process.on('SIGTERM', () => {
  server.close();
  process.exit(0);
});
