// ============================================================================
// ENGINE: AGENT — Operador Autônomo de Trade (Paper Trading)
// 5 estratégias, gestão de posições, stops dinâmicos, trailing, breakeven
// ============================================================================

const fs = require('fs');
const path = require('path');

class Agent {
  constructor(dataDir, broadcastFn, marketRouter) {
    this.dataDir = dataDir;
    this.broadcast = broadcastFn || (() => {});
    this.learner = null;
    this.marketRouter = marketRouter || null;

    // Market-aware state
    this.markets = {};    // { WIN: { capital, trades, ... }, MES: { ... } }
    this.activeMarketId = null;

    // Trading state
    this.capital = 10000;
    this.initialCapital = 10000;
    this.openPositions = [];
    this.closedTrades = [];
    this.pendingSignals = [];
    this.dailyPnl = 0;
    this.dailyLoss = 0;
    this.weeklyLoss = 0;
    this.state = 'off';

    // Risk limits
    this.maxDailyLoss = 0.02;
    this.maxWeeklyLoss = 0.05;
    this.maxConsecutiveLosses = 5;
    this.maxDrawdown = 0.15;

    // Stats
    this.totalTrades = 0;
    this.wins = 0;
    this.losses = 0;
    this.consecutiveLosses = 0;
    this.peakCapital = 10000;

    // Diary persistence
    this.diaryPath = path.join(dataDir, 'diary.json');
    this.tradesPath = path.join(dataDir, 'agent_trades.json');

    this.loadState();
  }

  // Current market helpers
  getMarket() {
    return this.marketRouter?.currentMarket || { id: 'WIN', yhSymbol: '^BVSP', tvSymbol: 'BMFBOVESPA:WIN1!', pointValue: 0.20, name: 'WINFUT' };
  }
  
  getMarketId() { return this.getMarket().id; }
  getPointValue() { return this.getMarket().pointValue || 0.20; }
  getSymbol() { return this.getMarket().yhSymbol || '^BVSP'; }

  // ============================================================
  // STATE PERSISTENCE
  // ============================================================
  loadState() {
    try {
      if (fs.existsSync(this.tradesPath)) {
        const saved = JSON.parse(fs.readFileSync(this.tradesPath, 'utf-8'));
        this.closedTrades = saved.closedTrades || [];
        this.capital = saved.capital || 10000;
        this.peakCapital = saved.peakCapital || 10000;
        this.totalTrades = saved.totalTrades || 0;
        this.wins = saved.wins || 0;
        this.losses = saved.losses || 0;
      }
    } catch (e) {}
    this.updateDailyMetrics();
  }

  saveState() {
    try {
      if (!fs.existsSync(this.dataDir)) fs.mkdirSync(this.dataDir, { recursive: true });
      fs.writeFileSync(this.tradesPath, JSON.stringify({
        closedTrades: this.closedTrades.slice(-500),
        capital: this.capital,
        peakCapital: this.peakCapital,
        totalTrades: this.totalTrades,
        wins: this.wins,
        losses: this.losses,
        lastUpdate: new Date().toISOString(),
      }, null, 2));
    } catch (e) {}
  }

  updateDailyMetrics() {
    const today = new Date().toISOString().split('T')[0];
    const weekStart = this.getWeekStart();
    this.dailyLoss = this.closedTrades
      .filter(t => t.date?.startsWith(today) && t.result === 'loss')
      .reduce((s, t) => s + Math.abs(t.pnl || 0), 0);
    this.weeklyLoss = this.closedTrades
      .filter(t => t.date >= weekStart && t.result === 'loss')
      .reduce((s, t) => s + Math.abs(t.pnl || 0), 0);
  }

  getWeekStart() {
    const d = new Date();
    const day = d.getDay();
    d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
    return d.toISOString().split('T')[0];
  }

  // ============================================================
  // MAIN TICK — Called every 1-2 minutes during market hours
  // ============================================================
  tick(data, patterns, candle) {
    if (this.state === 'off' && this.openPositions.length === 0) return;

    // 1. Check risk limits
    if (this.checkRiskLimits()) {
      if (this.state !== 'paused') {
        this.state = 'paused';
        this.broadcast({ type: 'agent_paused', reason: 'risk_limit', dailyLoss: this.dailyLoss });
      }
    }

    if (this.state === 'cooldown') {
      const cooldownEnd = new Date(this.cooldownUntil).getTime();
      if (Date.now() > cooldownEnd) {
        this.state = 'running';
        this.consecutiveLosses = 0;
        this.broadcast({ type: 'agent_resumed', reason: 'cooldown_ended' });
      }
    }

    // 2. Manage open positions
    this.managePositions(data, candle);

    // 3. Generate new signals (only if running)
    if (this.state === 'running' && data && data.length > 20) {
      this.generateSignals(data, patterns);
    }

    // 4. Save state
    this.saveState();
    this.updateDailyMetrics();

    // 5. Broadcast update
    this.broadcast({
      type: 'agent_update',
      state: this.state,
      openPositions: this.openPositions.length,
      totalTrades: this.totalTrades,
      wins: this.wins,
      losses: this.losses,
      capital: this.capital,
      pnl: this.capital - this.initialCapital,
      dailyLoss: this.dailyLoss,
      winRate: this.totalTrades > 0 ? (this.wins / (this.wins + this.losses) * 100).toFixed(1) : '--',
    });
  }

  // ============================================================
  // RISK CHECK
  // ============================================================
  checkRiskLimits() {
    const dailyLimitHit = this.dailyLoss > this.capital * this.maxDailyLoss;
    const weeklyLimitHit = this.weeklyLoss > this.capital * this.maxWeeklyLoss;
    const drawdownHit = (this.peakCapital - this.capital) / this.peakCapital > this.maxDrawdown;

    if (dailyLimitHit) return true;
    if (weeklyLimitHit && this.state === 'running') { this.state = 'cooldown'; this.cooldownUntil = new Date(Date.now() + 86400000).toISOString(); return true; }
    if (drawdownHit && this.state === 'running') { this.state = 'cooldown'; this.cooldownUntil = new Date(Date.now() + 86400000).toISOString(); return true; }
    if (this.consecutiveLosses >= this.maxConsecutiveLosses && this.state === 'running') {
      this.state = 'cooldown';
      this.cooldownUntil = new Date(Date.now() + 3600000).toISOString(); // 1 hour
      return true;
    }

    return false;
  }

  // ============================================================
  // POSITION MANAGEMENT
  // ============================================================
  managePositions(data, candle) {
    if (!candle || this.openPositions.length === 0) return;

    const currentPrice = candle.c;
    const currentHigh = candle.h;
    const currentLow = candle.l;
    const atr = this.calcATR(data.slice(-14));

    for (let i = this.openPositions.length - 1; i >= 0; i--) {
      const pos = this.openPositions[i];
      let closed = false;
      let closePrice = null;
      let closeReason = '';

      // Update trailing stop
      if (pos.trailingStop) {
        if (pos.type === 'long') {
          const newTrail = currentPrice - pos.trailDistance;
          if (newTrail > pos.trailingStop) {
            pos.trailingStop = newTrail;
          }
        } else {
          const newTrail = currentPrice + pos.trailDistance;
          if (newTrail < pos.trailingStop) {
            pos.trailingStop = newTrail;
          }
        }
      }

      // Check breakeven
      if (!pos.breakeven && pos.type === 'long' && currentPrice >= pos.entry + pos.stopDistance) {
        pos.stop = pos.entry;
        pos.breakeven = true;
        pos.trailingStop = null; // Disable trailing until breakeven is reached
      }
      if (!pos.breakeven && pos.type === 'short' && currentPrice <= pos.entry - pos.stopDistance) {
        pos.stop = pos.entry;
        pos.breakeven = true;
        pos.trailingStop = null;
      }

      // Re-enable trailing after breakeven + 0.5R
      if (pos.breakeven && !pos.trailingStop) {
        if (pos.type === 'long' && currentPrice >= pos.entry + pos.stopDistance * 0.5) {
          pos.trailingStop = currentPrice - pos.stopDistance;
          pos.trailDistance = pos.stopDistance;
        }
        if (pos.type === 'short' && currentPrice <= pos.entry - pos.stopDistance * 0.5) {
          pos.trailingStop = currentPrice + pos.stopDistance;
          pos.trailDistance = pos.stopDistance;
        }
      }

      // Check stop loss
      if (pos.type === 'long') {
        const effectiveStop = pos.trailingStop || pos.stop;
        if (currentLow <= effectiveStop) {
          closePrice = effectiveStop;
          closeReason = pos.trailingStop ? 'trailing_stop' : 'stop_loss';
          closed = true;
        }
      } else {
        const effectiveStop = pos.trailingStop || pos.stop;
        if (currentHigh >= effectiveStop) {
          closePrice = effectiveStop;
          closeReason = pos.trailingStop ? 'trailing_stop' : 'stop_loss';
          closed = true;
        }
      }

      // Check take profit levels
      if (!closed && pos.takeProfits) {
        for (const tp of pos.takeProfits) {
          if (tp.hit) continue;
          if (pos.type === 'long' && currentHigh >= tp.level) {
            closePrice = tp.level;
            closeReason = 'take_profit';
            tp.hit = true;
            // Partial exit — don't close fully, just reduce size
            const partialPnl = (tp.level - pos.entry) * 0.2 * (tp.size || 0.3);
            const partialPts = tp.level - pos.entry;
            this.recordTrade(pos, tp.level, partialPts, 'win', 'take_profit_partial', partialPnl);
            // Reduce position size
            pos.remaining *= (1 - (tp.size || 0.3));
            if (pos.remaining < 0.2) {
              closed = true;
              closeReason = 'take_profit';
            } else {
              // Don't close fully, continue managing
              continue;
            }
          }
          if (pos.type === 'short' && currentLow <= tp.level) {
            closePrice = tp.level;
            closeReason = 'take_profit';
            tp.hit = true;
            const partialPnl = (pos.entry - tp.level) * 0.2 * (tp.size || 0.3);
            const partialPts = pos.entry - tp.level;
            this.recordTrade(pos, tp.level, partialPts, 'win', 'take_profit_partial', partialPnl);
            pos.remaining *= (1 - (tp.size || 0.3));
            if (pos.remaining < 0.2) {
              closed = true;
              closeReason = 'take_profit';
            } else {
              continue;
            }
          }
        }
      }

      // Close position
      if (closed) {
        const pts = pos.type === 'long' ? closePrice - pos.entry : pos.entry - closePrice;
        const pnl = pts * 0.2 * (pos.remaining || 1);
        this.recordTrade(pos, closePrice, pts, pts > 0 ? 'win' : 'loss', closeReason, pnl);
        this.openPositions.splice(i, 1);
      }
    }
  }

  recordTrade(pos, exitPrice, pts, result, reason, pnl) {
    const pointVal = this.getPointValue();
    const calculatedPnl = pnl || (pts * pointVal);
    const trade = {
      market: this.getMarketId(),
      date: new Date().toISOString().split('T')[0],
      time: new Date().toTimeString().slice(0, 5),
      ativo: this.getSymbol(),
      setup: pos.strategy || 'unknown',
      direction: pos.type === 'long' ? 'L' : 'S',
      entryPrice: pos.entry,
      stop: pos.stop,
      exitPrice,
      pts,
      result,
      pnl: calculatedPnl,
      reason,
      createdAt: new Date().toISOString(),
    };

    this.closedTrades.push(trade);
    this.totalTrades++;
    if (result === 'win') { this.wins++; this.consecutiveLosses = 0; }
    else { this.losses++; this.consecutiveLosses++; }

    this.capital += (pnl || 0);
    if (this.capital > this.peakCapital) this.peakCapital = this.capital;

    // Save to main diary
    this.saveToDiary(trade);

    this.broadcast({ type: 'agent_trade_closed', trade });
  }

  saveToDiary(trade) {
    try {
      let diary = [];
      if (fs.existsSync(this.diaryPath)) {
        diary = JSON.parse(fs.readFileSync(this.diaryPath, 'utf-8'));
      }
      diary.unshift(trade);
      if (diary.length > 1000) diary = diary.slice(0, 1000);
      fs.writeFileSync(this.diaryPath, JSON.stringify(diary, null, 2));
    } catch (e) {}
  }

  // ============================================================
  // SIGNAL GENERATION — 5 strategies
  // ============================================================
  generateSignals(data, patterns) {
    if (data.length < 20) return;
    this.pendingSignals = [];

    const closes = data.map(d => d.c);
    const highs = data.map(d => d.h);
    const lows = data.map(d => d.l);
    const sma20 = this.calcSMA(data.map(d => d.c), 20);
    const sma50 = this.calcSMA(data.map(d => d.c), 50);
    const rsi = this.calcRSI(closes, 14);
    const atr = this.calcATR(data.slice(-14));
    const lastIdx = data.length - 1;
    const price = closes[lastIdx];

    const regime = this.learner ? this.learner.getRegimeFilter() : { preferDirection: null, avoidDirection: null, minRR: 1.5 };
    const weights = this.learner ? this.learner.getStrategyWeights() : {};

    // Strategy 1: Pullback to SMA20 in trend
    if (sma20 && sma50 && sma20[lastIdx] && sma50[lastIdx]) {
      const trendUp = sma20[lastIdx] > sma50[lastIdx];
      const trendDown = sma20[lastIdx] < sma50[lastIdx];
      const nearSMA = Math.abs(price - sma20[lastIdx]) / sma20[lastIdx] < 0.003; // within 0.3%

      // Check for rejection candle
      const lastCandle = data[lastIdx];
      const isRejectionUp = lastCandle.l < Math.min(lastCandle.o, lastCandle.c) && lastCandle.c > lastCandle.o;
      const isRejectionDown = lastCandle.h > Math.max(lastCandle.o, lastCandle.c) && lastCandle.c < lastCandle.o;

      if (trendUp && nearSMA && isRejectionUp && regime.avoidDirection !== 'bullish') {
        this.addSignal('Pullback_SMA20', 'long', price, atr, 6, weights['Pullback_SMA20'] || 0.25);
      }
      if (trendDown && nearSMA && isRejectionDown && regime.avoidDirection !== 'bearish') {
        this.addSignal('Pullback_SMA20', 'short', price, atr, 6, weights['Pullback_SMA20'] || 0.25);
      }
    }

    // Strategy 2: Breakout with FVG
    const lookback = 10;
    const recentHigh = Math.max(...highs.slice(lastIdx - lookback, lastIdx));
    const recentLow = Math.min(...lows.slice(lastIdx - lookback, lastIdx));
    const brokeUp = price > recentHigh * 1.001 && data[lastIdx].c > data[lastIdx].o;
    const brokeDown = price < recentLow * 0.999 && data[lastIdx].c < data[lastIdx].o;

    if (brokeUp && regime.avoidDirection !== 'bullish') {
      this.addSignal('Breakout', 'long', price, atr, 5, weights['Breakout'] || 0.2);
    }
    if (brokeDown && regime.avoidDirection !== 'bearish') {
      this.addSignal('Breakout', 'short', price, atr, 5, weights['Breakout'] || 0.2);
    }

    // Strategy 3: RSI Reversal
    if (rsi && rsi[lastIdx]) {
      if (rsi[lastIdx] < 30 && rsi[lastIdx - 1] >= 30 && regime.avoidDirection !== 'bullish') {
        this.addSignal('RSI_Reversal', 'long', price, atr, 5, weights['RSI_Reversal'] || 0.15);
      }
      if (rsi[lastIdx] > 70 && rsi[lastIdx - 1] <= 70 && regime.avoidDirection !== 'bearish') {
        this.addSignal('RSI_Reversal', 'short', price, atr, 5, weights['RSI_Reversal'] || 0.15);
      }
    }

    // Strategy 4: Order Block revisit
    // Find recent order block (last opposite candle before impulse)
    if (lastIdx >= 5) {
      for (let i = lastIdx - 1; i >= lastIdx - 5; i--) {
        const ob = data[i];
        const isBullishOB = ob.c < ob.o && data[i + 1] && data[i + 1].c > data[i + 1].o && data[i + 1].c > ob.h;
        const isBearishOB = ob.c > ob.o && data[i + 1] && data[i + 1].c < data[i + 1].o && data[i + 1].c < ob.l;

        if (isBullishOB) {
          const obHigh = Math.max(ob.o, ob.c);
          const obLow = Math.min(ob.o, ob.c);
          if (price >= obLow && price <= obHigh && regime.avoidDirection !== 'bullish') {
            this.addSignal('Order_Block', 'long', price, atr, 7, weights['Order_Block'] || 0.25);
            break;
          }
        }
        if (isBearishOB) {
          const obHigh = Math.max(ob.o, ob.c);
          const obLow = Math.min(ob.o, ob.c);
          if (price >= obLow && price <= obHigh && regime.avoidDirection !== 'bearish') {
            this.addSignal('Order_Block', 'short', price, atr, 7, weights['Order_Block'] || 0.25);
            break;
          }
        }
      }
    }

    // Strategy 5: Liquidity Sweep
    const sweepHigh = lastIdx >= 2 && data[lastIdx].c < data[lastIdx].o && highs[lastIdx] > highs[lastIdx - 1] && closes[lastIdx] < highs[lastIdx - 1];
    const sweepLow = lastIdx >= 2 && data[lastIdx].c > data[lastIdx].o && lows[lastIdx] < lows[lastIdx - 1] && closes[lastIdx] > lows[lastIdx - 1];

    if (sweepLow && regime.avoidDirection !== 'bullish') {
      this.addSignal('Liquidity_Sweep', 'long', price, atr, 7, weights['Liquidity_Sweep'] || 0.2);
    }
    if (sweepHigh && regime.avoidDirection !== 'bearish') {
      this.addSignal('Liquidity_Sweep', 'short', price, atr, 7, weights['Liquidity_Sweep'] || 0.2);
    }

    // Execute best signal (if any)
    if (this.pendingSignals.length > 0) {
      const best = this.pendingSignals.sort((a, b) => b.score - a.score)[0];
      if (best.score >= 0.4) {
        this.executeSignal(best);
      }
    }
  }

  addSignal(strategy, type, price, atr, strength, weight) {
    const stopDist = atr * 1.5;
    const stop = type === 'long' ? price - stopDist : price + stopDist;
    const tp1 = type === 'long' ? price + stopDist * 1.5 : price - stopDist * 1.5;
    const tp2 = type === 'long' ? price + stopDist * 2.5 : price - stopDist * 2.5;
    const tp3 = type === 'long' ? price + stopDist * 4.0 : price - stopDist * 4.0;
    const rr = 1.5; // tp1 / stop

    this.pendingSignals.push({
      strategy, type, price, atr, strength, weight,
      stop, tp1, tp2, tp3, rr,
      score: (strength / 10) * weight * rr,
    });
  }

  executeSignal(signal) {
    const pointValue = this.getPointValue();
    const riskAmount = this.capital * 0.005;
    const stopDist = Math.abs(signal.price - signal.stop);
    if (stopDist < 10) return;

    const contracts = Math.max(1, Math.floor(riskAmount / (stopDist * pointValue)));
    const actualRisk = contracts * stopDist * pointValue;

    const pos = {
      id: Date.now().toString(36),
      type: signal.type === 'long' ? 'long' : 'short',
      strategy: signal.strategy,
      entry: signal.price,
      stop: signal.stop,
      stopDistance: stopDist,
      trailingStop: null,
      trailDistance: stopDist,
      breakeven: false,
      takeProfits: [
        { level: signal.tp1, size: 0.3, hit: false },
        { level: signal.tp2, size: 0.4, hit: false },
        { level: signal.tp3, size: 0.3, hit: false },
      ],
      remaining: 1,
      contracts,
      risk: actualRisk,
      openedAt: new Date().toISOString(),
    };

    this.openPositions.push(pos);

    this.broadcast({
      type: 'agent_entry',
      strategy: signal.strategy,
      direction: signal.type,
      price: signal.price,
      stop: signal.stop,
      targets: [signal.tp1, signal.tp2, signal.tp3],
      contracts,
      risk: actualRisk,
      score: signal.score,
    });

    console.log(`[Agent] ${signal.type.toUpperCase()} ${signal.strategy} @ ${signal.price} | Stop: ${signal.stop} | Score: ${signal.score.toFixed(2)} | R$ ${actualRisk.toFixed(2)}`);
  }

  // ============================================================
  // CONTROLS
  // ============================================================
  start() {
    if (this.state === 'off' || this.state === 'paused') {
      this.state = 'running';
      this.consecutiveLosses = 0;
      console.log('[Agent] Started');
      this.broadcast({ type: 'agent_started' });
    }
  }

  pause() {
    if (this.state === 'running') {
      this.state = 'paused';
      console.log('[Agent] Paused');
      this.broadcast({ type: 'agent_paused', reason: 'manual' });
    }
  }

  stop() {
    this.state = 'off';
    // Close all open positions at current price
    console.log('[Agent] Stopped');
    this.broadcast({ type: 'agent_stopped' });
  }

  reset() {
    this.openPositions = [];
    this.closedTrades = [];
    this.capital = 10000;
    this.initialCapital = 10000;
    this.peakCapital = 10000;
    this.totalTrades = 0;
    this.wins = 0;
    this.losses = 0;
    this.consecutiveLosses = 0;
    this.state = 'off';
    this.saveState();
    console.log('[Agent] Reset');
    this.broadcast({ type: 'agent_reset' });
  }

  // ============================================================
  // HELPERS
  // ============================================================
  calcSMA(data, period) {
    if (data.length < period) return null;
    const result = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) { result.push(null); continue; }
      result.push(data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period);
    }
    return result;
  }

  calcRSI(data, period) {
    if (data.length < period + 1) return null;
    const result = [];
    let gains = 0, losses = 0;
    for (let i = 1; i < data.length; i++) {
      const diff = data[i] - data[i - 1];
      if (i <= period) {
        if (diff > 0) gains += diff; else losses -= diff;
        if (i < period) { result.push(null); continue; }
      } else {
        if (diff > 0) { gains = (gains * (period - 1) + diff) / period; losses = (losses * (period - 1)) / period; }
        else { gains = (gains * (period - 1)) / period; losses = (losses * (period - 1) - diff) / period; }
      }
      result.push(losses === 0 ? 100 : 100 - (100 / (1 + gains / losses)));
    }
    return result;
  }

  calcATR(data) {
    if (data.length < 2) return data[0] ? data[0].h - data[0].l : 100;
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const tr = i === 0 ? data[i].h - data[i].l :
        Math.max(data[i].h - data[i].l, Math.abs(data[i].h - data[i - 1].c), Math.abs(data[i].l - data[i - 1].c));
      sum += tr;
    }
    return sum / data.length;
  }

  // Get full agent status
  getStatus() {
    const winRate = this.totalTrades > 0 ? (this.wins / this.totalTrades * 100).toFixed(1) : '--';
    const totalPnl = this.capital - this.initialCapital;
    const dd = this.peakCapital > 0 ? ((this.peakCapital - this.capital) / this.peakCapital * 100).toFixed(1) : '0.0';
    const pf = this.losses > 0
      ? (this.closedTrades.filter(t => t.result === 'win').reduce((s, t) => s + (t.pnl || 0), 0) /
         Math.abs(this.closedTrades.filter(t => t.result === 'loss').reduce((s, t) => s + (t.pnl || 0), 0)))
      : 0;
    const market = this.getMarket();

    return {
      market: { id: market.id, name: market.name, symbol: market.yhSymbol, pointValue: market.pointValue, flag: market.flag },
      state: this.state,
      capital: this.capital,
      initialCapital: this.initialCapital,
      pnl: totalPnl,
      pnlPct: (totalPnl / this.initialCapital * 100).toFixed(1),
      totalTrades: this.totalTrades,
      wins: this.wins,
      losses: this.losses,
      winRate,
      profitFactor: pf.toFixed(2),
      drawdown: dd,
      openPositions: this.openPositions.length,
      dailyLoss: this.dailyLoss,
      consecutiveLosses: this.consecutiveLosses,
      openTrades: this.openPositions.map(p => ({
        strategy: p.strategy,
        type: p.type,
        entry: p.entry,
        stop: p.trailingStop || p.stop,
        breakeven: p.breakeven,
        targets: p.takeProfits.filter(t => !t.hit).map(t => t.level),
      })),
    };
  }
}

module.exports = { Agent };
