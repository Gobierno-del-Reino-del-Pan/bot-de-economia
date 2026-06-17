class TransferAnalyzer {
  constructor() {}

  async processTransferActivity(userRecord, patterns, data) {
    const recipientId = data.recipientId;
    const amount = data.amount;

    if (!recipientId) return userRecord;

    userRecord.total_transfers = (userRecord.total_transfers || 0) + 1;
    
    // Rastrear destinatarios
    if (!patterns.transferTargets.has(recipientId)) {
      patterns.transferTargets.set(recipientId, {
        username: data.recipientUsername || 'Unknown',
        count: 0,
        totalAmount: 0,
        amounts: [],
        timings: []
      });
    }

    const target = patterns.transferTargets.get(recipientId);
    target.count++;
    target.totalAmount += amount;
    target.amounts.push(amount);
    target.timings.push(Date.now());

    // Mantener solo los últimos 100 registros por destinatario
    if (target.amounts.length > 100) {
      target.amounts = target.amounts.slice(-100);
      target.timings = target.timings.slice(-100);
    }

    // Calcular ratio del destinatario principal
    const totalTransfers = Array.from(patterns.transferTargets.values())
      .reduce((sum, target) => sum + target.count, 0);
    
    if (totalTransfers > 0) {
      const maxTransfers = Math.max(...Array.from(patterns.transferTargets.values())
        .map(target => target.count));
      
      userRecord.same_recipient_ratio = (maxTransfers / totalTransfers) * 100;
    }

    // Detectar patrones de transferencia sospechosos
    if (target.amounts.length >= 5) {
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

    // CRÍTICO: Actualizar transfer_recipients en BD con formato PERSISTENTE y COMPLETO
    const transferRecipients = Array.from(patterns.transferTargets.entries()).map(([id, data]) => ({
      userId: id,
      username: data.username,
      transferCount: data.count,
      totalAmountGiven: data.totalAmount,
      avgAmount: Math.round(data.totalAmount / data.count),
      uniqueAmounts: [...new Set(data.amounts)].length,
      amountVariance: this.calculateVarianceScore(data.amounts),
      lastTransfer: Math.max(...data.timings),
      firstTransfer: Math.min(...data.timings),
      // MANTENER historial completo para investigaciones
      fullHistory: {
        amounts: data.amounts.slice(-100), // Últimas 100 transferencias
        timings: data.timings.slice(-100),
        recentAmounts: data.amounts.slice(-10), // Últimas 10 para análisis rápido
        totalSessions: Math.ceil(data.amounts.length / 5) // Estimación de sesiones
      },
      // Estadísticas adicionales
      stats: {
        maxAmount: Math.max(...data.amounts),
        minAmount: Math.min(...data.amounts),
        medianAmount: this.calculateMedian(data.amounts),
        consistencyScore: this.calculateConsistencyScore(data.amounts),
        frequencyPattern: this.analyzeFrequencyPattern(data.timings)
      }
    }));

    userRecord.transfer_recipients = transferRecipients;
    
    console.log(`💸 TRANSFER ACTUALIZADO: Usuario ${userRecord.user_id} -> ${transferRecipients.length} destinatarios registrados`);
    
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

  calculateMedian(values) {
    if (!values || values.length === 0) return 0;
    
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    
    return sorted.length % 2 === 0 
      ? (sorted[mid - 1] + sorted[mid]) / 2 
      : sorted[mid];
  }

  calculateConsistencyScore(amounts) {
    if (!amounts || amounts.length < 3) return 50;
    
    const uniqueAmounts = new Set(amounts);
    const consistencyRatio = (amounts.length - uniqueAmounts.size) / amounts.length;
    
    // Más consistencia = más sospechoso
    return Math.round(consistencyRatio * 100);
  }

  analyzeFrequencyPattern(timings) {
    if (!timings || timings.length < 3) return 'insufficient_data';
    
    const intervals = [];
    for (let i = 1; i < timings.length; i++) {
      intervals.push(timings[i] - timings[i - 1]);
    }
    
    const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    const variance = intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length;
    const standardDeviation = Math.sqrt(variance);
    
    // Clasificar patrón
    if (standardDeviation < avgInterval * 0.1) return 'very_regular';
    if (standardDeviation < avgInterval * 0.3) return 'regular';
    if (standardDeviation < avgInterval * 0.7) return 'irregular';
    return 'very_irregular';
  }
}

module.exports = TransferAnalyzer;