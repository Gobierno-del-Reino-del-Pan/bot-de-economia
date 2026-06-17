const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const CurrencyHelper = require('../utils/currencyHelper');
const ErrorHandler = require('../utils/errorHandler');

module.exports = {
  name: 'tienda',
  aliases: ['shop', 'store'],
  description: 'Explora la tienda del Reino del Pan',
  
  async execute(message, args) {
    try {
      if (args[0] === 'comprar' && args[1]) {
        return this.buyItem(message, args[1]);
      }

      const items = message.client.db.getShopItems();
      
      // Filtrar solo items disponibles
      const availableItems = items.filter(item => item.available !== false);
      
      if (availableItems.length === 0) {
        return message.reply('❌ La tienda está vacía en este momento.');
      }

      // Agrupar items por tipo
      const itemsByType = availableItems.reduce((acc, item) => {
        if (!acc[item.type]) acc[item.type] = [];
        acc[item.type].push(item);
        return acc;
      }, {});

      const embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('Tienda del Reino del Pan')
        .setDescription(`Bienvenido a la tienda oficial del reino! Aqui encontraras panes, roles exclusivos, potenciadores y caballos de carrera.\n\n*El dinero de las compras va al Gobierno del Reino*`)
        .setThumbnail('https://images.pexels.com/photos/1775043/pexels-photo-1775043.jpeg?auto=compress&cs=tinysrgb&w=400')
        .setTimestamp();

      // Mostrar items por categoría
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

      // Cómo comprar
      embed.addFields({
        name: '💡 Cómo Comprar',
        value: 'Usa `!tienda comprar <id>` para adquirir un item',
        inline: false
      });

      await message.reply({ embeds: [embed] });

    } catch (error) {
      await ErrorHandler.handleError(error, message, 'tienda');
    }
  },

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
        // Actualizar usuario primero (descontar dinero)
        await message.client.db.updateUser(message.author.id, {
          cash: user.cash - finalPrice,
          total_spent: user.total_spent + finalPrice
        });

        // Agregar item al inventario (sin tocar el dinero)
        await this.addToInventory(message, user, item);

        // Todo el dinero va al gobierno
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

      // Colores por rareza
      const rarityColors = {
        'common': '#95a5a6',
        'uncommon': '#27ae60',
        'rare': '#3498db',
        'epic': '#9b59b6',
        'legendary': '#f39c12',
        'mythic': '#e74c3c'
      };

      // Embed de exito
      const embed = new EmbedBuilder()
        .setColor(rarityColors[item.rarity] || '#95a5a6')
        .setTitle('Compra Exitosa')
        .setDescription(`Compraste **${item.name}**!`)
        .addFields(
          { name: 'Item', value: `${item.emoji} ${item.name}`, inline: true },
          { name: 'Rareza', value: item.rarity, inline: true },
          { name: 'Precio', value: `${CurrencyHelper.format(finalPrice)}\n*Enviado al Gobierno*`, inline: true },
          { name: 'Descripcion', value: item.description, inline: false }
        )
        .setFooter({
          text: `Balance restante: ${CurrencyHelper.format(user.cash - finalPrice)}`
        })
        .setTimestamp();

      if (item.type === 'role') {
        embed.addFields({ name: 'Rol Adquirido', value: `**${item.name}** se agrego a tu inventario. Usa \`!usar <inventory_id>\` para equiparlo.`, inline: false });
      } else if (item.type === 'horse') {
        embed.addFields({ name: 'Caballo Adquirido', value: `**${item.name}** ahora esta en tu establo. Usa \`!carrera <cantidad>\` para competir.`, inline: false });
      } else if (item.type === 'boost') {
        embed.addFields({ name: 'Potenciador Adquirido', value: `**${item.name}** se agrego a tu inventario. Usa \`!usar <inventory_id>\` para activarlo.`, inline: false });
      }

      await message.reply({ embeds: [embed] });

    } catch (error) {
      await ErrorHandler.handleDatabaseError(error, message);
    }
  },

  async addToInventory(message, user, item) {
    // Verificar si ya tiene el item (para items no stackeables)
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
      // Invalidar cache primero para obtener valor actualizado
      message.client.db.invalidateCache('entidad_gobierno');

      const gobierno = await message.client.db.getEntidad('gobierno');
      console.log(`[TIENDA] Enviando ${amount} al gobierno. Balance actual: ${gobierno?.balance}`);

      if (gobierno && amount > 0) {
        const newBalance = gobierno.balance + amount;
        const newTotalEarned = gobierno.total_earned + amount;

        await message.client.db.updateEntidad('gobierno', {
          balance: newBalance,
          total_earned: newTotalEarned
        });

        console.log(`[TIENDA] Nuevo balance gobierno: ${newBalance}`);
      }
    } catch (error) {
      console.error('[TIENDA] Error enviando dinero al gobierno:', error);
    }
  }
};