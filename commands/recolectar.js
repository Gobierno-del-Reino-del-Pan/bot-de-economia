const { EmbedBuilder } = require('discord.js');
const CurrencyHelper = require('../utils/currencyHelper');
const ErrorHandler = require('../utils/errorHandler');
const config = require('../config.json');

module.exports = {
  name: 'recolectar',
  aliases: ['collect', 'claim'],
  description: 'Recolecta dinero basado en tus roles (directamente al banco)',

  async execute(message, args) {
    try {
      const user = await message.client.db.getUser(message.author.id, message.author.username);
      const now = Date.now();
      const hasCollectBoost = await message.client.db.hasActiveBoost(message.author.id, 'collect_rush');
      const irpfRate = config.irpf || 7;

      // Obtener roles del usuario en el servidor
      const member = await message.guild.members.fetch(message.author.id);
      const userRoleIds = new Set(member.roles.cache.map(role => role.id));

      // Buscar TODAS las categorías de collect disponibles
      const categories = message.client.db.getCollectCategories();
      const availableCategories = [];

      for (const [categoryId, category] of Object.entries(categories)) {
        // Verificar si tiene algún rol de esta categoría
        const hasRole = category.roles.some(roleId => userRoleIds.has(roleId));
        if (!hasRole) continue;

        // Verificar cooldown de la categoría
        const lastCollect = user.collect_cooldowns[categoryId] || 0;
        let effectiveCooldown = category.cooldown;
        
        // Si tiene boost de recolección, reducir cooldown a la mitad
        if (hasCollectBoost) {
          effectiveCooldown = Math.floor(category.cooldown / 2);
        }
        
        const timeLeft = effectiveCooldown - (now - lastCollect);
        
        if (timeLeft <= 0) {
          availableCategories.push({ id: categoryId, ...category });
        }
      }

      if (availableCategories.length === 0) {
        // Mostrar información de cooldowns
        const categoryInfo = [];
        
        for (const [categoryId, category] of Object.entries(categories)) {
          const hasRole = category.roles.some(roleId => userRoleIds.has(roleId));
          if (hasRole) {
            const lastCollect = user.collect_cooldowns[categoryId] || 0;
            let effectiveCooldown = category.cooldown;
            
            if (hasCollectBoost) {
              effectiveCooldown = Math.floor(category.cooldown / 2);
            }
            
            const timeLeft = effectiveCooldown - (now - lastCollect);
            if (timeLeft > 0) {
              const nextCollectTime = Math.floor((now + timeLeft) / 1000);
              categoryInfo.push(`${category.emoji} **${category.name}**: <t:${nextCollectTime}:R>`);
            } else {
              categoryInfo.push(`${category.emoji} **${category.name}**: Disponible`);
            }
          }
        }

        const embed = new EmbedBuilder()
          .setColor('#ffaa00')
          .setTitle('⏰ Sin Recolecciones Disponibles')
          .setDescription('No tienes categorías de roles disponibles para recolectar en este momento.')
          .addFields({
            name: '📊 Estado de tus Categorías',
            value: categoryInfo.length > 0 ? categoryInfo.join('\n') : 'No tienes roles de recolección',
            inline: false
          })
          .setTimestamp();

        return message.reply({ embeds: [embed] });
      }

      // RECOLECTAR DE TODAS LAS CATEGORÍAS DISPONIBLES
      let totalAmount = 0;
      const collectedCategories = [];
      const updatedCooldowns = { ...user.collect_cooldowns };

      for (const category of availableCategories) {
        totalAmount += category.amount;
        collectedCategories.push(category);

        // Actualizar cooldown de cada categoría
        updatedCooldowns[category.id] = now;
      }

      // Calcular IRPF (impuesto que va al gobierno)
      const irpfAmount = Math.floor(totalAmount * (irpfRate / 100));
      const netAmount = totalAmount - irpfAmount;

      // Consumir boost si se usó
      if (hasCollectBoost) {
        await message.client.db.consumeBoost(message.author.id, 'collect_rush');
      }

      // Actualizar usuario - DINERO VA AL BANCO, NO AL CASH
      await message.client.db.updateUser(message.author.id, {
        bank: user.bank + netAmount,
        total_earned: user.total_earned + netAmount,
        collect_cooldowns: updatedCooldowns
      });

      // Enviar IRPF al gobierno
      if (irpfAmount > 0) {
        const gobierno = await message.client.db.getEntidad('gobierno');
        if (gobierno) {
          await message.client.db.updateEntidad('gobierno', {
            balance: gobierno.balance + irpfAmount,
            total_earned: gobierno.total_earned + irpfAmount
          });
        }
      }

      await message.client.db.addTransaction(message.author.id, 'collect', netAmount, `Recolección: ${collectedCategories.map(c => c.name).join(', ')}`);

      // Crear descripción de las categorías recolectadas
      const categoriesDescription = collectedCategories.map(cat =>
        `${cat.emoji} **${cat.name}**: ${CurrencyHelper.format(cat.amount)}`
      ).join('\n');

      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('🏦 Recolección Exitosa')
        .setDescription(`¡Recolectaste de **${collectedCategories.length}** categoría${collectedCategories.length !== 1 ? 's' : ''}!${hasCollectBoost ? '\n🚀 **Boost de Recolección usado** - Cooldowns reducidos a la mitad' : ''}`)
        .addFields(
          { name: '💰 Categorías Recolectadas', value: categoriesDescription, inline: false },
          { name: '💵 Total Bruto', value: CurrencyHelper.format(totalAmount), inline: true },
          { name: '🏛️ IRPF (' + irpfRate + '%)', value: CurrencyHelper.format(irpfAmount), inline: true },
          { name: '🏦 Depositado al Banco', value: CurrencyHelper.format(netAmount), inline: true }
        )
        .setFooter({ text: `IRPF enviado al Gobierno del Reino` })
        .setTimestamp();

      await message.reply({ embeds: [embed] });

    } catch (error) {
      await ErrorHandler.handleError(error, message, 'recolectar');
    }
  }
};