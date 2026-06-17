const { EmbedBuilder } = require('discord.js');
const ErrorHandler = require('../utils/errorHandler');
const CurrencyHelper = require('../utils/currencyHelper');

module.exports = {
  name: 'usar',
  aliases: ['use', 'activar', 'activate'],
  description: 'Equipa un rol o activa un potenciador de tu inventario',
  
  async execute(message, args) {
    try {
      if (!args[0]) {
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('❌ Falta Información')
          .setDescription('Especifica el ID del item a usar.')
          .addFields({
            name: '💡 Uso correcto',
            value: '`!usar <inventory_id>`\n\nUsa `!inventario` para ver los IDs de tus items disponibles.\n**Ejemplo:** `!usar abc`',
            inline: false
          })
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      const inventoryId = args[0];
      const user = await message.client.db.getUser(message.author.id, message.author.username);
      
      // Buscar el item en el inventario
      const item = user.inventory.find(inv => inv.inventory_id === inventoryId);
      
      if (!item) {
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('📦 Item No Encontrado')
          .setDescription('No se encontró un item con ese ID en tu inventario.')
          .addFields({
            name: '💡 Consejo',
            value: 'Usa `!inventario` para ver todos tus items y sus IDs.',
            inline: false
          })
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      if (item.type === 'role') {
        return this.equipRole(message, inventoryId, item);
      } else if (item.type === 'boost') {
        return this.activateBoost(message, inventoryId, item);
      } else {
        const embed = new EmbedBuilder()
          .setColor('#ffaa00')
          .setTitle('⚠️ Tipo de Item Inválido')
          .setDescription('Solo puedes usar roles y potenciadores.')
          .addFields({
            name: '✅ Items válidos',
            value: '• **Roles** - Se equipan automáticamente\n• **Potenciadores** - Se activan para dar beneficios',
            inline: false
          })
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

    } catch (error) {
      if (error.message === 'Rol no encontrado en tu inventario') {
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('👑 Rol No Encontrado')
          .setDescription('Rol no encontrado en tu inventario.')
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }
      if (error.message === 'Potenciador no encontrado en tu inventario') {
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('⚡ Potenciador No Encontrado')
          .setDescription('Potenciador no encontrado en tu inventario.')
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }
      if (error.message === 'Ya tienes este tipo de potenciador activo') {
        const embed = new EmbedBuilder()
          .setColor('#ffaa00')
          .setTitle('⚡ Potenciador Ya Activo')
          .setDescription('Ya tienes este tipo de potenciador activo.')
          .addFields({
            name: '💡 Información',
            value: 'Solo puedes tener uno de cada tipo de potenciador activado a la vez.',
            inline: false
          })
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }
      await ErrorHandler.handleError(error, message, 'usar');
    }
  },

  async equipRole(message, inventoryId, item) {
    try {
      // Verificar si el usuario ya está en un juego
      if (message.client.gameManager.isUserInGame(message.author.id)) {
        return ErrorHandler.handleGameActiveError(message);
      }

      // Equipar el rol (esto lo removerá del inventario)
      await message.client.db.equipRole(message.author.id, inventoryId);

      // Asignar el rol en Discord
      let roleAssigned = false;
      try {
        const guild = message.guild;
        let role;
        
        // Buscar rol por ID si está configurado
        if (item.role_id && item.role_id.trim() !== '') {
          role = guild.roles.cache.get(item.role_id);
        }
        
        // Si no se encuentra por ID, buscar por nombre
        if (!role && item.role_name) {
          role = guild.roles.cache.find(r => r.name === item.role_name);
        }
        
        // Si no existe, crear el rol
        if (!role && item.role_name) {
          const rarityColors = {
            'common': '#95a5a6',
            'uncommon': '#27ae60',
            'rare': '#3498db',
            'epic': '#9b59b6',
            'legendary': '#f39c12',
            'mythic': '#e74c3c'
          };
          
          role = await guild.roles.create({
            name: item.role_name,
            color: rarityColors[item.rarity] || '#95a5a6',
            reason: `Rol equipado desde inventario: ${item.name}`
          });
        }
        
        if (role) {
          await message.member.roles.add(role);
          roleAssigned = true;
        }
      } catch (roleError) {
        console.error('Error asignando rol de Discord:', roleError);
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
        .setTitle('👑 Rol Equipado')
        .setDescription(item.equip_phrase || `¡Felicidades! Te has equipado el rol **${item.name}**.`)
        .addFields(
          { name: '🎭 Rol', value: `${item.emoji} **${item.name}**`, inline: true },
          { name: '💎 Rareza', value: item.rarity, inline: true },
          { name: '📝 Descripción', value: item.description, inline: false }
        )
        .setThumbnail(message.author.displayAvatarURL())
        .setTimestamp();

      if (roleAssigned) {
        embed.addFields({
          name: '✅ Estado del Rol',
          value: `Rol **${item.role_name || item.name}** asignado exitosamente en Discord`,
          inline: false
        });
      } else {
        embed.addFields({
          name: '❌ Error',
          value: 'No se pudo asignar el rol en Discord. Contacta a un administrador.',
          inline: false
        });
      }

      await message.reply({ embeds: [embed] });

    } catch (error) {
      throw error;
    }
  },

  async activateBoost(message, inventoryId, item) {
    try {
      // Verificar si el usuario ya está en un juego
      if (message.client.gameManager.isUserInGame(message.author.id)) {
        return message.reply('❌ No puedes activar potenciadores mientras estás en un juego activo.');
      }

      // Activar el boost
      const activeBoost = await message.client.db.activateBoost(message.author.id, inventoryId);

      const rarityColors = {
        'common': '#95a5a6',
        'uncommon': '#27ae60',
        'rare': '#3498db',
        'epic': '#9b59b6',
        'legendary': '#f39c12',
        'mythic': '#e74c3c'
      };

      let effectDescription = '';
      switch (item.effect) {
        case 'coffee_addict':
          effectDescription = '☕ Podrás trabajar dos veces seguidas sin cooldown';
          break;
        case 'loss_prevention':
          effectDescription = '🛡️ Tu próxima apuesta perdedora no te quitará dinero';
          break;
        case 'collect_rush':
          effectDescription = '🚀 Tus próximas recolecciones tendrán cooldown reducido a la mitad';
          break;
        default:
          effectDescription = 'Efecto especial activado';
      }

      const embed = new EmbedBuilder()
        .setColor(rarityColors[item.rarity] || '#95a5a6')
        .setTitle('⚡ Potenciador Activado')
        .setDescription(`¡Has activado **${item.name}**!`)
        .addFields(
          { name: '🎯 Potenciador', value: `${item.emoji} **${item.name}**`, inline: true },
          { name: '💎 Rareza', value: item.rarity, inline: true },
          { name: '🔥 Usos Restantes', value: `${activeBoost.uses_remaining}`, inline: true },
          { name: '📝 Efecto', value: effectDescription, inline: false }
        )
        .setThumbnail(message.author.displayAvatarURL())
        .setTimestamp();

      // Agregar información específica según el tipo
      if (item.effect === 'collect_rush') {
        const user = await message.client.db.getUser(message.author.id);
        const categories = message.client.db.getCollectCategories();
        const member = await message.guild.members.fetch(message.author.id);
        const userRoleIds = new Set(member.roles.cache.map(role => role.id));
        
        const availableCategories = [];
        for (const [categoryId, category] of Object.entries(categories)) {
          const hasRole = category.roles.some(roleId => userRoleIds.has(roleId));
          if (hasRole) {
            const lastCollect = user.collect_cooldowns[categoryId] || 0;
            const timeLeft = category.cooldown - (Date.now() - lastCollect);
            if (timeLeft > 3600000) { // Solo mostrar si queda más de 1 hora
              availableCategories.push(`${category.emoji} ${category.name}: ${Math.ceil(timeLeft / 3600000)}h → ${Math.ceil(timeLeft / 7200000)}h`);
            }
          }
        }
        
        if (availableCategories.length > 0) {
          embed.addFields({
            name: '🕐 Cooldowns Afectados',
            value: availableCategories.join('\n'),
            inline: false
          });
        }
      }

      await message.reply({ embeds: [embed] });

    } catch (error) {
      throw error;
    }
  }
};