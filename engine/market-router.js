// ============================================================================
// ENGINE: MARKET ROUTER — Switch automático entre WINFUT e MES
// Detecta qual mercado está aberto e alterna automaticamente
// ============================================================================

const fs = require('fs');
const path = require('path');
const https = require('https');

class MarketRouter {
  constructor(dataDir, broadcastFn) {
    this.dataDir = dataDir;
    this.broadcast = broadcastFn || (() => {});
    
    // Market definitions
    this.markets = {
      WIN: {
        id: 'WIN',
        name: 'WINFUT',
        exchange: 'B3',
        yhSymbol: process.env.YH_SYMBOL || '^BVSP',
        tvSymbol: 'BMFBOVESPA:WIN1!',
        pointValue: 0.20,      // R$ por ponto
        openHour: 9,           // BRT
        closeHour: 18,
        openDays: [1,2,3,4,5], // Seg-Sex
        timezone: 'America/Sao_Paulo',
        flag: '🇧🇷',
        color: '#3fb950',
      },
      MES: {
        id: 'MES',
        name: 'S&P 500 (SPY)',
        exchange: 'NYSE',
        yhSymbol: 'SPY',
        tvSymbol: 'AMEX:SPY',
        pointValue: 0.10,
        openHour: 0,
        closeHour: 23.5,
        openDays: [1,2,3,4,5],
        timezone: 'America/New_York',
        flag: '🇺🇸',
        color: '#58a6ff',
      },
    };

    this.currentMarket = null;
    this.switchLog = [];
    this.loadState();
  }

  // ============================================================
  // MAIN: Determine which market should be active RIGHT NOW
  // ============================================================
  getActiveMarket() {
    const now = new Date();
    
    // Check WIN first (primary market)
    if (this.isMarketOpen('WIN', now)) {
      return this.markets.WIN;
    }
    
    // WIN closed → check MES
    if (this.isMarketOpen('MES', now)) {
      return this.markets.MES;
    }
    
    // Both closed → return last known market (for display purposes)
    return this.currentMarket || this.markets.WIN;
  }

  isMarketOpen(marketId, now = new Date()) {
    const m = this.markets[marketId];
    if (!m) return false;
    
    const day = now.getUTCDay();
    
    // WIN: Seg-Sex, 9-18 BRT (UTC-3)
    if (marketId === 'WIN') {
      const brtHour = (now.getUTCHours() - 3 + 24) % 24;
      const brtMin = now.getUTCMinutes();
      const timeDecimal = brtHour + brtMin / 60;
      
      if (!m.openDays.includes(day)) return false;
      return timeDecimal >= m.openHour && timeDecimal < m.closeHour;
    }
    
    // MES: CME hours (nearly 24h, 1h maintenance at 17:00-18:00 ET)
    if (marketId === 'MES') {
      const etHour = (now.getUTCHours() - 4 + 24) % 24; // EDT (UTC-4)
      const etMin = now.getUTCMinutes();
      const timeDecimal = etHour + etMin / 60;
      
      // MES opens Sunday 18:00 ET with futures week
      const isWeekend = day === 0; // Sunday
      const isFriday = day === 5;
      
      if (isFriday && timeDecimal >= 17) return false; // Friday close 17:00 ET
      if (day === 6) return false; // Saturday closed
      if (isWeekend && timeDecimal < 18) return false; // Sunday before 18:00 ET
      
      // Daily maintenance: 17:00-18:00 ET (1 hour)
      if (timeDecimal >= 17 && timeDecimal < 18) return false;
      
      return true;
    }
    
    return false;
  }

  // ============================================================
  // MARKET SWITCH
  // ============================================================
  switchTo(marketId) {
    const market = this.markets[marketId];
    if (!market) return null;
    
    const previous = this.currentMarket;
    
    if (previous?.id === marketId) return null; // Same market, no switch
    
    this.currentMarket = market;
    this.saveState();
    
    const logEntry = {
      date: new Date().toISOString(),
      from: previous?.id || 'none',
      to: marketId,
      reason: this.getSwitchReason(previous, market),
    };
    this.switchLog.push(logEntry);
    if (this.switchLog.length > 200) this.switchLog.shift();
    
    console.log(`[MarketRouter] Switch: ${previous?.id || 'none'} → ${marketId} (${market.name})`);
    
    this.broadcast({
      type: 'market_switch',
      from: previous?.id,
      to: marketId,
      market: {
        id: market.id,
        name: market.name,
        yhSymbol: market.yhSymbol,
        tvSymbol: market.tvSymbol,
        pointValue: market.pointValue,
        flag: market.flag,
      },
      timestamp: new Date().toISOString(),
    });
    
    return market;
  }

  getSwitchReason(from, to) {
    if (!from) return 'initial';
    if (from.id === 'WIN' && to.id === 'MES') return 'winfut_closed';
    if (from.id === 'MES' && to.id === 'WIN') return 'winfut_opened';
    if (from.id === 'MES' && to.id === 'MES') return 'mes_maintenance_end';
    return 'unknown';
  }

  // ============================================================
  // AUTO-TICK — Called every 60s by cron
  // ============================================================
  tick() {
    const active = this.getActiveMarket();
    
    if (!this.currentMarket || active.id !== this.currentMarket.id) {
      return this.switchTo(active.id);
    }
    
    return null;
  }

  // ============================================================
  // DATA FETCH for specific market
  // ============================================================
  fetchMarketData(marketId, tf, interval, range) {
    const market = this.markets[marketId];
    if (!market) return Promise.resolve(null);
    
    return new Promise((resolve, reject) => {
      const filePath = path.join(this.dataDir, `ohlcv_${marketId}_${tf}.json`);
      const url = `/v8/finance/chart/${encodeURIComponent(market.yhSymbol)}?range=${range}&interval=${interval}`;
      
      console.log(`[Fetch:${marketId}] ${tf}: ${interval} ${range}`);
      
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
              console.log(`[Fetch:${marketId}] ${tf}: no data`);
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
            
            // Save
            if (!fs.existsSync(this.dataDir)) fs.mkdirSync(this.dataDir, { recursive: true });
            fs.writeFileSync(filePath, JSON.stringify(data, null, 0));
            
            console.log(`[Fetch:${marketId}] ${tf}: ${data.length} candles`);
            resolve(data);
          } catch (e) {
            console.error(`[Fetch:${marketId}] ${tf} parse error:`, e.message);
            resolve(null);
          }
        });
      }).on('error', (e) => {
        console.error(`[Fetch:${marketId}] ${tf} error:`, e.message);
        resolve(null);
      });
    });
  }

  // ============================================================
  // STATUS
  // ============================================================
  getStatus() {
    const active = this.getActiveMarket();
    const winOpen = this.isMarketOpen('WIN');
    const mesOpen = this.isMarketOpen('MES');
    
    return {
      current: this.currentMarket?.id || active.id,
      currentName: this.currentMarket?.name || active.name,
      currentSymbol: this.currentMarket?.yhSymbol || active.yhSymbol,
      currentTV: this.currentMarket?.tvSymbol || active.tvSymbol,
      currentPointValue: this.currentMarket?.pointValue || active.pointValue,
      currentFlag: this.currentMarket?.flag || active.flag,
      winOpen,
      mesOpen,
      switchCount: this.switchLog.length,
      lastSwitch: this.switchLog[this.switchLog.length - 1] || null,
    };
  }

  // ============================================================
  // PERSISTENCE
  // ============================================================
  saveState() {
    try {
      const p = path.join(this.dataDir, 'market_state.json');
      fs.writeFileSync(p, JSON.stringify({
        currentMarket: this.currentMarket?.id,
        lastUpdate: new Date().toISOString(),
      }));
    } catch (e) {}
  }

  loadState() {
    try {
      const p = path.join(this.dataDir, 'market_state.json');
      if (fs.existsSync(p)) {
        const state = JSON.parse(fs.readFileSync(p, 'utf-8'));
        if (state.currentMarket) {
          this.currentMarket = this.markets[state.currentMarket] || null;
        }
      }
    } catch (e) {}
    if (!this.currentMarket) {
      this.currentMarket = this.getActiveMarket();
    }
  }
}

module.exports = { MarketRouter };
