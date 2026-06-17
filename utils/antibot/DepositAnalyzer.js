class DepositAnalyzer {
  constructor(thresholds) {
    this.thresholds = thresholds;
  }

  async processDepositActivity(userRecord, patterns, data) {
    const now = Date.now();
    
    userRecord.total_deposits = (userRecord.total_deposits || 0) + 1;
    
    // Buscar trabajo reciente (últimos 10 minutos)
    const recentWork = patterns.recentActions
      .filter(action => action.type === 'work' && now - action.timestamp < 600000)
      .sort((a, b) => b.timestamp - a.timestamp)[0];

    if (recentWork) {
      const depositDelay = now - recentWork.timestamp;
      patterns.depositTimings.push({
        delay: depositDelay,
        isDepositAll: data.isAllCash || false,
        timestamp: now
      });

      // Mantener solo los últimos 50 depósitos
      if (patterns.depositTimings.length > 50) {
        patterns.depositTimings = patterns.depositTimings.slice(-50);
      }

      // Contar depósitos inmediatos (menos de 1 minuto)
      if (depositDelay < 60000) {
        userRecord.immediate_deposits_after_work = (userRecord.immediate_deposits_after_work || 0) + 1;
      }

      // Detectar patrón de "dep all" automático
      if (data.isAllCash) {
        userRecord.deposit_all_pattern_count = (userRecord.deposit_all_pattern_count || 0) + 1;
      }

      // Análisis de patrones de depósito
      if (patterns.depositTimings.length >= 10) {
        const delays = patterns.depositTimings.map(d => d.delay);
        const depositAllCount = patterns.depositTimings.filter(d => d.isDepositAll).length;
        const depositAllRatio = depositAllCount / patterns.depositTimings.length;
        
        // Calcular varianza en timing de depósitos
        userRecord.deposit_timing_variance = this.calculateVarianceScore(delays);
        
        // Puntuación robótica de depósitos
        let roboticScore = 0;
        
        // Si siempre hace "dep all" después de trabajar
        if (depositAllRatio > this.thresholds.maxDepositAllRatio) {
          roboticScore += 40;
        }
        
        // Si siempre deposita en el mismo tiempo
        if (userRecord.deposit_timing_variance < 10) {
          roboticScore += 35;
        }
        
        // Si más del 90% son depósitos inmediatos
        const immediateRatio = userRecord.immediate_deposits_after_work / userRecord.total_deposits;
        if (immediateRatio > 0.95) {
          roboticScore += 25;
        }
        
        userRecord.robotic_deposit_score = Math.min(100, roboticScore);
        
        // Registrar patrón sospechoso si es muy robótico
        if (roboticScore > 80) {
          patterns.suspiciousPatterns.push({
            type: 'robotic_deposit_pattern',
            depositAllRatio: Math.round(depositAllRatio * 100),
            timingVariance: Math.round(userRecord.deposit_timing_variance),
            immediateRatio: Math.round(immediateRatio * 100),
            timestamp: now
          });
        }
      }
    }

    return userRecord;
  }

  calculateVarianceScore(values) {
    if (!values || values.length < 3) return 50.0;

    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const standardDeviation = Math.sqrt(variance);
    
    // Normalizar a escala 0-100 (más varianza = más humano)
    const normalizedVariance = Math.min(100, (standardDeviation / mean) * 100);
    
    return Math.max(0, Math.min(100, normalizedVariance || 50.0));
  }
}

module.exports = DepositAnalyzer;