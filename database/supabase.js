const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
const fs = require('fs');
const path = require('path');

class SupabaseDatabase {
  constructor(config) {
    this.supabaseUrl = config.url || process.env.VITE_SUPABASE_URL;
    this.supabaseKey = config.anonKey || process.env.VITE_SUPABASE_ANON_KEY;
    this.serviceRoleKey = config.serviceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    // Cliente para operaciones normales
    this.supabase = createClient(this.supabaseUrl, this.supabaseKey, {
      realtime: {
        transport: ws
      }
    });
    
    // Cliente con service role para operaciones administrativas
    this.supabaseAdmin = createClient(this.supabaseUrl, this.serviceRoleKey, {
      realtime: {
        transport: ws
      }
    });
    
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
    console.log('🔗 Conectando a Supabase...');
    
    try {
      // Verificar conexión
      const { data, error } = await this.supabase
        .from('users_economy')
        .select('count')
        .limit(1);
      
      if (error && error.code !== 'PGRST116') { // PGRST116 = tabla no existe, está bien
        throw error;
      }
      
      console.log('✅ Conexión a Supabase verificada');
    } catch (error) {
      console.error('❌ Error conectando a Supabase:', error);
      throw error;
    }

    // Verificar si existe la tabla antibots
    try {
      const { data, error } = await this.supabase
        .from('antibots')
        .select('count')
        .limit(1);
      
      if (!error) {
        console.log('✅ Tabla antibots verificada');
      }
    } catch (error) {
      console.warn('⚠️ Tabla antibots no existe. Créala usando las migraciones en README.md');
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

  invalidateCache(key) {
    this.queryCache.delete(key);
  }

  async getUser(userId, username = null) {
    const cacheKey = `user_${userId}`;
    const cached = this.getCachedQuery(cacheKey);
    if (cached) return cached;

    try {
      const { data, error } = await this.supabase
        .from('users_economy')
        .select('*')
        .eq('id', userId)
        .single();

      if (error && error.code === 'PGRST116') {
        // Usuario no existe, crear uno nuevo
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

        const { error: insertError } = await this.supabase
          .from('users_economy')
          .insert([newUser]);

        if (insertError) throw insertError;

        this.setCachedQuery(cacheKey, newUser);
        return newUser;
      }

      if (error) throw error;

      const user = data;
      
      // Actualizar username si está en blanco o es null
      if (!user.username || user.username.trim() === '' || user.username === 'null') {
        const updatedUsername = username || 'Usuario';
        await this.supabase
          .from('users_economy')
          .update({ username: updatedUsername })
          .eq('id', userId);
        user.username = updatedUsername;
      }
      
      // Parsear campos JSON si son strings
      if (typeof user.collect_cooldowns === 'string') {
        user.collect_cooldowns = JSON.parse(user.collect_cooldowns);
      }
      if (typeof user.inventory === 'string') {
        user.inventory = JSON.parse(user.inventory);
      }
      if (typeof user.active_boosts === 'string') {
        user.active_boosts = JSON.parse(user.active_boosts);
      }
      
      // Asegurar que sean objetos/arrays
      user.collect_cooldowns = user.collect_cooldowns || {};
      user.inventory = user.inventory || [];
      user.active_boosts = user.active_boosts || [];
      
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
          filteredData[key] = value;
        }
      }
      
      if (Object.keys(filteredData).length === 0) {
        return;
      }

      // Agregar updated_at
      filteredData.updated_at = new Date().toISOString();

      const { error } = await this.supabase
        .from('users_economy')
        .update(filteredData)
        .eq('id', userId);

      if (error) throw error;

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
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < 3; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
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
      const { data, error } = await this.supabase
        .from('users_economy')
        .select('id, username, cash, bank')
        .limit(limit);

      if (error) throw error;

      // Calcular total para cada usuario
      const usersWithTotal = (data || []).map(user => ({
        ...user,
        total: user.cash + user.bank
      }));

      // Ordenar por total
      usersWithTotal.sort((a, b) => b.total - a.total);

      this.setCachedQuery(cacheKey, usersWithTotal);
      return usersWithTotal;
    } catch (error) {
      console.error('Error obteniendo top usuarios:', error);
      return [];
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
      const { error } = await this.supabase
        .from('prestamos')
        .insert([{
          lender_id: loanData.lender_id,
          borrower_id: loanData.borrower_id,
          loan_name: loanData.loan_name,
          amount: loanData.amount,
          interest_rate: loanData.interest_rate,
          daily_payment: loanData.daily_payment,
          total_amount: loanData.total_amount,
          total_days: loanData.total_days,
          start_date: loanData.start_date,
          end_date: loanData.end_date,
          status: loanData.status
        }]);

      if (error) throw error;
    } catch (error) {
      console.error('Error creando préstamo:', error);
      throw error;
    }
  }

  async getUserActiveLoans(userId) {
    try {
      const { data, error } = await this.supabase
        .from('prestamos')
        .select('*')
        .eq('borrower_id', userId)
        .eq('status', 'active')
        .order('start_date', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error obteniendo préstamos activos:', error);
      return [];
    }
  }

  async getAllActiveLoans() {
    try {
      const { data, error } = await this.supabase
        .from('prestamos')
        .select('*')
        .eq('status', 'active')
        .lte('start_date', new Date().toISOString().split('T')[0]);

      if (error) throw error;
      return data || [];
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
      const { data: loanData, error } = await this.supabase
        .from('prestamos')
        .select('*')
        .eq('id', loanId)
        .single();

      if (!error && loanData) {
        const endDate = new Date(loanData.end_date);
        const today = new Date();
        
        if (today >= endDate) {
          // Marcar préstamo como completado
          await this.supabase
            .from('prestamos')
            .update({ status: 'completed' })
            .eq('id', loanId);
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

  // ─── SISTEMA DE NIVELES ──────────────────────────────────────────────────────

  async getUserLevel(userId, username = null) {
    try {
      const { data, error } = await this.supabase
        .from('user_levels')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code === 'PGRST116') {
        // No existe → crear registro nuevo
        const newRecord = {
          user_id:      userId,
          username:     username || 'Usuario',
          xp:           0,
          level:        0,
          total_xp:     0,
          messages:     0,
          last_xp_gain: 0
        };
        const { error: insertError } = await this.supabase
          .from('user_levels')
          .insert([newRecord]);
        if (insertError) throw insertError;
        return newRecord;
      }

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error obteniendo nivel de usuario:', error);
      throw error;
    }
  }

  async updateUserLevel(userId, data) {
    try {
      const validFields = ['username', 'xp', 'level', 'total_xp', 'messages', 'last_xp_gain'];
      const filtered = {};
      for (const [k, v] of Object.entries(data)) {
        if (validFields.includes(k)) filtered[k] = v;
      }
      if (Object.keys(filtered).length === 0) return;

      const { error } = await this.supabase
        .from('user_levels')
        .update(filtered)
        .eq('user_id', userId);

      if (error) throw error;
    } catch (error) {
      console.error('Error actualizando nivel de usuario:', error);
      throw error;
    }
  }

  async getTopLevels(limit = 10) {
    try {
      const { data, error } = await this.supabase
        .from('user_levels')
        .select('user_id, username, level, total_xp, messages')
        .order('total_xp', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error obteniendo top niveles:', error);
      return [];
    }
  }

  // ─── SISTEMA DE ENTIDADES Y EMPRESAS ────────────────────────────────────────

  async getEntidad(entidadId) {
    const cacheKey = `entidad_${entidadId}`;
    const cached = this.getCachedQuery(cacheKey);
    if (cached) return cached;

    try {
      const { data, error } = await this.supabase
        .from('entidades')
        .select('*')
        .eq('id', entidadId)
        .single();

      if (error && error.code === 'PGRST116') return null;
      if (error) throw error;

      this.setCachedQuery(cacheKey, data);
      return data;
    } catch (error) {
      console.error('Error obteniendo entidad:', error);
      return null;
    }
  }

  async updateEntidad(entidadId, data) {
    try {
      const { error } = await this.supabase
        .from('entidades')
        .update(data)
        .eq('id', entidadId);

      if (error) throw error;

      // Invalidar cache
      this.invalidateCache(`entidad_${entidadId}`);
      console.log(`[DB] Entidad ${entidadId} actualizada:`, data);
    } catch (error) {
      console.error('Error actualizando entidad:', error);
      throw error;
    }
  }

  async getAllEntidades() {
    try {
      const { data, error } = await this.supabase
        .from('entidades')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error obteniendo entidades:', error);
      return [];
    }
  }

  async createEmpresa(ownerId, name, description = null) {
    try {
      const { data, error } = await this.supabase
        .from('empresas')
        .insert([{
          owner_id: ownerId,
          name: name,
          description: description
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creando empresa:', error);
      throw error;
    }
  }

  async getEmpresa(empresaId) {
    try {
      const { data, error } = await this.supabase
        .from('empresas')
        .select('*')
        .eq('id', empresaId)
        .single();

      if (error && error.code === 'PGRST116') return null;
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error obteniendo empresa:', error);
      return null;
    }
  }

  async getEmpresaByOwner(ownerId) {
    try {
      const { data, error } = await this.supabase
        .from('empresas')
        .select('*')
        .eq('owner_id', ownerId)
        .single();

      if (error && error.code === 'PGRST116') return null;
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error obteniendo empresa por owner:', error);
      return null;
    }
  }

  async getAllEmpresas() {
    try {
      const { data, error } = await this.supabase
        .from('empresas')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error obteniendo empresas:', error);
      return [];
    }
  }

  async updateEmpresa(empresaId, data) {
    try {
      const { error } = await this.supabase
        .from('empresas')
        .update(data)
        .eq('id', empresaId);

      if (error) throw error;
    } catch (error) {
      console.error('Error actualizando empresa:', error);
      throw error;
    }
  }

  async donateToEntidad(entidadId, amount) {
    try {
      const entidad = await this.getEntidad(entidadId);
      if (!entidad) throw new Error('Entidad no encontrada');

      await this.supabase.rpc('increment_entidad_balance', {
        p_id: entidadId,
        p_amount: amount
      });
    } catch (error) {
      // Si la función RPC no existe, usar actualización directa
      const entidad = await this.getEntidad(entidadId);
      if (!entidad) throw new Error('Entidad no encontrada');

      await this.updateEntidad(entidadId, {
        balance: entidad.balance + amount,
        total_earned: entidad.total_earned + amount
      });
    }
  }

  async donateToEmpresa(empresaId, amount) {
    try {
      const { data, error } = await this.supabase
        .rpc('increment_empresa_balance', {
          p_id: empresaId,
          p_amount: amount
        });

      if (error) {
        const empresa = await this.getEmpresa(empresaId);
        if (!empresa) throw new Error('Empresa no encontrada');

        await this.updateEmpresa(empresaId, {
          balance: empresa.balance + amount
        });
      }
    } catch (error) {
      console.error('Error donando a empresa:', error);
      throw error;
    }
  }

  async getEmpresaProducts(empresaId) {
    try {
      const { data, error } = await this.supabase
        .from('entidad_shop')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error obteniendo productos:', error);
      return [];
    }
  }

  async addProductToEmpresa(empresaId, productId, name, price, description = null, emoji = '📦', category = 'general', stackable = true) {
    try {
      const { data, error } = await this.supabase
        .from('entidad_shop')
        .insert([{
          empresa_id: empresaId,
          product_id: productId,
          name: name,
          price: price,
          description: description,
          emoji: emoji,
          category: category,
          stackable: stackable
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error añadiendo producto:', error);
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────

  async close() {
    // Supabase no necesita cerrar conexiones explícitamente
    console.log('🔒 Conexión Supabase cerrada');
  }
}

module.exports = SupabaseDatabase;