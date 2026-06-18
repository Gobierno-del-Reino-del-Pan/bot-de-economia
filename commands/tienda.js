const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const CurrencyHelper = require('../utils/currencyHelper');
const ErrorHandler = require('../utils/errorHandler');

module.exports = {
  name: 'tienda',
  aliases: ['shop', 'store'],
  description: 'Explora la tienda del Reino del Pan o la de una empresa',

  async execute(message, args) {
    try {
      if (args[0] && args[0].toLowerCase() === 'comprar' && args[1]) {
        return this.buyItem(message, args[1]);
      }

      if (args[0] && args[0].toLowerCase() !== 'comprar') {
        return this.showEmpresaShop(message, args[0]);
      }

      return this.showGlobalShop(message);
    } catch (error) {
      await ErrorHandler.handleError(error, message, 'tienda');
    }
  },

  // ─── TIENDA GLOBAL ──────────────────────────────────────────────────────
  async showGlobalShop(message) {
    const items = message.client.db.getShopItems();
    const availableItems = items.filter(item => item.available !== false);

    if (availableItems.length === 0) {
      return message.reply('❌ La tienda está vacía en este momento.');
    }

    const itemsByType = availableItems.reduce((acc, item) => {
      if (!acc[item.type]) acc[item.type] = [];
      acc[item.type].push(item);
      return acc;
    }, {});

    const embed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle('🏪 Tienda del Reino del Pan')
      .setDescription(`Bienvenido a la tienda oficial del reino. Aquí encontrarás panes, roles exclusivos, potenciadores y caballos de carrera.\n\n*El dinero de las compras va al Gobierno del Reino*`)
      .setThumbnail('https://images.pexels.com/photos/1775043/pexels-photo-1775043.jpeg?auto=compress&cs=tinysrgb&w=400')
      .setTimestamp();

    for (const [type, typeItems] of Object.entries(itemsByType)) {
      const typeEmoji = type === 'food' ? '🍞' : type === 'role' ? '👑' : type === 'boost' ? '⚡' : '🐎';
      const typeName = type === 'food' ? 'Alimentos' : type === 'role' ? 'Roles' : type === 'boost' ? 'Potenciadores' : 'Caballos';

      const itemList = typeItems.map(item => {
        return `**ID:** \`${item.id}\` | ${item.emoji} **${item.name}** | ${CurrencyHelper.format(item.price)}\n*${item.description}*`;
      }).join('\n\n');

      embed.addFields({
        name: `-----------------\n${typeEmoji} ${typeName}`,
        value: itemList || 'No hay items disponibles',
        inline: false
      });
    }

    embed.addFields({
      name: '💡 Cómo Comprar',
      value: 'Usa `!tienda comprar <id>` para adquirir un item de la tienda global.\n\n**Para ver la tienda de una empresa:** `!tienda <nombre_empresa>` (ej. `!tienda sexo`)',
      inline: false
    });

    await message.reply({ embeds: [embed] });
  },

  // ─── TIENDA DE EMPRESA (con IVA incluido en el precio mostrado) ──────
  async showEmpresaShop(message, empresaName) {
    try {
      const empresas = await message.client.db.getAllEmpresas();
      const empresa = empresas.find(e =>
        e.id === empresaName ||
        e.name.toLowerCase() === empresaName.toLowerCase() ||
        e.name.toLowerCase().includes(empresaName.toLowerCase())
      );

      if (!empresa) {
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('🏢 Empresa No Encontrada')
          .setDescription(`No existe ninguna empresa llamada **${empresaName}**.`)
          .addFields({
            name: 'Empresas disponibles',
            value: empresas.length > 0
              ? empresas.map(e => `• ${e.emoji || '🏢'} **${e.name}**`).join('\n')
              : 'No hay empresas registradas.',
            inline: false
          })
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      const products = await message.client.db.getEmpresaProducts(empresa.id);
      const ivaRate = config.iva || 33; // Tasa de IVA desde configuración

      const embed = new EmbedBuilder()
        .setColor('#f1c40f')
        .setTitle(`🛒 Tienda de ${empresa.name}`)
        .setDescription(
          empresa.description || 'Productos disponibles para comprar.\n' +
          '**Los precios mostrados ya incluyen el IVA** (redondeado al alza).'
        )
        .setTimestamp();

      if (products.length === 0) {
        embed.addFields({
          name: '📦 Sin Productos',
          value: 'Esta empresa aún no ha agregado productos a su tienda.',
          inline: false
        });
      } else {
        // Lista de productos mostrando el precio total (con IVA)
        const productList = products.map(p => {
          // Calcular precio con IVA (redondeado al alza)
          const ivaAmount = Math.ceil(p.price * (ivaRate / 100));
          const totalPrice = p.price + ivaAmount;
          const stockDisplay = p.stock !== null ? `${p.stock} unidades` : '∞ (ilimitado)';
          return `**${p.emoji || '📦'} ${p.name}**\n` +
                 `└ ID: \`${p.product_id}\` · Precio (IVA incl.): ${CurrencyHelper.format(totalPrice)} · Stock: ${stockDisplay}\n` +
                 (p.description ? `└ *${p.description}*\n` : '');
        }).join('\n');

        embed.addFields({
          name: `📋 Productos (${products.length})`,
          value: productList,
          inline: false
        });
      }

      embed.addFields({
        name: '💡 Cómo comprar',
        value: `Usa \`!entidad comprar ${empresa.name.toLowerCase()} <ID> [cantidad]\`\nEl precio final incluye el IVA (${ivaRate}%).`,
        inline: false
      });

      await message.reply({ embeds: [embed] });
    } catch (error) {
      await ErrorHandler.handleError(error, message, 'tienda empresa');
    }
  },

  // ─── COMPRAR ITEM GLOBAL ───────────────────────────────────────────────
  async buyItem(message, itemId) {
    try {
      const user = await message.client.db.getUser(message.author.id, message.author.username);
      const item = message.client.db.getShopItem(itemId);

      if (!item) {
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('Item No Encontrado')
          .setDescription('El item especificado no existe en la tienda.')
          .addFields({
            name: 'Consejo',
            value: 'Usa `!tienda` para ver todos los items disponibles.',
            inline: false
          })
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      const finalPrice = item.price;

      if (user.cash < finalPrice) {
        return ErrorHandler.handleInsufficientFundsError(
          message,
          CurrencyHelper.format(finalPrice),
          CurrencyHelper.format(user.cash)
        );
      }

      // Procesar compra
      try {
        await message.client.db.updateUser(message.author.id, {
          cash: user.cash - finalPrice,
          total_spent: user.total_spent + finalPrice
        });

        await this.addToInventory(message, user, item);
        await this.sendToGovernment(message, finalPrice);
      } catch (dbError) {
        // Devolver dinero en caso de error
        await message.client.db.updateUser(message.author.id, {
          cash: user.cash,
          total_spent: user.total_spent
        });

        if (dbError.message === 'Ya tienes este item' || dbError.message === 'Ya tienes este caballo') {
          const embed = new EmbedBuilder()
            .setColor('#ffaa00')
            .setTitle(item.type === 'horse' ? 'Caballo Duplicado' : 'Item Duplicado')
            .setDescription(`Ya tienes **${item.name}** en tu inventario.`)
            .setTimestamp();
          return message.reply({ embeds: [embed] });
        }
        throw dbError;
      }

      const rarityColors = {
        'common': '#95a5a6',
        'uncommon': '#27ae60',
        'rare': '#3498db',
        'epic': '#9b59b6',
        'legendary': '#f39c12',
        'mythic': '#e74c3c'
      };

      const embed = new EmbedBuilder()
        .setColor(rarityColors[item.rarity] || '#95a5a6')
        .setTitle('✅ Compra Exitosa')
        .setDescription(`Compraste **${item.name}**!`)
        .addFields(
          { name: 'Item', value: `${item.emoji} ${item.name}`, inline: true },
          { name: 'Rareza', value: item.rarity, inline: true },
          { name: 'Precio', value: `${CurrencyHelper.format(finalPrice)}\n*Enviado al Gobierno*`, inline: true },
          { name: 'Descripción', value: item.description, inline: false }
        )
        .setFooter({
          text: `Balance restante: ${CurrencyHelper.format(user.cash - finalPrice)}`
        })
        .setTimestamp();

      if (item.type === 'role') {
        embed.addFields({ name: 'Rol Adquirido', value: `**${item.name}** se agregó a tu inventario. Usa \`!usar <inventory_id>\` para equiparlo.`, inline: false });
      } else if (item.type === 'horse') {
        embed.addFields({ name: 'Caballo Adquirido', value: `**${item.name}** ahora está en tu establo. Usa \`!carrera <cantidad>\` para competir.`, inline: false });
      } else if (item.type === 'boost') {
        embed.addFields({ name: 'Potenciador Adquirido', value: `**${item.name}** se agregó a tu inventario. Usa \`!usar <inventory_id>\` para activarlo.`, inline: false });
      }

      await message.reply({ embeds: [embed] });

    } catch (error) {
      await ErrorHandler.handleDatabaseError(error, message);
    }
  },

  async addToInventory(message, user, item) {
    if (!item.stackable) {
      const hasItem = user.inventory.some(invItem => invItem.id === item.id);
      if (hasItem) {
        throw new Error('Ya tienes este item');
      }
    }

    let updatedInventory;

    if (item.stackable) {
      const existingItemIndex = user.inventory.findIndex(invItem => invItem.id === item.id);
      if (existingItemIndex !== -1) {
        updatedInventory = [...user.inventory];
        updatedInventory[existingItemIndex].quantity = (updatedInventory[existingItemIndex].quantity || 1) + 1;
      } else {
        const newInventoryItem = {
          inventory_id: this.generateInventoryId(),
          id: item.id,
          name: item.name,
          type: item.type,
          quantity: 1,
          purchased_at: new Date().toISOString(),
          ...item
        };
        updatedInventory = [...user.inventory, newInventoryItem];
      }
    } else {
      const newInventoryItem = {
        inventory_id: this.generateInventoryId(),
        id: item.id,
        name: item.name,
        type: item.type,
        quantity: 1,
        purchased_at: new Date().toISOString(),
        ...item
      };
      updatedInventory = [...user.inventory, newInventoryItem];
    }

    await message.client.db.updateUser(message.author.id, {
      inventory: updatedInventory
    });
  },

  generateInventoryId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < 3; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  },

  async sendToGovernment(message, amount) {
    try {
      if (amount <= 0) return;
      await message.client.db.addToGobierno(amount);
      console.log(`[TIENDA] +${amount} al gobierno`);
    } catch (error) {
      console.error('[TIENDA] Error enviando dinero al gobierno:', error);
    }
  }
};