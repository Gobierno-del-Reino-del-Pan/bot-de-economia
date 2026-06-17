class GameManager {
  constructor() {
    this.rouletteSessions = new Map();
    this.blackjackGames = new Map();
    this.activeGames = new Map();
  }

  // =============================================
// Sistema de Gestión de Juegos
// =============================================

  // Gestión de sesiones de ruleta por canal
  createRouletteSession(channelId, creatorId) {
    const sessionId = `${channelId}_${Date.now()}`;
    const session = {
      id: sessionId,
      channelId,
      creatorId,
      status: 'waiting',
      bets: new Map(),
      timeout: null,
      updateInterval: null,
      createdAt: Date.now()
    };

    this.rouletteSessions.set(sessionId, session);
    return session;
  }

  getActiveRouletteSession(channelId) {
    for (const [sessionId, session] of this.rouletteSessions.entries()) {
      if (session.channelId === channelId && session.status === 'waiting') {
        return session;
      }
    }
    return null;
  }

  endRouletteSession(sessionId) {
    const session = this.rouletteSessions.get(sessionId);
    if (session) {
      if (session.timeout) {
        clearTimeout(session.timeout);
      }
      if (session.updateInterval) {
        clearInterval(session.updateInterval);
      }
    }
    this.rouletteSessions.delete(sessionId);
  }

  // Gestión de juegos de blackjack
  createBlackjackGame(userId, gameData) {
    this.blackjackGames.set(userId, {
      ...gameData,
      createdAt: Date.now()
    });
  }

  getBlackjackGame(userId) {
    return this.blackjackGames.get(userId);
  }

  endBlackjackGame(userId) {
    this.blackjackGames.delete(userId);
  }

  // Limpieza de sesiones expiradas
  cleanupExpiredSessions() {
    const now = Date.now();
    const maxAge = 300000; // 5 minutos

    // Limpiar ruletas expiradas
    for (const [sessionId, session] of this.rouletteSessions.entries()) {
      if (now - session.createdAt > maxAge) {
        this.endRouletteSession(sessionId);
      }
    }

    // Limpiar blackjack expirado
    for (const [userId, game] of this.blackjackGames.entries()) {
      if (now - game.createdAt > maxAge) {
        this.endBlackjackGame(userId);
      }
    }
  }

  // Verificar si un usuario está en un juego activo
  isUserInGame(userId) {
    // Verificar blackjack
    if (this.blackjackGames.has(userId)) {
      return true;
    }
    
    return false;
  }
}

module.exports = GameManager;