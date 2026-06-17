const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

class Database {
  constructor(config) {
    this.config = config;
    this.pool = null;
    this.queryCache = new Map();
    this.cacheTimeout = 30000; // 30 segundos
    
    // Cargar datos JSON
    this.shopData = this.loadJSON('shop.json');
    this.collectData = this.loadJSON('collect.json');
    this.rouletteData = this.loadJSON('roulette_sessions.json');
    this.loansData = this.loadJSON('prestamos.json');
  }

  loadJSON(filename) {
    try {
      const filePath = path.join(__dirname, '../data', filename);
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error(`Error cargando ${filename}:`, error);
      return {};
    }
  }

  saveJSON(filename, data) {
    try {
      const filePath = path.join(__dirname, '../data', filename);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error(`Error guardando ${filename}:`, error);
    }
  }

  async init() {
    // Crear pool de conexiones para mejor rendimiento
    this.pool = mysql.createPool({
      ...this.config,
      waitForConnections: true,
      connectionLimit: 20,
      queueLimit: 0,
      acquireTimeout: 60000,
      timeout: 60000,
      reconnect: true
    });

    console.log('🔗 Pool de conexiones MySQL creado');
    
    // Verificar conexión
    try {
      const connection = await this.pool.getConnection();
      await connection.ping();
      connection.release();
      console.log('✅ Conexión a MySQL verificada');
    } catch (error) {
      console.error('❌ Error conectando a MySQL:', error);
      throw error;
    }

    // Verificar si existe la tabla antibots
    try {
      await this.pool.execute('SELECT 1 FROM antibots LIMIT 1');
      console.log('✅ Tabla antibots verificada');
    } catch (error) {
      console.warn('⚠️ Tabla antibots no existe. Créala usando el script en tablas.md');
    }
  }

  // Cache para consultas frecuentes
  getCachedQuery(key) {
    const cached = this.queryCache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    return null;
  }

  setCachedQuery(key, data) {
    this.queryCache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  // Invalidar cache específico
  invalidateCache(key) {
    this.queryCache.delete(key);
  }
  async getUser(userId, username = null) {
    const cacheKey = `user_${userId}`;
    const cached = this.getCachedQuery(cacheKey);
    if (cached) return cached;

    try {
      const [rows] = await this.pool.execute(
        'SELECT * FROM users_economy WHERE id = ?',
        [userId]
      );

      if (rows.length === 0) {
        const newUser = {
          id: userId,
          username: username || 'Usuario',
          cash: 1000,
          bank: 0,
          last_work: 0,
          last_rob: 0,
          last_slut: 0,
          last_crime: 0,
          collect_cooldowns: {},
          total_earned: 1000,
          total_spent: 0,
          inventory: [],
          active_boosts: []
        };

        await this.pool.execute(
          'INSERT INTO users_economy (id, username, cash, bank, last_work, last_rob, last_slut, last_crime, total_earned, total_spent, collect_cooldowns, inventory, active_boosts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [userId, username || 'Usuario', 1000, 0, 0, 0, 0, 0, 1000, 0, JSON.stringify({}), JSON.stringify([]), JSON.stringify([])]
        );

        this.setCachedQuery(cacheKey, newUser);
        return newUser;
      }

      const user = rows[0];
      
      // Actualizar username si está en blanco o es null
      if (!user.username || user.username.trim() === '' || user.username === 'null') {
        const updatedUsername = username || 'Usuario';
        await this.pool.execute(
          'UPDATE users_economy SET username = ? WHERE id = ?',
          [updatedUsername, userId]
        );
        user.username = updatedUsername;
      }
      
      // Parsear campos JSON
      user.collect_cooldowns = typeof user.collect_cooldowns === 'string' ? JSON.parse(user.collect_cooldowns) : user.collect_cooldowns || {};
      user.inventory = typeof user.inventory === 'string' ? JSON.parse(user.inventory) : user.inventory || [];
      user.active_boosts = typeof user.active_boosts === 'string' ? JSON.parse(user.active_boosts) : user.active_boosts || [];
      
      this.setCachedQuery(cacheKey, user);
      return user;
    } catch (error) {
      console.error('Error obteniendo usuario:', error);
      throw error;
    }
  }

  async updateUser(userId, data) {
    try {
      const validFields = ['username', 'cash', 'bank', 'last_work', 'last_rob', 'last_slut', 'last_crime', 'collect_cooldowns', 'total_earned', 'total_spent', 'inventory', 'active_boosts'];
      const filteredData = {};
      
      for (const [key, value] of Object.entries(data)) {
        if (validFields.includes(key)) {
          // Convertir objetos/arrays a JSON string para campos JSON
          if (['collect_cooldowns', 'inventory', 'active_boosts'].includes(key)) {
            filteredData[key] = JSON.stringify(value);
          } else {
            filteredData[key] = value;
          }
        }
      }
      
      if (Object.keys(filteredData).length === 0) {
        return;
      }

      const sets = Object.keys(filteredData).map(key => `${key} = ?`).join(', ');
      const values = Object.values(filteredData);
      values.push(userId);

      await this.pool.execute(
        `UPDATE users_economy SET ${sets} WHERE id = ?`,
        values
      );

      // Invalidar cache
      this.invalidateCache(`user_${userId}`);
      // También invalidar cache de rankings
      for (let i = 1; i <= 100; i++) {
        this.invalidateCache(`top_users_${i}`);
      }
    } catch (error) {
      console.error('Error actualizando usuario:', error);
      throw error;
    }
  }

  async addTransaction(userId, type, amount, description) {
    // Las transacciones ahora se pueden manejar como logs simples o eliminar si no son necesarias
    console.log(`📝 Transacción: ${userId} - ${type} - ${amount} - ${description}`);
  }

  // Métodos para manejar la tienda desde JSON
  getShopItems() {
    return this.shopData.items || [];
  }

  getShopItem(itemId) {
    return this.shopData.items?.find(item => item.id === itemId);
  }

  async buyShopItem(userId, itemId) {
    const item = this.getShopItem(itemId);
    if (!item) {
      throw new Error('Item no encontrado');
    }

    // Para caballos, usar el método específico
    if (item.type === 'horse') {
      return this.buyHorse(userId, itemId, item.name);
    }

    const user = await this.getUser(userId);
    
    if (user.cash < item.price) {
      throw new Error('Dinero insuficiente');
    }

    // Verificar si ya tiene el item (para items no stackeables)
    if (!item.stackable) {
      const hasItem = user.inventory.some(invItem => invItem.id === itemId);
      if (hasItem) {
        throw new Error('Ya tienes este item');
      }
    }

    let updatedInventory;
    
    if (item.stackable) {
      // Para items stackeables, buscar si ya existe y aumentar cantidad
      const existingItemIndex = user.inventory.findIndex(invItem => invItem.id === itemId);
      
      if (existingItemIndex !== -1) {
        updatedInventory = [...user.inventory];
        updatedInventory[existingItemIndex].quantity = (updatedInventory[existingItemIndex].quantity || 1) + 1;
      } else {
        const newInventoryItem = {
          inventory_id: this.generateInventoryId(),
          id: itemId,
          name: item.name,
          type: item.type,
          quantity: 1,
          purchased_at: new Date().toISOString(),
          ...item
        };
        updatedInventory = [...user.inventory, newInventoryItem];
      }
    } else {
      // Para items no stackeables, agregar como nuevo item
      const newInventoryItem = {
        inventory_id: this.generateInventoryId(),
        id: itemId,
        name: item.name,
        type: item.type,
        quantity: 1,
        purchased_at: new Date().toISOString(),
        ...item
      };
      updatedInventory = [...user.inventory, newInventoryItem];
    }


    await this.updateUser(userId, {
      cash: user.cash - item.price,
      total_spent: user.total_spent + item.price,
      inventory: updatedInventory
    });

    return item;
  }

  generateInventoryId() {
    const CurrencyHelper = require('../utils/currencyHelper');
    return CurrencyHelper.generateShortId();
  }

  async getInventoryItem(userId, inventoryId) {
    const user = await this.getUser(userId);
    return user.inventory.find(item => item.inventory_id === inventoryId);
  }

  async equipRole(userId, inventoryId) {
    const user = await this.getUser(userId);
    const item = user.inventory.find(inv => inv.inventory_id === inventoryId);
    
    if (!item || item.type !== 'role') {
      throw new Error('Rol no encontrado en tu inventario');
    }

    // Remover el item del inventario
    const updatedInventory = user.inventory.filter(inv => inv.inventory_id !== inventoryId);
    
    await this.updateUser(userId, {
      inventory: updatedInventory
    });

    return item;
  }

  async buyHorse(userId, itemId, horseName) {
    const item = this.getShopItem(itemId);
    if (!item || item.type !== 'horse') {
      throw new Error('Caballo no encontrado');
    }

    const user = await this.getUser(userId);
    
    if (user.cash < item.price) {
      throw new Error('Dinero insuficiente');
    }

    // Verificar si ya tiene este caballo
    const hasHorse = user.inventory.some(invItem => 
      invItem.type === 'horse' && invItem.name === horseName
    );
    
    if (hasHorse) {
      throw new Error('Ya tienes este caballo');
    }

    // Agregar caballo al inventario
    const newHorse = {
      inventory_id: this.generateInventoryId(),
      id: itemId,
      name: horseName,
      type: 'horse',
      quantity: 1,
      wins: 0,
      losses: 0,
      total_races: 0,
      win_rate: 0,
      purchased_at: new Date().toISOString()
    };

    const updatedInventory = [...user.inventory, newHorse];

    await this.updateUser(userId, {
      cash: user.cash - item.price,
      total_spent: user.total_spent + item.price,
      inventory: updatedInventory
    });

    return item;
  }

  async getUserHorses(userId) {
    const user = await this.getUser(userId);
    return user.inventory.filter(item => item.type === 'horse');
  }

  async getUserItems(userId) {
    const user = await this.getUser(userId);
    return user.inventory.filter(item => item.type !== 'horse');
  }

  async activateBoost(userId, inventoryId) {
    const user = await this.getUser(userId);
    const item = user.inventory.find(inv => inv.inventory_id === inventoryId);
    
    if (!item || item.type !== 'boost') {
      throw new Error('Potenciador no encontrado en tu inventario');
    }

    // Verificar si ya tiene este tipo de boost activo
    const hasActiveBoost = user.active_boosts.some(boost => boost.effect === item.effect);
    if (hasActiveBoost) {
      throw new Error('Ya tienes este tipo de potenciador activo');
    }

    // Activar el boost
    const activeBoost = {
      effect: item.effect,
      name: item.name,
      emoji: item.emoji,
      activated_at: new Date().toISOString(),
      uses_remaining: item.uses || 1
    };

    const updatedActiveBoosts = [...user.active_boosts, activeBoost];

    // Reducir cantidad del item o eliminarlo si es el último
    let updatedInventory;
    const currentQuantity = item.quantity || 1;
    
    if (currentQuantity > 1) {
      updatedInventory = user.inventory.map(inv => 
        inv.inventory_id === inventoryId 
          ? { ...inv, quantity: currentQuantity - 1 }
          : inv
      );
    } else {
      updatedInventory = user.inventory.filter(inv => inv.inventory_id !== inventoryId);
    }

    await this.updateUser(userId, {
      inventory: updatedInventory,
      active_boosts: updatedActiveBoosts
    });

    return activeBoost;
  }

  async consumeBoost(userId, effect) {
    const user = await this.getUser(userId);
    const boostIndex = user.active_boosts.findIndex(boost => boost.effect === effect);
    
    if (boostIndex === -1) {
      return false;
    }

    const boost = user.active_boosts[boostIndex];
    boost.uses_remaining--;

    let updatedActiveBoosts;
    if (boost.uses_remaining <= 0) {
      // Remover boost si no tiene más usos
      updatedActiveBoosts = user.active_boosts.filter((_, index) => index !== boostIndex);
    } else {
      // Actualizar boost con menos usos
      updatedActiveBoosts = [...user.active_boosts];
      updatedActiveBoosts[boostIndex] = boost;
    }

    await this.updateUser(userId, {
      active_boosts: updatedActiveBoosts
    });

    return true;
  }

  async hasActiveBoost(userId, effect) {
    const user = await this.getUser(userId);
    return user.active_boosts.some(boost => boost.effect === effect && boost.uses_remaining > 0);
  }

  async getActiveBoosts(userId) {
    const user = await this.getUser(userId);
    return user.active_boosts || [];
  }

  async updateHorseStats(userId, horseName, won) {
    const user = await this.getUser(userId);
    const updatedInventory = user.inventory.map(item => {
      if (item.type === 'horse' && item.name === horseName) {
        const newStats = {
          ...item,
          total_races: item.total_races + 1
        };
        
        if (won) {
          newStats.wins = item.wins + 1;
        } else {
          newStats.losses = item.losses + 1;
        }
        
        newStats.win_rate = newStats.total_races > 0 ? (newStats.wins / newStats.total_races) * 100 : 0;
        return newStats;
      }
      return item;
    });

    await this.updateUser(userId, { inventory: updatedInventory });
  }

  async removeUserHorse(userId, horseName) {
    const user = await this.getUser(userId);
    const updatedInventory = user.inventory.filter(item => 
      !(item.type === 'horse' && item.name === horseName)
    );

    await this.updateUser(userId, { inventory: updatedInventory });
  }

  async getTopUsers(limit = 10) {
    const cacheKey = `top_users_${limit}`;
    const cached = this.getCachedQuery(cacheKey);
    if (cached) return cached;

    try {
      // Asegurar que limit sea un número entero válido
      const safeLimit = parseInt(limit) || 10;
      
      // MySQL no permite parámetros preparados en LIMIT, usar consulta directa
      const [rows] = await this.pool.execute(
        `SELECT id, username, cash, bank, (cash + bank) as total FROM users_economy ORDER BY total DESC LIMIT ${safeLimit}`
      );

      this.setCachedQuery(cacheKey, rows);
      return rows;
    } catch (error) {
      console.error('Error obteniendo top usuarios:', error);
      throw error;
    }
  }

  // Métodos para manejar ruleta desde JSON
  createRouletteSession(sessionId, channelId, creatorId) {
    if (!this.rouletteData.sessions) {
      this.rouletteData.sessions = {};
    }
    if (!this.rouletteData.bets) {
      this.rouletteData.bets = {};
    }

    this.rouletteData.sessions[sessionId] = {
      id: sessionId,
      channel_id: channelId,
      creator_id: creatorId,
      status: 'waiting',
      created_at: new Date().toISOString()
    };

    this.rouletteData.bets[sessionId] = [];
    this.saveJSON('roulette_sessions.json', this.rouletteData);
  }

  addRouletteBet(sessionId, userId, betType, betValue, amount, username, hasLossProtection = false) {
    if (!this.rouletteData.bets[sessionId]) {
      this.rouletteData.bets[sessionId] = [];
    }

    this.rouletteData.bets[sessionId].push({
      session_id: sessionId,
      user_id: userId,
      username: username,
      bet_type: betType,
      bet_value: betValue,
      amount: amount,
      hasLossProtection: hasLossProtection,
      created_at: new Date().toISOString()
    });

    this.saveJSON('roulette_sessions.json', this.rouletteData);
  }

  getRouletteSession(sessionId) {
    return this.rouletteData.sessions?.[sessionId] || null;
  }

  getRouletteBets(sessionId) {
    return this.rouletteData.bets?.[sessionId] || [];
  }

  updateRouletteSession(sessionId, data) {
    if (this.rouletteData.sessions?.[sessionId]) {
      Object.assign(this.rouletteData.sessions[sessionId], data);
      this.saveJSON('roulette_sessions.json', this.rouletteData);
    }
  }

  endRouletteSession(sessionId) {
    // Limpiar SOLO la sesión específica y sus apuestas
    if (this.rouletteData.sessions && this.rouletteData.sessions[sessionId]) {
      delete this.rouletteData.sessions[sessionId];
    }
    if (this.rouletteData.bets && this.rouletteData.bets[sessionId]) {
      delete this.rouletteData.bets[sessionId];
    }
    this.saveJSON('roulette_sessions.json', this.rouletteData);
  }

  // Métodos para préstamos
  getAvailableLoans() {
    return this.loansData.loans || [];
  }

  getLoanTemplate(loanId) {
    return this.loansData.loans?.find(loan => loan.id === loanId);
  }

  async createLoan(loanData) {
    try {
      await this.pool.execute(
        `INSERT INTO prestamos (lender_id, borrower_id, loan_name, amount, interest_rate, daily_payment, total_amount, total_days, start_date, end_date, status) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          loanData.lender_id,
          loanData.borrower_id,
          loanData.loan_name,
          loanData.amount,
          loanData.interest_rate,
          loanData.daily_payment,
          loanData.total_amount,
          loanData.total_days,
          loanData.start_date,
          loanData.end_date,
          loanData.status
        ]
      );
    } catch (error) {
      console.error('Error creando préstamo:', error);
      throw error;
    }
  }

  async getUserActiveLoans(userId) {
    try {
      const [rows] = await this.pool.execute(
        'SELECT * FROM prestamos WHERE borrower_id = ? AND status = "active" ORDER BY start_date DESC',
        [userId]
      );
      return rows;
    } catch (error) {
      console.error('Error obteniendo préstamos activos:', error);
      return [];
    }
  }

  async getAllActiveLoans() {
    try {
      const [rows] = await this.pool.execute(
        'SELECT * FROM prestamos WHERE status = "active" AND DATE(CURDATE()) > DATE(start_date)'
      );
      return rows;
    } catch (error) {
      console.error('Error obteniendo todos los préstamos activos:', error);
      return [];
    }
  }

  async processLoanPayment(loanId, userId, paymentAmount) {
    try {
      const user = await this.getUser(userId);
      
      // Descontar pago (puede quedar en negativo)
      await this.updateUser(userId, {
        cash: user.cash - paymentAmount,
        total_spent: user.total_spent + paymentAmount
      });

      await this.addTransaction(userId, 'loan_payment', -paymentAmount, 'Pago diario de préstamo');

      // Verificar si el préstamo está completado
      const [loanRows] = await this.pool.execute(
        'SELECT * FROM prestamos WHERE id = ?',
        [loanId]
      );

      if (loanRows.length > 0) {
        const loan = loanRows[0];
        const endDate = new Date(loan.end_date);
        const today = new Date();
        
        if (today >= endDate) {
          // Marcar préstamo como completado
          await this.pool.execute(
            'UPDATE prestamos SET status = "completed" WHERE id = ?',
            [loanId]
          );
        }
      }

      return user.cash - paymentAmount;
    } catch (error) {
      console.error('Error procesando pago de préstamo:', error);
      throw error;
    }
  }

  // Métodos para collect
  getCollectCategories() {
    return this.collectData.categories || {};
  }

  findUserCollectCategory(userRoles) {
    const categories = this.getCollectCategories();
    
    for (const [categoryId, category] of Object.entries(categories)) {
      const hasRole = category.roles.some(roleId => userRoles.has(roleId));
      if (hasRole) {
        return { id: categoryId, ...category };
      }
    }
    
    return null;
  }

  // Limpiar cache periódicamente
  clearExpiredCache() {
    const now = Date.now();
    for (const [key, value] of this.queryCache.entries()) {
      if (now - value.timestamp > this.cacheTimeout) {
        this.queryCache.delete(key);
      }
    }
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      console.log('🔒 Pool de conexiones cerrado');
    }
  }
}

module.exports = Database;