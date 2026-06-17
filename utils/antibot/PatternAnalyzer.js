class PatternAnalyzer {
  constructor(thresholds) {
    this.thresholds = thresholds;
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

  analyzeWorkPatterns(userRecord, patterns) {
    const workTimings = patterns.workTimings || [];
    
    if (workTimings.length >= 5) {
      const lastFive = workTimings.slice(-5).map(t => t.interval);
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
          timestamp: Date.now()
        });
      }
    }

    // Calcular varianza de trabajo
    if (workTimings.length >= 10) {
      const intervals = workTimings.map(t => t.interval);
      userRecord.work_variance_score = this.calculateVarianceScore(intervals);
    }

    return userRecord;
  }

  analyzeDepositPatterns(userRecord, patterns) {
    const depositTimings = patterns.depositTimings || [];
    
    if (depositTimings.length >= 10) {
      const delays = depositTimings.map(d => d.delay);
      const depositAllCount = depositTimings.filter(d => d.isDepositAll).length;
      const depositAllRatio = depositAllCount / depositTimings.length;
      
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
          timestamp: Date.now()
        });
      }
    }

    return userRecord;
  }

  analyzeTransferPatterns(userRecord, patterns) {
    const transferTargets = patterns.transferTargets || new Map();
    
    // Calcular ratio del destinatario principal
    const totalTransfers = Array.from(transferTargets.values())
      .reduce((sum, target) => sum + target.count, 0);
    
    if (totalTransfers > 0) {
      const maxTransfers = Math.max(...Array.from(transferTargets.values())
        .map(target => target.count));
      
      userRecord.same_recipient_ratio = (maxTransfers / totalTransfers) * 100;
    }

    // Detectar patrones de transferencia sospechosos
    for (const [recipientId, target] of transferTargets.entries()) {
      if (target.amounts && target.amounts.length >= 5) {
        const uniqueAmounts = new Set(target.amounts);
        
        // Si siempre transfiere cantidades muy similares
        if (uniqueAmounts.size <= 2 && target.amounts.length > 10) {
          patterns.suspiciousPatterns.push({
            type: 'identical_transfer_amounts',
            recipientId: recipientId,
            uniqueAmounts: uniqueAmounts.size,
            totalTransfers: target.amounts.length,
            timestamp: Date.now()
          });
        }
      }
    }

    return userRecord;
  }

  identifyRiskFactors(userRecord, patterns) {
    const factors = [];
    
    const safe = (value, defaultValue = 0) => {
      const num = Number(value);
      return isNaN(num) ? defaultValue : num;
    };

    const totalWorks = safe(userRecord.total_works, 1);
    const perfectRatio = safe(userRecord.perfect_timing_count, 0) / totalWorks;
    const workVariance = safe(userRecord.work_variance_score, 50);
    const roboticDepositScore = safe(userRecord.robotic_deposit_score, 0);
    const commandRatio = safe(userRecord.command_only_ratio, 0);
    const voiceScore = safe(userRecord.voice_verification_score, 0);
    
    if (perfectRatio > 0.8) factors.push('Timing de trabajo demasiado perfecto');
    if (workVariance < 25) factors.push('Varianza robótica en intervalos de trabajo');
    if (roboticDepositScore > 70) factors.push('Patrón robótico en depósitos');
    if (commandRatio > 95) factors.push('Solo usa comandos, sin interacción social');
    if (voiceScore === 0 && totalWorks > 30) factors.push('Sin actividad de voz después de mucha actividad');
    if ((userRecord.suspicious_patterns || []).length > 3) factors.push('Múltiples patrones sospechosos detectados');

    return factors;
  }

  calculateHumanLikelihood(userRecord, patterns) {
    let humanScore = 50; // Base neutral

    const safe = (value, defaultValue = 0) => {
      const num = Number(value);
      return isNaN(num) ? defaultValue : num;
    };

    // Factores que aumentan probabilidad humana
    const voiceScore = safe(userRecord.voice_verification_score, 0);
    const socialScore = safe(userRecord.social_interaction_score, 0);
    const workVariance = safe(userRecord.work_variance_score, 50);
    const channelCount = safe(userRecord.unique_channels_count, 0);

    if (voiceScore > 50) humanScore += 25;
    else if (voiceScore > 20) humanScore += 15;
    
    if (socialScore > 40) humanScore += 20;
    else if (socialScore > 20) humanScore += 10;
    
    if (workVariance > 60) humanScore += 15;
    else if (workVariance > 40) humanScore += 8;
    
    if (channelCount > 3) humanScore += 10;

    // Factores que disminuyen probabilidad humana
    const roboticDepositScore = safe(userRecord.robotic_deposit_score, 0);
    const suspiciousPatterns = (userRecord.suspicious_patterns || []).length;
    const commandRatio = safe(userRecord.command_only_ratio, 0);

    if (roboticDepositScore > 80) humanScore -= 30;
    if (suspiciousPatterns > 5) humanScore -= 20;
    if (commandRatio > 95) humanScore -= 15;
    if (workVariance < 20) humanScore -= 15;

    return Math.max(0, Math.min(100, humanScore));
  }
}

module.exports = PatternAnalyzer;