class RateLimiter {
  constructor() {
    this.userLimits = new Map();
    this.globalLimits = new Map();
  }

  // =============================================
// Sistema de Rate Limiting
// =============================================

  // Rate limiting por usuario
  checkUserLimit(userId, command, maxRequests = 5, windowMs = 60000) {
    const key = `${userId}_${command}`;
    const now = Date.now();
    
    if (!this.userLimits.has(key)) {
      this.userLimits.set(key, { count: 1, resetTime: now + windowMs });
      return true;
    }

    const limit = this.userLimits.get(key);
    
    if (now > limit.resetTime) {
      this.userLimits.set(key, { count: 1, resetTime: now + windowMs });
      return true;
    }

    if (limit.count >= maxRequests) {
      return false;
    }

    limit.count++;
    return true;
  }

  // Rate limiting global por comando
  checkGlobalLimit(command, maxRequests = 50, windowMs = 60000) {
    const now = Date.now();
    
    if (!this.globalLimits.has(command)) {
      this.globalLimits.set(command, { count: 1, resetTime: now + windowMs });
      return true;
    }

    const limit = this.globalLimits.get(command);
    
    if (now > limit.resetTime) {
      this.globalLimits.set(command, { count: 1, resetTime: now + windowMs });
      return true;
    }

    if (limit.count >= maxRequests) {
      return false;
    }

    limit.count++;
    return true;
  }

  // Limpiar límites expirados
  cleanup() {
    const now = Date.now();
    
    for (const [key, limit] of this.userLimits.entries()) {
      if (now > limit.resetTime) {
        this.userLimits.delete(key);
      }
    }

    for (const [key, limit] of this.globalLimits.entries()) {
      if (now > limit.resetTime) {
        this.globalLimits.delete(key);
      }
    }
  }
}

module.exports = RateLimiter;