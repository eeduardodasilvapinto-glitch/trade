// ============================================================================
// ENGINE: LEARNER — Cérebro de aprendizado contínuo 24/7
// Estuda, analisa, detecta degradação, ajusta pesos, gera insights
// ============================================================================

const fs = require('fs');
const path = require('path');

class Learner {
  constructor(dataDir, broadcastFn) {
    this.dataDir = dataDir;
    this.broadcast = broadcastFn || (() => {});
    this.knowledgePath = path.join(dataDir, 'knowledge.json');
    this.knowledge = this.loadKnowledge();
    this.lastStudy = null;
    this.lastDeepStudy = null;
    this.studyCount = 0;
    this.deepStudyCount = 0;
    this.virtualCapital = 10000;
    this.learningRate = 0;
  }

  // ============================================================
  // KNOWLEDGE MANAGEMENT
  // ============================================================
  loadKnowledge() {
    try {
      if (fs.existsSync(this.knowledgePath)) {
        return JSON.parse(fs.readFileSync(this.knowledgePath, 'utf-8'));
      }
    } catch (e) { console.error('[Learner] Error loading knowledge:', e.message); }
    return this.defaultKnowledge();
  }

  defaultKnowledge() {
    return {
      version: 1,
      created: new Date().toISOString(),
      lastUpdate: new Date().toISOString(),
      totalStudyCycles: 0,
      totalDeepStudies: 0,
      totalHypothesesTested: 0,
      totalDiscoveries: 0,
      strategies: {},
      patterns: {},
      discoveries: [],
      mistakes: [],
      evolution: { weeklyWR: [], weeklyPF: [], learningRate: [], snapshots: [] },
      marketRegime: { current: 'unknown', history: [] },
      rules: [],
    };
  }

  saveKnowledge() {
    this.knowledge.lastUpdate = new Date().toISOString();
    this.knowledge.version++;
    this.knowledge.totalStudyCycles = this.studyCount;
    this.knowledge.totalDeepStudies = this.deepStudyCount;
    try {
      if (!fs.existsSync(this.dataDir)) fs.mkdirSync(this.dataDir, { recursive: true });
      fs.writeFileSync(this.knowledgePath, JSON.stringify(this.knowledge, null, 2));
    } catch (e) { console.error('[Learner] Error saving knowledge:', e.message); }
  }

  // ============================================================
  // CONTINUOUS STUDY — Roda a cada 15 minutos
  // ============================================================
  async continuousStudy() {
    this.studyCount++;
    console.log(`[Learner] Study #${this.studyCount} iniciado`);

    try {
      // 1. Load latest pattern stats
      const stats = this.loadStats();
      const trades = this.loadDiary();

      // 2. Update strategy performance
      if (trades.length > 0) {
        this.updateStrategyPerformance(trades);
      }

      // 3. Update pattern performance
      if (Object.keys(stats).length > 0) {
        this.updatePatternPerformance(stats);
      }

      // 4. Detect performance drift
      this.detectDrift(trades);

      // 5. Detect new reliable patterns
      if (this.studyCount % 4 === 0) { // every hour
        await this.hourlyDeepStudy(stats, trades);
      }

      // 6. Check for decaying strategies
      this.checkStrategyHealth();

      // 7. Save knowledge
      this.saveKnowledge();

      // 8. Calculate learning rate
      this.calculateLearningRate();

      this.lastStudy = new Date().toISOString();

      this.broadcast({
        type: 'learner_update',
        studyCount: this.studyCount,
        activeStrategies: this.getActiveCount(),
        lastDiscovery: this.knowledge.discoveries.slice(-1)[0],
        learningRate: this.learningRate,
      });

      console.log(`[Learner] Study #${this.studyCount} completo. ${this.getActiveCount()} estratégias ativas, WR médio ${this.getAverageWR()}%, taxa de aprendizado ${(this.learningRate*100).toFixed(1)}%/semana`);
    } catch (e) {
      console.error('[Learner] Study error:', e.message);
    }
  }

  // ============================================================
  // HOURLY DEEP STUDY
  // ============================================================
  async hourlyDeepStudy(stats, trades) {
    this.deepStudyCount++;
    console.log(`[Learner] Deep study #${this.deepStudyCount}`);

    // 1. Analyze time-of-day performance
    this.analyzeTimeOfDay(trades);

    // 2. Analyze day-of-week performance
    this.analyzeDayOfWeek(trades);

    // 3. Analyze regime-based performance
    this.analyzeRegimePerformance(trades);

    // 4. Detect market regime
    this.detectMarketRegime(stats);

    // 5. Find correlations between patterns
    this.findPatternCorrelations(stats);

    // 6. Generate insights for AI
    const insights = this.generateInsights(stats, trades);
    if (insights.length > 0) {
      this.broadcast({
        type: 'learner_insights',
        insights: insights.slice(0, 5),
        timestamp: new Date().toISOString(),
      });
    }

    this.lastDeepStudy = new Date().toISOString();
  }

  // ============================================================
  // STRATEGY PERFORMANCE TRACKING
  // ============================================================
  updateStrategyPerformance(trades) {
    // Group trades by strategy/setup
    const groups = {};
    for (const t of trades) {
      if (!t.setup || !t.result || t.result === 'ignored') continue;
      const key = t.setup || 'unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    }

    for (const [name, group] of Object.entries(groups)) {
      if (!this.knowledge.strategies[name]) {
        this.knowledge.strategies[name] = {
          name,
          status: 'active', // active, paused, retired
          activeSince: new Date().toISOString(),
          totalTrades: 0,
          rollingWindow: [], // last 50 trades
          bestParams: { atrMult: 1.5, rrMin: 2.0, lookback: 20 },
          versions: [{ v: 1, pf: 0, wr: 0, date: new Date().toISOString(), change: 'initial' }],
        };
      }

      const s = this.knowledge.strategies[name];
      s.totalTrades += group.length;

      // Add to rolling window
      for (const t of group) {
        s.rollingWindow.push({
          date: t.date || t.createdAt,
          result: t.result,
          pnl: t.pnl || 0,
          pts: t.pts || 0,
        });
        if (s.rollingWindow.length > 50) s.rollingWindow.shift();
      }

      // Calculate current metrics
      const recent = s.rollingWindow.slice(-50);
      const wins = recent.filter(t => t.result === 'win');
      const losses = recent.filter(t => t.result === 'loss');
      s.currentWR = wins.length / Math.max(1, wins.length + losses.length) * 100;
      s.currentPF = losses.reduce((s, t) => s + Math.abs(t.pnl || 0), 0) > 0
        ? wins.reduce((s, t) => s + (t.pnl || 0), 0) / Math.max(0.01, losses.reduce((s, t) => s + Math.abs(t.pnl || 0), 0))
        : wins.length > 0 ? 999 : 0;
      s.currentExpectancy = recent.length > 0
        ? recent.reduce((s, t) => s + (t.pnl || 0), 0) / recent.length
        : 0;

      // Determine trend
      const firstHalf = recent.slice(0, 25);
      const secondHalf = recent.slice(25);
      const wr1 = firstHalf.filter(t => t.result === 'win').length / Math.max(1, firstHalf.length);
      const wr2 = secondHalf.filter(t => t.result === 'win').length / Math.max(1, secondHalf.length);
      s.trend = wr2 > wr1 * 1.05 ? 'improving' : wr2 < wr1 * 0.95 ? 'declining' : 'stable';

      // Auto-pause/retire
      if (recent.length >= 20 && s.currentPF < 1.0 && s.status === 'active') {
        s.status = 'paused';
        s.pausedAt = new Date().toISOString();
        s.pauseReason = `PF caiu para ${s.currentPF.toFixed(2)}`;
        this.knowledge.mistakes.push({
          date: new Date().toISOString(),
          strategy: name,
          mistake: `Estrategia pausada automaticamente`,
          fix: `PF abaixo de 1.0 nos ultimos ${recent.length} trades`,
        });
      }

      if (recent.length >= 50 && s.currentPF < 0.8 && s.status === 'paused') {
        s.status = 'retired';
        s.retiredAt = new Date().toISOString();
      }

      // Auto-reactivate
      if (s.status === 'paused' && recent.length >= 10 && s.currentPF >= 1.5) {
        s.status = 'active';
        s.reactivatedAt = new Date().toISOString();
      }
    }
  }

  // ============================================================
  // PATTERN PERFORMANCE
  // ============================================================
  updatePatternPerformance(stats) {
    for (const [key, p] of Object.entries(stats)) {
      const name = p.pattern;
      if (!this.knowledge.patterns[name]) {
        this.knowledge.patterns[name] = {
          name,
          timeframe: p.timeframe,
          occurrences: 0,
          history: [],
        };
      }
      const pat = this.knowledge.patterns[name];
      pat.occurrences = p.occurrences;
      pat.winRate = p.winRate_5;
      pat.profitFactor = p.profitFactor_5;
      pat.expectancy = p.expectancy_5;

      // Track over time
      if (pat.history.length === 0 || pat.history[pat.history.length - 1].occurrences !== p.occurrences) {
        pat.history.push({
          date: new Date().toISOString(),
          occurrences: p.occurrences,
          winRate: p.winRate_5,
          profitFactor: p.profitFactor_5,
        });
        if (pat.history.length > 100) pat.history.shift();
      }
    }
  }

  // ============================================================
  // DRIFT DETECTION
  // ============================================================
  detectDrift(trades) {
    for (const [name, strat] of Object.entries(this.knowledge.strategies)) {
      if (strat.rollingWindow.length < 20) continue;

      const recent = strat.rollingWindow.slice(-20);
      const older = strat.rollingWindow.slice(-40, -20);
      if (older.length < 10) continue;

      const recentWR = recent.filter(t => t.result === 'win').length / recent.length;
      const olderWR = older.filter(t => t.result === 'win').length / older.length;

      // Detect significant drop
      if (olderWR > 0.45 && recentWR < olderWR * 0.7 && recent.length >= 10) {
        const drift = {
          date: new Date().toISOString(),
          strategy: name,
          oldWR: (olderWR * 100).toFixed(1),
          newWR: (recentWR * 100).toFixed(1),
          severity: 'high',
          action: 'Reduzir peso em 50%',
        };

        // Only add if not already reported recently
        const existing = this.knowledge.mistakes.filter(m =>
          m.strategy === name && m.type === 'drift' &&
          (Date.now() - new Date(m.date).getTime()) < 86400000
        );
        if (existing.length === 0) {
          this.knowledge.mistakes.push({ ...drift, type: 'drift' });
          this.broadcast({
            type: 'learner_alert',
            alert: `⚠ ${name} degradando: WR caiu de ${drift.oldWR}% para ${drift.newWR}%`,
            drift,
          });
        }
      }
    }
  }

  // ============================================================
  // TIME ANALYSIS
  // ============================================================
  analyzeTimeOfDay(trades) {
    if (!this.knowledge.timeOfDay) this.knowledge.timeOfDay = {};
    const hours = {};
    for (const t of trades) {
      if (!t.time) continue;
      const h = parseInt(t.time.split(':')[0]);
      if (!hours[h]) hours[h] = { wins: 0, losses: 0, total: 0, pnl: 0 };
      hours[h].total++;
      hours[h].pnl += (t.pnl || 0);
      if (t.result === 'win') hours[h].wins++;
      else if (t.result === 'loss') hours[h].losses++;
    }

    for (const [h, data] of Object.entries(hours)) {
      this.knowledge.timeOfDay[h] = {
        total: data.total,
        winRate: (data.wins / Math.max(1, data.wins + data.losses) * 100).toFixed(1),
        avgPnl: (data.pnl / Math.max(1, data.total)).toFixed(1),
        rating: data.total >= 5 ? (data.wins / Math.max(1, data.wins + data.losses) > 0.5 ? 'good' : 'bad') : 'unknown',
      };
    }
  }

  analyzeDayOfWeek(trades) {
    if (!this.knowledge.dayOfWeek) this.knowledge.dayOfWeek = {};
    const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
    const dow = {};
    for (const t of trades) {
      if (!t.date) continue;
      const d = new Date(t.date).getDay();
      if (!dow[d]) dow[d] = { wins: 0, losses: 0, total: 0, pnl: 0 };
      dow[d].total++;
      dow[d].pnl += (t.pnl || 0);
      if (t.result === 'win') dow[d].wins++;
      else if (t.result === 'loss') dow[d].losses++;
    }
    for (const [d, data] of Object.entries(dow)) {
      this.knowledge.dayOfWeek[days[d]] = {
        total: data.total,
        winRate: (data.wins / Math.max(1, data.wins + data.losses) * 100).toFixed(1),
        avgPnl: (data.pnl / Math.max(1, data.total)).toFixed(1),
      };
    }
  }

  // ============================================================
  // REGIME DETECTION
  // ============================================================
  detectMarketRegime(stats) {
    // Load recent OHLCV data
    let data = [];
    try {
      const p = path.join(this.dataDir, 'ohlcv_D1.json');
      if (fs.existsSync(p)) data = JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch (e) { return; }

    if (data.length < 20) return;

    // Calculate ADX-like metric (simplified)
    const closes = data.map(d => d.c);
    const highs = data.map(d => d.h);
    const lows = data.map(d => d.l);

    // Simple trend detection
    const sma20 = this.calcSMA(closes.slice(-20), 20);
    const sma50 = this.calcSMA(closes.slice(-50), 50);
    const lastPrice = closes[closes.length - 1];

    // Calculate range volatility
    const recentRanges = data.slice(-20).map(d => (d.h - d.l) / d.l * 100);
    const avgRange = recentRanges.reduce((a, b) => a + b, 0) / recentRanges.length;
    const lastRange = recentRanges[recentRanges.length - 1];

    let regime = 'unknown';
    if (sma20 && sma50) {
      if (sma20 > sma50 && lastPrice > sma20) regime = 'trending_bull';
      else if (sma20 < sma50 && lastPrice < sma20) regime = 'trending_bear';
      else if (Math.abs(sma20 - sma50) / sma50 < 0.02) regime = 'ranging';
    }
    if (lastRange > avgRange * 1.5) regime = 'volatile';

    // Record regime change
    if (this.knowledge.marketRegime.current !== regime) {
      this.knowledge.marketRegime.history.push({
        date: new Date().toISOString(),
        previous: this.knowledge.marketRegime.current,
        current: regime,
      });
      if (this.knowledge.marketRegime.history.length > 100) this.knowledge.marketRegime.history.shift();
    }
    this.knowledge.marketRegime.current = regime;
  }

  // ============================================================
  // PATTERN CORRELATIONS
  // ============================================================
  findPatternCorrelations(stats) {
    const discoveries = [];
    const allPatterns = Object.values(stats).filter(p => p.occurrences >= 10);

    // Find pairs of patterns that frequently co-occur with high WR
    for (let i = 0; i < Math.min(allPatterns.length, 30); i++) {
      for (let j = i + 1; j < Math.min(allPatterns.length, 30); j++) {
        const a = allPatterns[i], b = allPatterns[j];
        if (a.timeframe === b.timeframe && a.direction === b.direction &&
            (a.winRate_5 || 0) > 55 && (b.winRate_5 || 0) > 55) {
          const key = `${a.pattern}+${b.pattern}`;
          const existing = this.knowledge.discoveries.find(d => d.finding.includes(key));
          if (!existing) {
            discoveries.push({
              date: new Date().toISOString(),
              finding: `${a.pattern} + ${b.pattern} [${a.timeframe}]: WR medio ${(((a.winRate_5||0)+(b.winRate_5||0))/2).toFixed(1)}%`,
              confidence: 'medium',
              category: 'correlation',
            });
          }
        }
      }
    }

    if (discoveries.length > 0) {
      this.knowledge.discoveries.push(...discoveries);
      this.knowledge.totalDiscoveries += discoveries.length;
    }
  }

  // ============================================================
  // STRATEGY HEALTH CHECK
  // ============================================================
  checkStrategyHealth() {
    for (const [name, strat] of Object.entries(this.knowledge.strategies)) {
      if (strat.status === 'retired') continue;

      const recent = (strat.rollingWindow || []).slice(-50);
      if (recent.length < 10) continue;

      const wins = recent.filter(t => t.result === 'win').length;
      const wr = wins / recent.length * 100;

      // Compute losing streak
      let losingStreak = 0, maxLosingStreak = 0;
      for (const t of recent) {
        if (t.result === 'loss') { losingStreak++; maxLosingStreak = Math.max(maxLosingStreak, losingStreak); }
        else losingStreak = 0;
      }

      if (maxLosingStreak >= 5 && strat.status === 'active') {
        this.broadcast({
          type: 'learner_alert',
          alert: `⚠ ${name}: ${maxLosingStreak} losses consecutivas. Considere pausar.`,
        });
      }
    }
  }

  // ============================================================
  // INSIGHTS GENERATION
  // ============================================================
  generateInsights(stats, trades) {
    const insights = [];

    // Best time to trade
    if (this.knowledge.timeOfDay) {
      const best = Object.entries(this.knowledge.timeOfDay)
        .filter(([h, d]) => d.total >= 5 && d.rating === 'good')
        .sort((a, b) => b[1].winRate - a[1].winRate);
      if (best.length > 0) {
        insights.push(`Melhor horario: ${best[0][0]}h (WR ${best[0][1].winRate}%, ${best[0][1].total} trades)`);
      }
    }

    // Best day
    if (this.knowledge.dayOfWeek) {
      const bestDay = Object.entries(this.knowledge.dayOfWeek)
        .filter(([d, data]) => data.total >= 5)
        .sort((a, b) => b[1].winRate - a[1].winRate);
      if (bestDay.length > 0) {
        insights.push(`Melhor dia: ${bestDay[0][0]} (WR ${bestDay[0][1].winRate}%)`);
      }
    }

    // Best strategy
    const activeStrats = Object.values(this.knowledge.strategies).filter(s => s.status === 'active');
    if (activeStrats.length > 0) {
      const best = activeStrats.sort((a, b) => (b.currentPF || 0) - (a.currentPF || 0))[0];
      insights.push(`Melhor estrategia: ${best.name} (PF ${best.currentPF?.toFixed(2)}, WR ${best.currentWR?.toFixed(1)}%)`);
    }

    // Regime advice
    const regime = this.knowledge.marketRegime.current;
    if (regime === 'ranging') insights.push('Mercado em range: priorizar estrategias de reversao');
    if (regime === 'trending_bull') insights.push('Tendencia de alta: priorizar estrategias de compra');
    if (regime === 'trending_bear') insights.push('Tendencia de baixa: priorizar estrategias de venda');
    if (regime === 'volatile') insights.push('Alta volatilidade: reduzir tamanho das posicoes');

    return insights;
  }

  // ============================================================
  // LEARNING RATE CALCULATION
  // ============================================================
  calculateLearningRate() {
    const strats = Object.values(this.knowledge.strategies).filter(s => s.rollingWindow?.length >= 20);
    if (strats.length === 0) { this.learningRate = 0; return; }

    const avgPF = strats.reduce((s, st) => s + (st.currentPF || 0), 0) / strats.length;
    const avgWR = strats.reduce((s, st) => s + (st.currentWR || 0), 0) / strats.length;

    // Track evolution
    this.knowledge.evolution.weeklyPF.push({ date: new Date().toISOString(), pf: avgPF });
    this.knowledge.evolution.weeklyWR.push({ date: new Date().toISOString(), wr: avgWR });
    if (this.knowledge.evolution.weeklyPF.length > 50) this.knowledge.evolution.weeklyPF.shift();
    if (this.knowledge.evolution.weeklyWR.length > 50) this.knowledge.evolution.weeklyWR.shift();

    // Calculate learning rate slope
    const pfHistory = this.knowledge.evolution.weeklyPF;
    if (pfHistory.length >= 4) {
      const recent4 = pfHistory.slice(-4);
      const slope = (recent4[3].pf - recent4[0].pf) / 4;
      this.learningRate = slope / Math.max(1, recent4[0].pf);
    }
  }

  // ============================================================
  // HELPERS
  // ============================================================
  loadStats() {
    try {
      const p = path.join(this.dataDir, 'pattern_stats.json');
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch (e) {}
    return {};
  }

  loadDiary() {
    try {
      const p = path.join(this.dataDir, 'diary.json');
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch (e) {}
    return [];
  }

  calcSMA(data, period) {
    if (data.length < period) return null;
    return data.slice(-period).reduce((a, b) => a + b, 0) / period;
  }

  getActiveCount() {
    return Object.values(this.knowledge.strategies).filter(s => s.status === 'active').length;
  }

  getAverageWR() {
    const actives = Object.values(this.knowledge.strategies).filter(s => s.status === 'active');
    if (actives.length === 0) return 0;
    return (actives.reduce((s, st) => s + (st.currentWR || 0), 0) / actives.length).toFixed(1);
  }

  // Get strategy weights for position sizing
  getStrategyWeights() {
    const weights = {};
    const actives = Object.values(this.knowledge.strategies).filter(s => s.status === 'active');
    if (actives.length === 0) return weights;

    let totalScore = 0;
    for (const s of actives) {
      const score = Math.max(0, (s.currentWR || 0) / 100 * (s.currentPF || 1));
      weights[s.name] = score;
      totalScore += score;
    }

    if (totalScore > 0) {
      for (const key of Object.keys(weights)) {
        weights[key] = weights[key] / totalScore;
      }
    }

    return weights;
  }

  // Get regime-appropriate filter
  getRegimeFilter() {
    const regime = this.knowledge.marketRegime.current;
    switch (regime) {
      case 'trending_bull': return { preferDirection: 'bullish', avoidDirection: 'bearish', minRR: 1.5 };
      case 'trending_bear': return { preferDirection: 'bearish', avoidDirection: 'bullish', minRR: 1.5 };
      case 'ranging': return { preferDirection: null, avoidDirection: null, minRR: 2.0 };
      case 'volatile': return { preferDirection: null, avoidDirection: null, minRR: 2.5, reduceSize: 0.5 };
      default: return { preferDirection: null, avoidDirection: null, minRR: 1.5 };
    }
  }
}

module.exports = { Learner };
