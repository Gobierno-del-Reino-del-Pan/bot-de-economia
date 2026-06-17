class WorkAnalyzer {
  constructor(thresholds) {
    this.thresholds = thresholds;
  }

  async processWorkActivity(userRecord, patterns, data) {
    const now = Date.now();
    const lastWork = data.lastWork || 0;

    userRecord.total_works = (userRecord.total_works || 0) + 1;
    
    if (lastWork > 0) {
      const interval = now - lastWork;
      patterns.workTimings.push({
        interval: interval,
        timestamp: now,
        expectedCooldown: 3600000 // 1 hora
      });

      // Mantener solo los últimos 100 intervalos
      if (patterns.workTimings.length > 100) {
        patterns.workTimings = patterns.workTimings.slice(-100);
      }

      // Análisis de timing más sofisticado
      const expectedCooldown = 3600000; // 1 hora
      
      // Timing perfecto (±30 segundos)
      if (Math.abs(interval - expectedCooldown) < 30000) {
        userRecord.perfect_timing_count = (userRecord.perfect_timing_count || 0) + 1;
      }
      
      // Timing casi perfecto (±2 minutos) - para detectar bots con delay intencional
      if (Math.abs(interval - expectedCooldown) < 120000) {
        userRecord.near_perfect_timing_count = (userRecord.near_perfect_timing_count || 0) + 1;
      }

      // Detectar patrones consistentes (ej: siempre 32 minutos)
      if (patterns.workTimings.length >= 5) {
        const lastFive = patterns.workTimings.slice(-5).map(t => t.interval);
        const avgInterval = lastFive.reduce((sum, i) => sum + i, 0) / lastFive.length;
        const variance = lastFive.reduce((sum, i) => sum + Math.pow(i - avgInterval, 2), 0) / lastFive.length;
        const standardDeviation = Math.sqrt(variance);
        
        // Si la desviación estándar es muy baja (menos de 2 minutos), es sospechoso
        if (standardDeviation < 120000 && lastFive.length >= 5) {
          userRecord.consistent_timing_streaks = (userRecord.consistent_timing_streaks || 0) + 1;
          
          // Registrar patrón sospechoso
          patterns.suspiciousPatterns.push({
            type: 'consistent_work_timing',
            avgInterval: Math.round(avgInterval / 60000), // en minutos
            variance: Math.round(standardDeviation / 1000), // en segundos
            timestamp: now
          });
        }
      }

      // Calcular varianza de trabajo
      if (patterns.workTimings.length >= 10) {
        const intervals = patterns.workTimings.map(t => t.interval);
        userRecord.work_variance_score = this.calculateVarianceScore(intervals);
      }

      // Actualizar work_intervals en BD
      userRecord.work_intervals = patterns.workTimings.slice(-50).map(t => t.interval);
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

module.exports = WorkAnalyzer;