const { EmbedBuilder } = require('discord.js');
const CurrencyHelper = require('../utils/currencyHelper');
const ErrorHandler = require('../utils/errorHandler');

module.exports = {
  name: 'inventario',
  aliases: ['inventory', 'inv', 'items', 'bag'],
  description: 'Muestra tu inventario de items',
  
  async execute(message, args) {
    try {
      const target = message.mentions.users.first() || message.author;
      const user = await message.client.db.getUser(target.id, target.username);
      const inventory = user.inventory || [];
      const activeBoosts = user.active_boosts || [];

      if (inventory.length === 0) {
        const embed = new EmbedBuilder()
          .setColor('#95a5a6')
          .setTitle('🎒 Inventario Vacío')
          .setDescription(`${target.id === message.author.id ? 'Tu inventario' : `El inventario de ${target.username}`} está vacío.`)
          .addFields({
            name: '💡 Consejo',
            value: 'Usa `!tienda` para ver los items disponibles para comprar.',
            inline: false
          })
          .setTimestamp();

        return message.reply({ embeds: [embed] });
      }

      // Mostrar potenciadores activos si los hay
      if (activeBoosts.length > 0 && target.id === message.author.id) {
        const activeBoostsList = activeBoosts.map(boost => {
          const activatedDate = new Date(boost.activated_at).toLocaleDateString();
          return `${boost.emoji} **${boost.name}** - ${boost.uses_remaining} uso${boost.uses_remaining !== 1 ? 's' : ''} restante${boost.uses_remaining !== 1 ? 's' : ''}`;
        }).join('\n');

        // Este código se agregará después del embed principal
      }

      // Agrupar items por tipo
      const itemsByType = inventory.reduce((acc, item) => {
        // Agrupar productos de empresas separadamente
        if (item.type === 'empresa_product') {
          if (!acc['empresa_products']) acc['empresa_products'] = [];
          acc['empresa_products'].push(item);
        } else {
        if (!acc[item.type]) acc[item.type] = [];
        acc[item.type].push(item);
        }
        return acc;
      }, {});

      const embed = new EmbedBuilder()
        .setColor('#4169e1')
        .setTitle(`🎒 Inventario de ${target.username}`)
        .setDescription(`${target.username} tiene **${inventory.length}** item${inventory.length !== 1 ? 's' : ''} en su inventario.`)
        .setThumbnail(target.displayAvatarURL())
        .setTimestamp();

      // Mostrar potenciadores activos si los hay
      if (activeBoosts.length > 0 && target.id === message.author.id) {
        const activeBoostsList = activeBoosts.map(boost => {
          const activatedDate = new Date(boost.activated_at).toLocaleDateString();
          return `${boost.emoji} **${boost.name}** - ${boost.uses_remaining} uso${boost.uses_remaining !== 1 ? 's' : ''} restante${boost.uses_remaining !== 1 ? 's' : ''}`;
        }).join('\n');

        embed.addFields({
          name: '⚡ Potenciadores Activos',
          value: activeBoostsList,
          inline: false
        });
      }

      // Mostrar items por categoría
      for (const [type, typeItems] of Object.entries(itemsByType)) {
        if (type === 'empresa_products') {
          const typeEmoji = '🏢';
          const typeName = 'Productos Empresariales';
          
          const itemList = typeItems.map(item => {
            const purchaseDate = new Date(item.purchased_at).toLocaleDateString();
            const quantity = item.quantity || 1;
            return `**ID:** \`${item.inventory_id}\` | ${item.emoji} **${item.name}** ${quantity > 1 ? `(x${quantity})` : ''}\n*${item.empresa} - Comprado: ${purchaseDate}*`;
          }).join('\n\n');

          embed.addFields({
            name: `${typeEmoji} ${typeName} (${typeItems.length})`,
            value: itemList,
            inline: false
          });
          continue;
        }
        
        const typeEmoji = type === 'food' ? '🍞' : type === 'role' ? '👑' : type === 'boost' ? '⚡' : '🐎';
        const typeName = type === 'food' ? 'Alimentos' : type === 'role' ? 'Roles' : type === 'boost' ? 'Potenciadores' : 'Caballos';
        
        let itemList;
        
        if (type === 'horse') {
          itemList = typeItems.map(item => {
            const purchaseDate = new Date(item.purchased_at).toLocaleDateString();
            const winRate = item.total_races > 0 ? ((item.wins / item.total_races) * 100).toFixed(1) : '0.0';
            return `**ID:** \`${item.inventory_id}\` | 🐎 **${item.name}**\n*Comprado: ${purchaseDate}*\n🏆 ${item.wins}V/${item.losses}D (${winRate}% victorias)`;
          }).join('\n\n');
        } else if (type === 'role') {
          itemList = typeItems.map(item => {
            const purchaseDate = new Date(item.purchased_at).toLocaleDateString();
            return `**ID:** \`${item.inventory_id}\` | ${item.emoji} **${item.name}**\n*Comprado: ${purchaseDate}*\n*Usa \`!usar ${item.inventory_id}\` para usarlo*`;
          }).join('\n\n');
        } else {
          itemList = typeItems.map(item => {
            const purchaseDate = new Date(item.purchased_at).toLocaleDateString();
            const quantity = item.quantity || 1;
            let itemInfo = `**ID:** \`${item.inventory_id}\` | ${item.emoji} **${item.name}** ${quantity > 1 ? `(x${quantity})` : ''}\n*Comprado: ${purchaseDate}*`;
            
            if (item.type === 'boost') {
              itemInfo += `\n🔥 Usos: ${item.uses || 1}`;
            }
            
            return itemInfo;
          }).join('\n\n');
        }

        embed.addFields({
          name: `${typeEmoji} ${typeName} (${typeItems.length})`,
          value: itemList,
          inline: false
        });
      }

      // Calcular valor total del inventario
      const totalValue = inventory.reduce((sum, item) => {
        const quantity = item.quantity || 1;
        if (item.type === 'empresa_product') {
          return sum + ((item.price || 0) * quantity);
        }
        if (item.type === 'horse') return sum + (1000 * quantity);
        return sum + ((item.price || 0) * quantity);
      }, 0);
      
      embed.addFields({
        name: '💎 Valor Total del Inventario',
        value: CurrencyHelper.format(totalValue),
        inline: true
      });

      await message.reply({ embeds: [embed] });

    } catch (error) {
      await ErrorHandler.handleError(error, message, 'inventario');
    }
  }
};
