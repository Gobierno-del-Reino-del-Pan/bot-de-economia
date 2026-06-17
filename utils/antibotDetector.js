const { EmbedBuilder, WebhookClient } = require('discord.js');
const config = require('../config.json');
const ActivityTracker = require('./antibot/ActivityTracker');
const WorkAnalyzer = require('./antibot/WorkAnalyzer');
const DepositAnalyzer = require('./antibot/DepositAnalyzer');
const TransferAnalyzer = require('./antibot/TransferAnalyzer');
const SocialAnalyzer = require('./antibot/SocialAnalyzer');
const SuspicionCalculator = require('./antibot/SuspicionCalculator');
const AlertManager = require('./antibot/AlertManager');
const DatabaseManager = require('./antibot/DatabaseManager');
const PatternAnalyzer = require('./antibot/PatternAnalyzer');

// =============================================
// Sistema Anti-Bot uwu arigato onishan
// =============================================

class AntibotDetector {
  constructor(client) {
    this.client = client;
    this.enabled = config.antibot?.enabled || false; // ARREGLO: Hacer esta propiedad accesible
    
    // Umbrales más inteligentes y precisos
    this.thresholds = {
      // Puntuación para alertas (sin auto-ban)
      alertScore: 75.0,
      criticalScore: 90.0,
      // Edad mínima de cuenta
      minAccountAge: 21,
      // Timing patterns
      maxPerfectTimingRatio: 0.85, // 85% de trabajos perfectos
      maxNearPerfectRatio: 0.95, // 95% de trabajos casi perfectos
      minWorkVariance: 15.0, // Mínima varianza humana
      // Depósitos
      maxDepositAllRatio: 0.90, // 90% de dep all después de work
      maxRoboticDepositScore: 85.0,
      // Social
      maxCommandOnlyRatio: 98.0, // 98% solo comandos
      minSocialScore: 5.0,
      // Patrones
      maxConsistentStreaks: 15,
      minBehavioralVariance: 20.0
    };

    // Inicializar módulos
    this.activityTracker = new ActivityTracker(client);
    this.workAnalyzer = new WorkAnalyzer(this.thresholds);
    this.depositAnalyzer = new DepositAnalyzer(this.thresholds);
    this.transferAnalyzer = new TransferAnalyzer();
    this.socialAnalyzer = new SocialAnalyzer();
    this.suspicionCalculator = new SuspicionCalculator(this.thresholds);
    this.alertManager = new AlertManager(config.antibot?.webhook, this.thresholds);
    this.databaseManager = new DatabaseManager(client);
    this.patternAnalyzer = new PatternAnalyzer(this.thresholds);
    
    // Iniciar limpieza automática
    this.startCleanupInterval();
    
    console.log(`🤖 Sistema Anti-Bot Avanzado v3.2 iniciado (${this.enabled ? 'HABILITADO' : 'DESHABILITADO'})`);
  }

  async trackUserActivity(userId, username, activityType, data = {}) {
    if (!this.enabled) return;

    try {
      // Obtener o crear registro del usuario
      let userRecord = await this.databaseManager.getUserRecord(userId, username);
      
      // Obtener patrones en memoria
      const patterns = await this.activityTracker.trackUserActivity(userId, username, activityType, data);
      if (!patterns) return;

      // Procesar según tipo de actividad
      switch (activityType) {
        case 'work':
          userRecord = await this.workAnalyzer.processWorkActivity(userRecord, patterns, data);
          break;
        case 'transfer':
          userRecord = await this.transferAnalyzer.processTransferActivity(userRecord, patterns, data);
          break;
        case 'deposit':
          userRecord = await this.depositAnalyzer.processDepositActivity(userRecord, patterns, data);
          break;
        case 'message':
          userRecord = await this.socialAnalyzer.processMessageActivity(userRecord, patterns, data);
          break;
        case 'voice':
          userRecord = await this.socialAnalyzer.processVoiceActivity(userRecord, patterns, data);
          break;
      }

      // Recalcular puntuación de sospecha
      await this.calculateSuspicionScore(userRecord, patterns);

    } catch (error) {
      console.error('Error en trackUserActivity:', error);
    }
  }

  async calculateSuspicionScore(userRecord, patterns) {
    const result = await this.suspicionCalculator.calculateSuspicionScore(userRecord, patterns);
    
    // Actualizar registro con resultados
    userRecord.suspicion_score = result.score;
    userRecord.confidence_level = result.confidenceLevel;
    userRecord.risk_level = result.riskLevel;
    userRecord.human_activity_markers = result.humanMarkers;
    userRecord.suspicious_patterns = result.suspiciousPatterns;

    // Solo enviar alertas (sin auto-ban)
    if (result.score >= this.thresholds.criticalScore && !userRecord.alert_sent) {
      await this.alertManager.sendCriticalAlert(userRecord, result.flags);
    } else if (result.score >= this.thresholds.alertScore && !userRecord.is_flagged) {
      await this.alertManager.sendAlert(userRecord, result.flags);
    }

    await this.databaseManager.updateUserRecord(userRecord);
  }

  async verifyUserAsHuman(userId, method = 'voice_activity') {
    await this.databaseManager.verifyUserAsHuman(userId, method);
    
    // Limpiar patrones en memoria
    this.activityTracker.deleteUserPatterns(userId);
    
    console.log(`✅ Usuario ${userId} verificado como humano (método: ${method})`);
  }

  async getSuspiciousUsers(limit = 25) {
    return await this.databaseManager.getSuspiciousUsers(limit);
  }

  async getUserById(id) {
    return await this.databaseManager.getUserById(id);
  }

  // Método para análisis manual detallado
  async analyzeUser(userId) {
    try {
      const userRecord = await this.databaseManager.getUserRecord(userId);
      const patterns = this.activityTracker.getUserPatterns(userId) || {};
      
      return {
        record: userRecord,
        patterns: patterns,
        analysis: {
          humanLikelihood: this.patternAnalyzer.calculateHumanLikelihood(userRecord, patterns),
          riskFactors: this.patternAnalyzer.identifyRiskFactors(userRecord, patterns),
          recommendation: this.getRecommendation(userRecord),
          detailedBreakdown: this.getDetailedScoreBreakdown(userRecord, patterns)
        }
      };
    } catch (error) {
      console.error('Error analizando usuario:', error);
      return null;
    }
  }

  getRecommendation(userRecord) {
    return this.alertManager.getRecommendation(userRecord);
  }

  getDetailedScoreBreakdown(userRecord, patterns) {
    const safe = (value, defaultValue = 0) => {
      const num = Number(value);
      return isNaN(num) ? defaultValue : num;
    };

    // Desglose detallado de cómo se calculó la puntuación
    const breakdown = {
      accountAge: 0,
      workPatterns: 0,
      depositPatterns: 0,
      transferPatterns: 0,
      socialActivity: 0,
      humanBonuses: 0,
      totalScore: safe(userRecord.suspicion_score, 0)
    };

    return breakdown;
  }

  startCleanupInterval() {
    // Limpiar patrones en memoria cada 30 minutos
    setInterval(() => {
      this.activityTracker.cleanup();
    }, 1800000); // Cada 30 minutos
  }
}

module.exports = AntibotDetector;