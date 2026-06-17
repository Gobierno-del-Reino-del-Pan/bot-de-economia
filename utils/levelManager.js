const fs = require('fs');
const path = require('path');

// =============================================
// Sistema de XP y Niveles
// =============================================

class LevelManager {
  constructor(client) {
    this.client = client;

    // XP por mensaje (rango aleatorio para que no sea robótico)
    this.xpMin = 15;
    this.xpMax = 35;

    // Cooldown entre ganancias de XP (ms) — evita spam
    this.xpCooldown = 60_000; // 60 segundos

    // Cache ligera para cooldowns en memoria
    this.cooldownCache = new Map();

    // Roles cargados del JSON
    this.levelRoles = this._loadLevelRoles();

    console.log(`📊 LevelManager iniciado — ${this.levelRoles.length} roles de nivel cargados`);
  }

  // -------------------------------------------------
  // Carga roles desde data/levelrol.json
  // -------------------------------------------------
  _loadLevelRoles() {
    try {
      const filePath = path.join(__dirname, '../data/levelrol.json');
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      // Ordenar de menor a mayor nivel
      return (data.roles || []).sort((a, b) => a.level - b.level);
    } catch {
      console.warn('⚠️ No se pudo cargar levelrol.json — no se asignarán roles por nivel');
      return [];
    }
  }

  // -------------------------------------------------
  // XP necesaria para ESTAR en ese nivel
  // (xp acumulada desde 0 hasta alcanzar el nivel n)
  // -------------------------------------------------
  xpForLevel(level) {
    if (level <= 0) return 0;
    return Math.floor(100 * Math.pow(level, 1.6));
  }

  // XP total acumulada necesaria para tener el nivel n
  totalXpForLevel(level) {
    let total = 0;
    for (let i = 1; i <= level; i++) {
      total += this.xpForLevel(i);
    }
    return total;
  }

  // Dado el XP total acumulado, calcula el nivel actual
  levelFromTotalXp(totalXp) {
    let level = 0;
    let accumulated = 0;
    while (true) {
      const needed = this.xpForLevel(level + 1);
      if (accumulated + needed > totalXp) break;
      accumulated += needed;
      level++;
    }
    return level;
  }

  // XP dentro del nivel actual (barra de progreso)
  xpInCurrentLevel(totalXp) {
    const level = this.levelFromTotalXp(totalXp);
    let accumulated = 0;
    for (let i = 1; i <= level; i++) {
      accumulated += this.xpForLevel(i);
    }
    return totalXp - accumulated;
  }

  // XP necesaria para subir AL siguiente nivel
  xpNeededForNextLevel(totalXp) {
    const level = this.levelFromTotalXp(totalXp);
    return this.xpForLevel(level + 1);
  }

  // -------------------------------------------------
  // Barra de progreso visual
  // -------------------------------------------------
  progressBar(current, total, size = 12) {
    const filled = Math.round((current / total) * size);
    const empty  = size - filled;
    return '▓'.repeat(filled) + '░'.repeat(empty);
  }

  // -------------------------------------------------
  // Procesa un mensaje: da XP y comprueba subida de nivel
  // -------------------------------------------------
  async handleMessage(message) {
    if (!this.client.db) return;
    if (message.author.bot) return;
    if (message.content.startsWith(this.client.config?.prefix || '!')) return;

    const userId   = message.author.id;
    const username = message.author.username;
    const now      = Date.now();

    // Cooldown en memoria
    const lastGain = this.cooldownCache.get(userId) || 0;
    if (now - lastGain < this.xpCooldown) return;
    this.cooldownCache.set(userId, now);

    // XP aleatoria
    const xpGained = Math.floor(Math.random() * (this.xpMax - this.xpMin + 1)) + this.xpMin;

    try {
      const record = await this.client.db.getUserLevel(userId, username);
      const oldLevel = record.level;

      const newTotalXp = record.total_xp + xpGained;
      const newLevel   = this.levelFromTotalXp(newTotalXp);
      const newXp      = this.xpInCurrentLevel(newTotalXp);

      await this.client.db.updateUserLevel(userId, {
        username,
        xp:           newXp,
        level:        newLevel,
        total_xp:     newTotalXp,
        messages:     record.messages + 1,
        last_xp_gain: now
      });

      // ¿Subió de nivel?
      if (newLevel > oldLevel) {
        await this._onLevelUp(message, newLevel, oldLevel);
      }
    } catch (error) {
      console.error('Error procesando XP:', error);
    }
  }

  // -------------------------------------------------
  // Evento de subida de nivel
  // -------------------------------------------------
  async _onLevelUp(message, newLevel, oldLevel) {
    // Asignar roles primero
    const rolesGained = await this._assignLevelRoles(message.member, newLevel);

    // Construir el mensaje de anuncio
    const emoji = ':escudogob:';
    let anuncio = `${emoji} ${message.author}, ¡has alcanzado el **nivel ${newLevel}** en el Reino!`;

    if (rolesGained.length > 0) {
      const rolesMention = rolesGained.map(r => `<@&${r.roleId}>`).join(', ');
      anuncio += `\n Rol desbloqueado: ${rolesMention}`;
    }

    // Intentar enviar al canal configurado
    const channelId = this.client.config?.levelUpChannel;

    if (channelId) {
      try {
        const channel = await this.client.channels.fetch(channelId);
        if (channel?.isTextBased()) {
          await channel.send(anuncio);
          return;
        }
      } catch {
        console.warn(`⚠️ No se pudo enviar al canal levelUpChannel (${channelId}), usando canal del mensaje.`);
      }
    }

    // Fallback: enviar en el mismo canal donde escribió el usuario
    try {
      await message.channel.send(anuncio);
    } catch {
      // Sin permisos, ignorar
    }
  }

  // -------------------------------------------------
  // Asigna (y quita) roles según el nivel
  // -------------------------------------------------
  async _assignLevelRoles(member, currentLevel) {
    if (!member || this.levelRoles.length === 0) return [];

    const gained = [];

    for (const roleData of this.levelRoles) {
      if (!roleData.roleId || roleData.roleId === 'ROLE_ID_AQUI') continue;

      try {
        const role = member.guild.roles.cache.get(roleData.roleId);
        if (!role) continue;

        if (currentLevel >= roleData.level) {
          // Dar rol si no lo tiene
          if (!member.roles.cache.has(roleData.roleId)) {
            await member.roles.add(role);
            gained.push(roleData);
          }
        }
        // Opcional: quitar roles de niveles anteriores (comenta si no quieres)
        // else if (member.roles.cache.has(roleData.roleId)) {
        //   await member.roles.remove(role);
        // }
      } catch (err) {
        console.error(`Error asignando rol de nivel ${roleData.level}:`, err);
      }
    }

    return gained;
  }

  // -------------------------------------------------
  // Cleanup del cooldown en memoria (llamar periódicamente)
  // -------------------------------------------------
  cleanup() {
    const cutoff = Date.now() - this.xpCooldown * 2;
    for (const [userId, ts] of this.cooldownCache.entries()) {
      if (ts < cutoff) this.cooldownCache.delete(userId);
    }
  }
}

module.exports = LevelManager;