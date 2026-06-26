// ============================================================================
// ENGINE: META-LEARNER — Aprende a aprender
// Gera hipóteses, testa, evolui estratégias, detecta concept drift
// ============================================================================

const fs = require('fs');
const path = require('path');

class MetaLearner {
  constructor(dataDir, broadcastFn, learner) {
    this.dataDir = dataDir;
    this.broadcast = broadcastFn || (() => {});
    this.learner = learner;
    this.cycleCount = 0;
    this.hypotheses = [];
    this.confirmedRules = [];
    this.evolutionLog = [];
  }

  // ============================================================
  // MAIN CYCLE — Roda a cada 6 horas
  // ============================================================
  async cycle() {
    this.cycleCount++;
    console.log(`[Meta] Cycle #${this.cycleCount}`);

    // 1. Analyze learning speed
    this.analyzeLearningSpeed();

    // 2. Detect concept drift
    this.detectConceptDrift();

    // 3. Generate new hypotheses
    const newHypotheses = this.generateHypotheses();
    if (newHypotheses.length > 0) {
      this.hypotheses.push(...newHypotheses);
    }

    // 4. Test pending hypotheses
    await this.testHypotheses();

    // 5. Evolve strategies
    this.evolveStrategies();

    // 6. Prune useless rules
    this.pruneRules();

    // 7. Save
    this.saveMetaKnowledge();

    console.log(`[Meta] Cycle complete. ${this.hypotheses.length} hypotheses, ${this.confirmedRules.length} confirmed rules`);
  }

  // ============================================================
  // LEARNING SPEED ANALYSIS
  // ============================================================
  analyzeLearningSpeed() {
    if (!this.learner) return;

    const strats = Object.values(this.learner.knowledge.strategies).filter(s => s.rollingWindow?.length >= 20);
    if (strats.length < 2) return;

    // Measure: how fast does WR improve per 50 trades?
    let totalSpeed = 0;
    let stratCount = 0;

    for (const s of strats) {
      const window = s.rollingWindow || [];
      if (window.length < 40) continue;

      const first20 = window.slice(0, 20);
      const last20 = window.slice(-20);
      const firstWR = first20.filter(t => t.result === 'win').length / Math.max(1, first20.length);
      const lastWR = last20.filter(t => t.result === 'win').length / Math.max(1, last20.length);
      const improvement = lastWR - firstWR;

      totalSpeed += improvement;
      stratCount++;
    }

    const avgSpeed = stratCount > 0 ? totalSpeed / stratCount : 0;

    this.evolutionLog.push({
      date: new Date().toISOString(),
      type: 'learning_speed',
      speed: avgSpeed,
      trend: avgSpeed > 0.01 ? 'accelerating' : avgSpeed > 0 ? 'learning' : avgSpeed < -0.02 ? 'declining' : 'plateau',
    });
  }

  // ============================================================
  // CONCEPT DRIFT DETECTION
  // ============================================================
  detectConceptDrift() {
    if (!this.learner) return;

    for (const [name, strat] of Object.entries(this.learner.knowledge.strategies)) {
      if (strat.status === 'retired') continue;
      const window = strat.rollingWindow || [];
      if (window.length < 30) continue;

      // Split in 3 parts: old, middle, recent
      const third = Math.floor(window.length / 3);
      const old = window.slice(0, third);
      const mid = window.slice(third, third * 2);
      const recent = window.slice(third * 2);

      const oldWR = old.filter(t => t.result === 'win').length / Math.max(1, old.length);
      const midWR = mid.filter(t => t.result === 'win').length / Math.max(1, mid.length);
      const recentWR = recent.filter(t => t.result === 'win').length / Math.max(1, recent.length);

      // Linear decline across all 3 periods = concept drift
      if (oldWR > midWR && midWR > recentWR && (oldWR - recentWR) > 0.15) {
        const drift = {
          date: new Date().toISOString(),
          strategy: name,
          type: 'concept_drift',
          severity: 'high',
          wrGradient: [oldWR, midWR, recentWR].map(w => (w * 100).toFixed(1)),
          action: 'Esta estrategia esta perdendo eficacia. Considere aposentar.',
        };

        this.learner.knowledge.discoveries.push({
          date: new Date().toISOString(),
          finding: `Concept drift detectado em ${name}: WR ${oldWR*100|0}% → ${midWR*100|0}% → ${recentWR*100|0}%`,
          confidence: 'high',
          category: 'drift',
        });

        this.broadcast({ type: 'meta_alert', alert: `⚠ Drift: ${name} perdendo eficácia (WR ${oldWR*100|0}→${recentWR*100|0}%)`, drift });
      }
    }
  }

  // ============================================================
  // HYPOTHESIS GENERATION
  // ============================================================
  generateHypotheses() {
    const hypotheses = [];
    if (!this.learner) return hypotheses;

    const knowledge = this.learner.knowledge;

    // H1: Does adding volume filter improve WR?
    if (knowledge.strategies['Pullback_SMA20']?.currentPF > 1) {
      hypotheses.push({
        id: `H${Date.now()}`,
        question: 'Pullback + volume acima da media melhora PF?',
        strategy: 'Pullback_SMA20',
        change: 'add_volume_filter',
        priority: 'high',
        status: 'pending',
        created: new Date().toISOString(),
      });
    }

    // H2: Different ATR multiplier for different times
    if (knowledge.timeOfDay && Object.keys(knowledge.timeOfDay).length > 3) {
      const morningWR = knowledge.timeOfDay['9']?.winRate || 50;
      const afternoonWR = knowledge.timeOfDay['14']?.winRate || 50;
      if (Math.abs(parseFloat(morningWR) - parseFloat(afternoonWR)) > 10) {
        hypotheses.push({
          id: `H${Date.now() + 1}`,
          question: 'Usar stops diferentes por horario?',
          strategy: 'all',
          change: 'adaptive_stop_by_time',
          priority: 'medium',
          status: 'pending',
          created: new Date().toISOString(),
        });
      }
    }

    // H3: Combine two best strategies
    const actives = Object.values(knowledge.strategies).filter(s => s.status === 'active' && s.currentPF > 1.5);
    if (actives.length >= 2) {
      const best2 = actives.sort((a, b) => (b.currentPF || 0) - (a.currentPF || 0)).slice(0, 2);
      hypotheses.push({
        id: `H${Date.now() + 2}`,
        question: `Combinar ${best2[0].name} + ${best2[1].name} como filtro conjunto?`,
        strategy: 'combined',
        change: 'multi_strategy_filter',
        priority: 'high',
        status: 'pending',
        created: new Date().toISOString(),
      });
    }

    // H4: Optimal R:R per regime
    const regime = knowledge.marketRegime.current;
    if (regime !== 'unknown') {
      hypotheses.push({
        id: `H${Date.now() + 3}`,
        question: `Qual R:R otimo para regime ${regime}?`,
        strategy: 'all',
        change: 'adaptive_rr_by_regime',
        priority: 'medium',
        status: 'pending',
        created: new Date().toISOString(),
      });
    }

    return hypotheses;
  }

  // ============================================================
  // HYPOTHESIS TESTING — Simula em dados históricos
  // ============================================================
  async testHypotheses() {
    const pending = this.hypotheses.filter(h => h.status === 'pending');
    if (pending.length === 0) return;

    const toTest = pending[0]; // Test one at a time
    console.log(`[Meta] Testing: ${toTest.question}`);

    // Simple test: check if hypothesis makes logical sense based on data
    let confidence = 'low';
    let result = 'inconclusive';

    if (this.learner) {
      // For now, use pattern data to evaluate
      const stats = this.learner.loadStats();
      const patterns = Object.values(stats);

      if (toTest.change === 'add_volume_filter') {
        // Check if volume patterns correlate with better WR
        const volPatterns = patterns.filter(p => p.category === 'volume');
        const avgVolWR = volPatterns.length > 0 ? volPatterns.reduce((s, p) => s + (p.winRate_5 || 0), 0) / volPatterns.length : 0;
        const allAvgWR = patterns.length > 0 ? patterns.reduce((s, p) => s + (p.winRate_5 || 0), 0) / patterns.length : 0;

        if (avgVolWR > allAvgWR * 1.1) {
          confidence = 'medium';
          result = 'confirmed';
          this.confirmedRules.push({
            rule: 'Adicionar filtro de volume melhora a taxa de acerto',
            evidence: `WR com volume: ${avgVolWR.toFixed(1)}% vs media: ${allAvgWR.toFixed(1)}%`,
            applied: false,
          });
        }
      } else if (toTest.change === 'adaptive_stop_by_time') {
        // Check time-of-day data
        const morning = parseFloat(this.learner.knowledge.timeOfDay?.['9']?.winRate || 50);
        const afternoon = parseFloat(this.learner.knowledge.timeOfDay?.['14']?.winRate || 50);
        if (Math.abs(morning - afternoon) > 5) {
          confidence = 'medium';
          result = 'confirmed';
          this.confirmedRules.push({
            rule: `Ajustar gestao por horario: manha WR ${morning}%, tarde WR ${afternoon}%`,
            evidence: `Diferenca de ${Math.abs(morning - afternoon).toFixed(1)}%`,
            applied: false,
          });
        }
      } else {
        result = 'inconclusive';
        confidence = 'low';
      }
    }

    toTest.status = result === 'confirmed' ? 'confirmed' : 'rejected';
    toTest.confidence = confidence;
    toTest.result = result;
    toTest.testedAt = new Date().toISOString();

    if (result === 'confirmed') {
      this.learner.knowledge.totalHypothesesTested = (this.learner.knowledge.totalHypothesesTested || 0) + 1;
      this.learner.knowledge.discoveries.push({
        date: new Date().toISOString(),
        finding: toTest.question + ` → CONFIRMADO (${confidence})`,
        confidence,
        category: 'meta_learning',
      });
      this.broadcast({ type: 'meta_discovery', hypothesis: toTest });
    }
  }

  // ============================================================
  // STRATEGY EVOLUTION
  // ============================================================
  evolveStrategies() {
    if (!this.learner) return;

    for (const [name, strat] of Object.entries(this.learner.knowledge.strategies)) {
      if (strat.status !== 'active' || strat.rollingWindow?.length < 30) continue;

      // Check if confirmed rules apply to this strategy
      for (const rule of this.confirmedRules) {
        if (rule.applied) continue;

        if (rule.rule.includes(name) || rule.rule.includes('todas')) {
          // Apply rule
          const version = {
            v: (strat.versions?.length || 1) + 1,
            pf: strat.currentPF,
            wr: strat.currentWR,
            date: new Date().toISOString(),
            change: rule.rule.substring(0, 80),
          };

          if (!strat.versions) strat.versions = [];
          strat.versions.push(version);
          rule.applied = true;
          rule.appliedTo = name;

          console.log(`[Meta] Evolved ${name} to v${version.v}: ${rule.rule}`);
          this.evolutionLog.push({
            date: new Date().toISOString(),
            type: 'strategy_evolution',
            strategy: name,
            version: version.v,
            rule: rule.rule,
          });
        }
      }
    }
  }

  // ============================================================
  // PRUNE RULES
  // ============================================================
  pruneRules() {
    if (!this.learner) return;

    // Remove strategies that have been retired for > 60 days
    const now = Date.now();
    const toRemove = [];
    for (const [name, strat] of Object.entries(this.learner.knowledge.strategies)) {
      if (strat.status === 'retired' && strat.retiredAt) {
        const age = now - new Date(strat.retiredAt).getTime();
        if (age > 60 * 86400000) {
          toRemove.push(name);
        }
      }
    }

    for (const name of toRemove) {
      delete this.learner.knowledge.strategies[name];
      console.log(`[Meta] Pruned retired strategy: ${name}`);
    }
  }

  // ============================================================
  // PERSISTENCE
  // ============================================================
  saveMetaKnowledge() {
    try {
      if (!fs.existsSync(this.dataDir)) fs.mkdirSync(this.dataDir, { recursive: true });
      const metaPath = path.join(this.dataDir, 'meta_knowledge.json');
      fs.writeFileSync(metaPath, JSON.stringify({
        cycles: this.cycleCount,
        hypotheses: this.hypotheses.slice(-100),
        confirmedRules: this.confirmedRules,
        evolutionLog: this.evolutionLog.slice(-200),
        lastUpdate: new Date().toISOString(),
      }, null, 2));
    } catch (e) {}
  }

  loadMetaKnowledge() {
    try {
      const metaPath = path.join(this.dataDir, 'meta_knowledge.json');
      if (fs.existsSync(metaPath)) {
        const data = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        this.cycleCount = data.cycles || 0;
        this.hypotheses = data.hypotheses || [];
        this.confirmedRules = data.confirmedRules || [];
        this.evolutionLog = data.evolutionLog || [];
      }
    } catch (e) {}
  }
}

module.exports = { MetaLearner };
