class SuspicionCalculator {
  constructor(thresholds) {
    this.thresholds = thresholds;
  }

  async calculateSuspicionScore(userRecord, patterns) {
    let score = 0;
    const flags = [];
    const humanMarkers = patterns.humanMarkers || [];

    // Helper para números seguros
    const safe = (value, defaultValue = 0) => {
      const num = Number(value);
      return isNaN(num) ? defaultValue : num;
    };

    // 1. Análisis de edad de cuenta (10 puntos máximo)
    if (userRecord.discord_account_created) {
      const accountAge = (Date.now() - new Date(userRecord.discord_account_created).getTime()) / (1000 * 60 * 60 * 24);
      if (accountAge < this.thresholds.minAccountAge) {
        const ageScore = Math.max(0, 10 - (accountAge / this.thresholds.minAccountAge * 10));
        score += ageScore;
        flags.push(`Cuenta nueva (${Math.floor(accountAge)} días)`);
      }
    }

    // 2. Análisis avanzado de patrones de trabajo (40 puntos máximo)
    const totalWorks = safe(userRecord.total_works, 0);
    if (totalWorks > 5) {
      const perfectTiming = safe(userRecord.perfect_timing_count, 0);
      const nearPerfectTiming = safe(userRecord.near_perfect_timing_count, 0);
      const workVariance = safe(userRecord.work_variance_score, 50);
      const consistentStreaks = safe(userRecord.consistent_timing_streaks, 0);

      // Ratio de timing perfecto
      const perfectRatio = perfectTiming / totalWorks;
      if (perfectRatio > this.thresholds.maxPerfectTimingRatio) {
        score += 20;
        flags.push(`Timing demasiado perfecto (${Math.round(perfectRatio * 100)}%)`);
      }

      // Ratio de timing casi perfecto (detecta bots con delay)
      const nearPerfectRatio = nearPerfectTiming / totalWorks;
      if (nearPerfectRatio > this.thresholds.maxNearPerfectRatio) {
        score += 15;
        flags.push(`Timing consistentemente similar (${Math.round(nearPerfectRatio * 100)}%)`);
      }

      // Varianza muy baja
      if (workVariance < this.thresholds.minWorkVariance) {
        score += 15;
        flags.push(`Varianza robótica en trabajo (${workVariance.toFixed(1)}/100)`);
      }

      // Secuencias consistentes
      if (consistentStreaks > this.thresholds.maxConsistentStreaks) {
        score += 10;
        flags.push(`${consistentStreaks} secuencias de timing idéntico`);
      }
    }

    // 3. Análisis de patrones de depósito (30 puntos máximo)
    const totalDeposits = safe(userRecord.total_deposits, 0);
    if (totalDeposits > 5) {
      const roboticDepositScore = safe(userRecord.robotic_deposit_score, 0);
      const depositAllCount = safe(userRecord.deposit_all_pattern_count, 0);
      const immediateDeposits = safe(userRecord.immediate_deposits_after_work, 0);

      // Patrón robótico de depósitos
      if (roboticDepositScore > this.thresholds.maxRoboticDepositScore) {
        score += 25;
        flags.push(`Patrón robótico de depósitos (${roboticDepositScore.toFixed(1)}/100)`);
      }

      // Siempre hace "dep all"
      const depositAllRatio = depositAllCount / totalDeposits;
      if (depositAllRatio > this.thresholds.maxDepositAllRatio && totalDeposits > 10) {
        score += 15;
        flags.push(`Siempre usa "dep all" (${Math.round(depositAllRatio * 100)}%)`);
      }

      // Depósitos inmediatos sospechosos
      const immediateRatio = immediateDeposits / totalDeposits;
      if (immediateRatio > 0.95 && totalDeposits > 15) {
        score += 10;
        flags.push(`Depósitos inmediatos sospechosos (${Math.round(immediateRatio * 100)}%)`);
      }
    }

    // 4. Análisis de transferencias (15 puntos máximo)
    const totalTransfers = safe(userRecord.total_transfers, 0);
    if (totalTransfers > 3) {
      const recipientRatio = safe(userRecord.same_recipient_ratio, 0);
      
      if (recipientRatio > 85 && totalTransfers > 10) {
        score += 15;
        flags.push(`Siempre transfiere al mismo usuario (${recipientRatio.toFixed(1)}%)`);
      }
    }

    // 5. Análisis de actividad social (15 puntos máximo)
    if (totalWorks > 10) {
      const commandRatio = safe(userRecord.command_only_ratio, 0);
      const socialScore = safe(userRecord.social_interaction_score, 0);
      
      if (commandRatio > this.thresholds.maxCommandOnlyRatio) {
        score += 10;
        flags.push(`Solo usa comandos (${commandRatio.toFixed(1)}%)`);
      }
      
      if (socialScore < this.thresholds.minSocialScore && totalWorks > 20) {
        score += 5;
        flags.push(`Muy poca interacción social (${socialScore.toFixed(1)}/100)`);
      }
    }

    // 6. Bonificaciones por comportamiento humano (REDUCIR puntuación)
    let humanBonus = 0;

    // Actividad de voz significativa
    const voiceScore = safe(userRecord.voice_verification_score, 0);
    if (voiceScore > 50) {
      humanBonus += 20;
    } else if (voiceScore > 20) {
      humanBonus += 10;
    }

    // Interacción social alta
    const socialScore = safe(userRecord.social_interaction_score, 0);
    if (socialScore > 40) {
      humanBonus += 15;
    } else if (socialScore > 20) {
      humanBonus += 8;
    }

    // Varianza humana en trabajo
    const workVariance = safe(userRecord.work_variance_score, 50);
    if (workVariance > 60) {
      humanBonus += 10;
    }

    // Múltiples canales de actividad
    const channelCount = safe(userRecord.unique_channels_count, 0);
    if (channelCount > 5) {
      humanBonus += 8;
    } else if (channelCount > 2) {
      humanBonus += 4;
    }

    // Aplicar bonificación humana
    score = Math.max(0, score - humanBonus);

    // 7. Análisis de patrones extremos (bonus crítico)
    const suspiciousPatternCount = patterns.suspiciousPatterns.length;
    if (suspiciousPatternCount > 3) {
      score += 20;
      flags.push(`${suspiciousPatternCount} patrones sospechosos detectados`);
    }

    // Determinar nivel de riesgo
    let riskLevel = 'low';
    let confidenceLevel = 50;

    if (userRecord.is_verified_human) {
      riskLevel = 'safe';
      score = Math.min(score, 30); // Limitar puntuación para usuarios verificados
      confidenceLevel = 95;
    } else if (score >= 90) {
      riskLevel = 'critical';
      confidenceLevel = 90;
    } else if (score >= 75) {
      riskLevel = 'high';
      confidenceLevel = 80;
    } else if (score >= 50) {
      riskLevel = 'medium';
      confidenceLevel = 70;
    } else {
      confidenceLevel = 60;
    }

    return {
      score,
      flags,
      riskLevel,
      confidenceLevel,
      humanMarkers: humanMarkers.slice(-20),
      suspiciousPatterns: patterns.suspiciousPatterns.slice(-10)
    };
  }
}

module.exports = SuspicionCalculator;