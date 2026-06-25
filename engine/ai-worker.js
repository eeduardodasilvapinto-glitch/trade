// ============================================================================
// AI WORKER — Análise contínua 24/7
// Mercado aberto: analisa padrões ao vivo
// Mercado fechado: estuda histórico, gera insights profundos
// ============================================================================

const https = require('https');

class AIWorker {
  constructor(broadcastFn, dataDir) {
    this.broadcast = broadcastFn;
    this.dataDir = dataDir;
    this.apiKey = process.env.OPENROUTER_KEY || '';
    this.isRunning = false;
    this.interval = null;
    this.lastMarketAnalysis = null;
    this.lastStudyAnalysis = null;
    this.insights = [];
    this.model = 'google/gemini-2.5-flash-lite-preview-06-20:free';
    this.sessionId = Date.now().toString(36);
  }

  start() {
    if (!this.apiKey) {
      console.log('[AIWorker] No OPENROUTER_KEY — AI desabilitada.');
      return;
    }
    console.log('[AIWorker] Iniciando analise continua 24/7...');
    this.isRunning = true;
    this.loop();
    this.interval = setInterval(() => this.loop(), 5 * 60 * 1000); // every 5 min
  }

  stop() {
    this.isRunning = false;
    if (this.interval) clearInterval(this.interval);
    console.log('[AIWorker] Parado.');
  }

  async loop() {
    if (!this.isRunning || !this.apiKey) return;
    const isOpen = this.isMarketOpen();

    try {
      if (isOpen) {
        await this.marketSession();
      } else {
        await this.studySession();
      }
    } catch (e) {
      console.error('[AIWorker] Loop error:', e.message);
    }
  }

  // ============================================================
  // MARKET SESSION (Seg-Sex 9-18h BRT)
  // ============================================================
  async marketSession() {
    const fs = require('fs');
    const path = require('path');

    // Load recent alerts
    let alerts = [];
    try {
      const alertPath = path.join(this.dataDir, 'alerts.json');
      if (fs.existsSync(alertPath)) {
        alerts = JSON.parse(fs.readFileSync(alertPath, 'utf-8')).slice(-20);
      }
    } catch (e) {}

    // Load recent scan data
    let topPatterns = [];
    try {
      const statsPath = path.join(this.dataDir, 'pattern_stats.json');
      if (fs.existsSync(statsPath)) {
        const stats = JSON.parse(fs.readFileSync(statsPath, 'utf-8'));
        topPatterns = Object.values(stats)
          .filter(p => p.occurrences >= 5 && p.winRate_5 > 40)
          .sort((a, b) => (b.winRate_5 || 0) * (b.profitFactor_5 || 1) - (a.winRate_5 || 0) * (a.profitFactor_5 || 1))
          .slice(0, 8);
      }
    } catch (e) {}

    const alertSummary = alerts.length > 0
      ? alerts.slice(-10).map(a => `${a.pattern || a.type}: ${a.direction} @ ${a.price} [${a.strength}*]`).join('\n')
      : 'Nenhum alerta recente.';

    const patternSummary = topPatterns.length > 0
      ? topPatterns.map(p => `${p.pattern} [${p.timeframe}]: WR ${p.winRate_5?.toFixed(1)}% PF ${p.profitFactor_5?.toFixed(2)} Dir ${p.direction}`).join('\n')
      : 'Sem dados de padrões.';

    const prompt = `[SESSAO DE MERCADO ABERTO - ${new Date().toLocaleString('pt-BR')}]

Voce e um trader quantitativo analisando WINFUT (Mini Indice B3) em TEMPO REAL.

ALERTAS RECENTES (ultimos padroes detectados ao vivo):
${alertSummary}

TOP PADROES ESTATISTICOS (historico):
${patternSummary}

Analise em 3-5 frases concisas em portugues:
1. Qual a leitura do momento (tendencias, armadilhas, oportunidades)?
2. Algum alerta recente merece atencao? Qual?
3. Recomendacao de acao para a proxima hora (aguardar, comprar, vender)?`;

    const response = await this.callAI(prompt, 350);

    if (response) {
      this.lastMarketAnalysis = { time: new Date().toISOString(), content: response };
      this.insights.push({ type: 'market', ...this.lastMarketAnalysis });

      this.broadcast({
        type: 'ai_insight',
        session: 'market',
        content: response,
        timestamp: new Date().toISOString(),
      });

      console.log('[AIWorker] Market insight generated');
    }
  }

  // ============================================================
  // STUDY SESSION (mercado fechado / fins de semana)
  // ============================================================
  async studySession() {
    const fs = require('fs');
    const path = require('path');

    // Load full stats
    let stats = {};
    let report = {};
    try {
      const statsPath = path.join(this.dataDir, 'pattern_stats.json');
      const reportPath = path.join(this.dataDir, 'learning_report.json');
      if (fs.existsSync(statsPath)) stats = JSON.parse(fs.readFileSync(statsPath, 'utf-8'));
      if (fs.existsSync(reportPath)) report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    } catch (e) {}

    if (Object.keys(stats).length === 0) {
      console.log('[AIWorker] No stats to study yet.');
      return;
    }

    // Different study focuses each cycle
    const focusAreas = [
      'candlestick', 'chart_patterns', 'harmonic', 'liquidity',
      'multi_tf', 'risk_management', 'time_of_day'
    ];
    const focus = focusAreas[Math.floor(Math.random() * focusAreas.length)];

    // Build focused data
    let focusData = '';
    const allPatterns = Object.values(stats);

    if (focus === 'candlestick') {
      const candles = allPatterns.filter(p => ['single','double','triple'].includes(p.category));
      candles.sort((a, b) => (b.winRate_5 || 0) - (a.winRate_5 || 0));
      focusData = candles.slice(0, 15).map((p, i) =>
        `${i+1}. ${p.pattern} [${p.timeframe}] WR:${p.winRate_5?.toFixed(1)}% PF:${p.profitFactor_5?.toFixed(2)} N:${p.occurrences} Expect:${p.expectancy_5?.toFixed(0)}`
      ).join('\n');
    } else if (focus === 'multi_tf') {
      const byTf = {};
      allPatterns.forEach(p => {
        if (!byTf[p.timeframe]) byTf[p.timeframe] = { count: 0, wrSum: 0, pfSum: 0, occ: 0 };
        byTf[p.timeframe].count++;
        byTf[p.timeframe].wrSum += p.winRate_5 || 0;
        byTf[p.timeframe].pfSum += p.profitFactor_5 || 0;
        byTf[p.timeframe].occ += p.occurrences;
      });
      focusData = Object.entries(byTf)
        .map(([tf, d]) => `${tf}: ${d.count} padroes, WR medio ${(d.wrSum/d.count).toFixed(1)}%, PF medio ${(d.pfSum/d.count).toFixed(2)}, ${d.occ} ocorrencias`)
        .join('\n');
    } else if (focus === 'risk_management') {
      const bestRR = allPatterns
        .filter(p => p.occurrences >= 10)
        .sort((a, b) => (b.profitFactor_5 || 0) - (a.profitFactor_5 || 0))
        .slice(0, 10);
      focusData = bestRR.map((p, i) =>
        `${i+1}. ${p.pattern} [${p.timeframe}] PF:${p.profitFactor_5?.toFixed(2)} WR:${p.winRate_5?.toFixed(1)}% DD:${(p.avgLoss_5pts || 0).toFixed(0)}pts`
      ).join('\n');
    } else {
      // general
      const general = allPatterns.sort((a, b) => b.occurrences - a.occurrences).slice(0, 10);
      focusData = general.map((p, i) =>
        `${i+1}. ${p.pattern} [${p.timeframe}] ${p.occurrences}x WR:${p.winRate_5?.toFixed(1)}%`
      ).join('\n');
    }

    // Count by direction
    const bullish = allPatterns.filter(p => p.direction === 'bullish');
    const bearish = allPatterns.filter(p => p.direction === 'bearish');
    const neutral = allPatterns.filter(p => p.direction === 'neutral');
    const bullWR = (bullish.reduce((s, p) => s + (p.winRate_5 || 0), 0) / (bullish.length || 1)).toFixed(1);
    const bearWR = (bearish.reduce((s, p) => s + (p.winRate_5 || 0), 0) / (bearish.length || 1)).toFixed(1);

    const prompt = `[SESSAO DE ESTUDO - Mercado Fechado - ${new Date().toLocaleString('pt-BR')}]
Foco da sessao: ${focus}
Total de padroes na base: ${Object.keys(stats).length} | ${report.totalDetections || 'N'} deteccoes totais
Bullish WR medio: ${bullWR}% | Bearish WR medio: ${bearWR}%

DADOS FOCADOS (${focus}):
${focusData}

Voce e um trader quantitativo estudando WINFUT. Analise esses dados e responda em portugues (3-5 frases):
1. Que insights emergem desses dados?
2. Ha algum vies sistemico (bullish vs bearish, timeframe especifico)?
3. Qual o principal aprendizado desta sessao?
4. Sugestao de melhoria para a estrategia.`;

    const response = await this.callAI(prompt, 400);

    if (response) {
      this.lastStudyAnalysis = { time: new Date().toISOString(), focus, content: response };
      this.insights.push({ type: 'study', ...this.lastStudyAnalysis });

      // Save study log
      try {
        const logPath = path.join(this.dataDir, 'ai_study_log.json');
        let log = [];
        if (fs.existsSync(logPath)) log = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
        log.push(this.lastStudyAnalysis);
        if (log.length > 200) log = log.slice(-200);
        fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
      } catch (e) {}

      this.broadcast({
        type: 'ai_insight',
        session: 'study',
        focus,
        content: response,
        timestamp: new Date().toISOString(),
      });

      console.log(`[AIWorker] Study insight generated (focus: ${focus})`);
    }

    // Every 10 cycles, generate a comprehensive report
    if (this.insights.length % 10 === 0) {
      await this.generateDeepReport(stats, report);
    }
  }

  // ============================================================
  // DEEP REPORT — Comprehensive analysis (runs periodically)
  // ============================================================
  async generateDeepReport(stats, report) {
    const allPatterns = Object.values(stats);

    // Find patterns with strong PF but low occurrences (undiscovered gems)
    const gems = allPatterns
      .filter(p => p.occurrences >= 5 && p.occurrences <= 20 && (p.profitFactor_5 || 0) > 3)
      .sort((a, b) => (b.profitFactor_5 || 0) - (a.profitFactor_5 || 0))
      .slice(0, 5);

    // Find patterns with high WR and high occurrences (reliable)
    const reliable = allPatterns
      .filter(p => p.occurrences >= 15 && (p.winRate_5 || 0) > 55)
      .sort((a, b) => b.occurrences - a.occurrences)
      .slice(0, 5);

    const gemsText = gems.map(p => `${p.pattern} [${p.timeframe}]: PF=${p.profitFactor_5?.toFixed(2)} WR=${p.winRate_5?.toFixed(1)}% N=${p.occurrences}`).join('\n');
    const reliableText = reliable.map(p => `${p.pattern} [${p.timeframe}]: WR=${p.winRate_5?.toFixed(1)}% PF=${p.profitFactor_5?.toFixed(2)} N=${p.occurrences}`).join('\n');

    const prompt = `[RELATORIO PROFUNDO - ${new Date().toLocaleString('pt-BR')}]

GEMS (PF alto, poucas ocorrencias — possiveis oportunidades):
${gemsText || 'Nenhum encontrado'}

CONFIAVEIS (WR alto, muitas ocorrencias — setups robustos):
${reliableText || 'Nenhum encontrado'}

Voce e um trader senior. Com base nesses dados, escreva um mini-relatorio em portugues:
1. Quais setups sao realmente confiaveis e quais sao ilusoes estatisticas?
2. Como melhorar a taxa de acerto dos setups fracos?
3. Recomendacao final: 3 regras de ouro para operar WINFUT com base nos dados.`;

    const response = await this.callAI(prompt, 450);
    if (response) {
      this.broadcast({
        type: 'ai_deep_report',
        content: response,
        timestamp: new Date().toISOString(),
      });
      console.log('[AIWorker] Deep report generated');
    }
  }

  // ============================================================
  // HELPERS
  // ============================================================
  isMarketOpen() {
    const now = new Date();
    const brtHour = (now.getUTCHours() - 3 + 24) % 24;
    const day = now.getUTCDay();
    return day >= 1 && day <= 5 && brtHour >= 9 && brtHour < 18;
  }

  async callAI(prompt, maxTokens = 300) {
    return new Promise((resolve) => {
      const body = JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: 'Voce e um trader quantitativo profissional brasileiro. Analise dados do WINFUT (Mini Indice B3). Seja conciso, objetivo, em portugues. Maximo 5 frases por resposta.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: maxTokens,
        temperature: 0.4,
      });

      const req = https.request({
        hostname: 'openrouter.ai',
        path: '/api/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://winfut-pro.railway.app',
          'X-Title': 'WINFUT PRO',
        },
        timeout: 30000,
      }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.error) {
              console.error('[AIWorker] API error:', json.error.message);
              resolve(null);
            } else {
              resolve(json.choices?.[0]?.message?.content || null);
            }
          } catch (e) {
            console.error('[AIWorker] Parse error:', e.message);
            resolve(null);
          }
        });
      });

      req.on('error', (e) => {
        console.error('[AIWorker] Request error:', e.message);
        resolve(null);
      });
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.write(body);
      req.end();
    });
  }
}

module.exports = { AIWorker };
