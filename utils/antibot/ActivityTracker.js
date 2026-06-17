class ActivityTracker {
  constructor(client) {
    this.client = client;
    this.userPatterns = new Map();
  }

  async trackUserActivity(userId, username, activityType, data = {}) {
    try {
      // Obtener patrones en memoria
      if (!this.userPatterns.has(userId)) {
        this.userPatterns.set(userId, {
          recentActions: [],
          workTimings: [],
          depositTimings: [],
          transferTargets: new Map(),
          messageChannels: new Set(),
          commandSequences: [],
          humanMarkers: [],
          suspiciousPatterns: []
        });
      }

      const patterns = this.userPatterns.get(userId);
      const now = Date.now();

      // Registrar actividad con timestamp y contexto
      patterns.recentActions.push({
        type: activityType,
        timestamp: now,
        data: data,
        hour: new Date(now).getHours(),
        dayOfWeek: new Date(now).getDay()
      });

      // Mantener solo las últimas 200 acciones
      if (patterns.recentActions.length > 200) {
        patterns.recentActions = patterns.recentActions.slice(-200);
      }

      return patterns;
    } catch (error) {
      console.error('Error en trackUserActivity:', error);
      return null;
    }
  }

  getUserPatterns(userId) {
    return this.userPatterns.get(userId);
  }

  setUserPatterns(userId, patterns) {
    this.userPatterns.set(userId, patterns);
  }

  deleteUserPatterns(userId) {
    this.userPatterns.delete(userId);
  }

  cleanup() {
    const now = Date.now();
    const maxAge = 86400000; // CRÍTICO: Aumentar a 24 horas para preservar datos importantes

    for (const [userId, patterns] of this.userPatterns.entries()) {
      // Limpiar acciones antiguas
      patterns.recentActions = patterns.recentActions.filter(
        action => now - action.timestamp < maxAge
      );

      // Limpiar marcadores antiguos
      patterns.humanMarkers = patterns.humanMarkers.filter(
        marker => now - marker.timestamp < maxAge
      );

      patterns.suspiciousPatterns = patterns.suspiciousPatterns.filter(
        pattern => now - pattern.timestamp < maxAge
      );

      // CRÍTICO: NUNCA remover usuarios con datos de transferencias importantes
      if (patterns.recentActions.length === 0 && 
          patterns.humanMarkers.length === 0 && 
          patterns.suspiciousPatterns.length === 0 &&
          patterns.transferTargets.size === 0 &&
          patterns.workTimings.length === 0 &&
          patterns.depositTimings.length === 0) {
        this.userPatterns.delete(userId);
      } else if (patterns.transferTargets.size > 0) {
        console.log(`🔒 PRESERVANDO datos en memoria para usuario ${userId} - ${patterns.transferTargets.size} destinatarios de transferencias`);
      }
    }

    console.log(`🧹 Limpieza de patrones completada - ${this.userPatterns.size} usuarios en memoria (datos críticos preservados por 24h)`);
  }
}

module.exports = ActivityTracker;