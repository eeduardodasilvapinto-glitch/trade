// ============================================================================
// ENGINE: REPLAY — Simulador de tempo real com dados históricos
// Percorre candles do passado gerando trades, aprendizado e evolução
// ============================================================================

const fs = require('fs');
const path = require('path');

async function runReplay(agent, learner, metaLearner, dataDir, broadcastFn, options = {}) {
  const broadcast = broadcastFn || (() => {});
  const speed = options.speed || 0; // ms between candles (0 = instant batch)
  const maxCandles = options.maxCandles || 0; // 0 = all
  const timeframe = options.timeframe || 'M5';
  
  // Load data
  const dataPath = path.join(dataDir, `ohlcv_${timeframe}.json`);
  if (!fs.existsSync(dataPath)) {
    broadcast({ type: 'replay_error', message: `No data for ${timeframe}` });
    return { status: 'error', message: 'No data' };
  }
  
  const allData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  if (allData.length < 50) {
    broadcast({ type: 'replay_error', message: 'Not enough data' });
    return { status: 'error', message: 'Not enough data' };
  }
  
  // Use last N candles or all
  const data = maxCandles > 0 ? allData.slice(-maxCandles) : allData.slice(-5000);
  
  console.log(`[Replay] Starting with ${data.length} candles (${timeframe}), speed: ${speed}ms`);
  
  broadcast({
    type: 'replay_started',
    totalCandles: data.length,
    timeframe,
    speed,
    timestamp: new Date().toISOString(),
  });
  
  // Reset agent for clean replay
  const wasRunning = agent.state === 'running';
  agent.state = 'running';
  agent.capital = 10000;
  agent.initialCapital = 10000;
  agent.peakCapital = 10000;
  agent.openPositions = [];
  agent.totalTrades = 0;
  agent.wins = 0;
  agent.losses = 0;
  agent.consecutiveLosses = 0;
  
  let tradeCount = 0;
  let lastBroadcast = Date.now();
  const startTime = Date.now();
  
  // Use the agent's internal strategy engine directly on each candle
  for (let i = 50; i < data.length; i++) {
    const slice = data.slice(0, i + 1);
    const candle = data[i];
    
    // Run agent tick on this candle
    try {
      agent.tick(slice, {}, candle);
      const newTrades = agent.totalTrades - tradeCount;
      if (newTrades > 0) {
        tradeCount = agent.totalTrades;
      }
    } catch (e) {
      console.error('[Replay] Tick error:', e.message);
    }
    
    // Broadcast progress every 2 seconds
    const now = Date.now();
    if (now - lastBroadcast > 2000 || i === data.length - 1) {
      lastBroadcast = now;
      broadcast({
        type: 'replay_progress',
        candle: i,
        total: data.length,
        progress: ((i / data.length) * 100).toFixed(1),
        trades: agent.totalTrades,
        wins: agent.wins,
        losses: agent.losses,
        capital: agent.capital,
        elapsed: ((now - startTime) / 1000).toFixed(1),
      });
    }
    
    // Speed control
    if (speed > 0 && i < data.length - 1) {
      await sleep(speed);
    }
  }
  
  // Close any remaining open positions
  if (agent.openPositions.length > 0) {
    const lastCandle = data[data.length - 1];
    for (const pos of [...agent.openPositions]) {
      const pts = pos.type === 'long' ? lastCandle.c - pos.entry : pos.entry - lastCandle.c;
      const pnl = pts * (agent.getPointValue());
      agent.recordTrade(pos, lastCandle.c, pts, pts > 0 ? 'win' : 'loss', 'replay_close', pnl);
    }
    agent.openPositions = [];
  }
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  
  // Save state
  agent.saveState();
  
  // Run learner analysis
  if (learner && agent.closedTrades.length > 0) {
    // Feed trades to the learner by saving them to diary
    const diaryPath = path.join(dataDir, 'diary.json');
    try {
      let diary = [];
      if (fs.existsSync(diaryPath)) diary = JSON.parse(fs.readFileSync(diaryPath, 'utf-8'));
      diary = [...agent.closedTrades, ...diary].slice(0, 2000);
      fs.writeFileSync(diaryPath, JSON.stringify(diary, null, 2));
    } catch (e) {}
    
    await learner.continuousStudy();
  }
  
  // Run meta-learner
  if (metaLearner && agent.totalTrades > 10) {
    await metaLearner.cycle().catch(() => {});
  }
  
  const status = agent.getStatus();
  
  const result = {
    status: 'completed',
    timeframe,
    candlesProcessed: data.length,
    totalTrades: agent.totalTrades,
    wins: agent.wins,
    losses: agent.losses,
    winRate: status.winRate,
    profitFactor: status.profitFactor,
    finalCapital: agent.capital,
    pnl: agent.capital - 10000,
    pnlPct: ((agent.capital - 10000) / 10000 * 100).toFixed(1),
    drawdown: status.drawdown,
    elapsed,
    candle: data[data.length - 1]?.c,
  };
  
  broadcast({
    type: 'replay_completed',
    ...result,
    timestamp: new Date().toISOString(),
  });
  
  // Restore agent state
  if (!wasRunning) agent.state = 'paused';
  
  console.log(`[Replay] Complete: ${result.totalTrades} trades, WR ${result.winRate}%, PF ${result.profitFactor}, P&L R$${result.pnl.toFixed(0)}, ${elapsed}s`);
  
  return result;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { runReplay };
