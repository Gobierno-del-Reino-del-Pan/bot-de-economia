const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const CurrencyHelper = require('../utils/currencyHelper');
const ErrorHandler = require('../utils/errorHandler');

module.exports = {
  name: 'robar',
  aliases: ['rob', 'steal'],
  description: 'Intenta robar dinero a otro usuario',
  cooldown: config.economy.robCooldown / 1000,
  
  async execute(message, args) {
    try {
      const target = message.mentions.users.first();
      if (!target) {
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('👤 Usuario Requerido')
          .setDescription('Menciona al usuario al que quieres robar.')
          .addFields({
            name: '💡 Uso correcto',
            value: '`!robar @usuario`',
            inline: false
          })
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      if (target.id === message.author.id) {
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('🚫 Acción Inválida')
          .setDescription('No puedes robarte a ti mismo.')
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      if (target.bot) {
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('🤖 Usuario Inválido')
          .setDescription('No puedes robar a bots.')
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      const robber = await message.client.db.getUser(message.author.id, message.author.username);
      const victim = await message.client.db.getUser(target.id, target.username);

      const now = Date.now();
      if (now - robber.last_rob < config.economy.robCooldown) {
        const timeLeft = config.economy.robCooldown - (now - robber.last_rob);
        const nextRobTime = Math.floor((now + timeLeft) / 1000);
        
        const embed = new EmbedBuilder()
          .setColor('#ffaa00')
          .setTitle('⏰ Cooldown Activo')
          .setDescription(`Podrás robar de nuevo <t:${nextRobTime}:R>`)
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      if (victim.cash < config.economy.robMin) {
        const embed = new EmbedBuilder()
          .setColor('#ffaa00')
          .setTitle('💸 Objetivo Sin Fondos')
          .setDescription(`${target.username} no tiene suficiente efectivo para robar.`)
          .addFields({
            name: '💰 Mínimo requerido',
            value: CurrencyHelper.format(config.economy.robMin),
            inline: false
          })
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

    // Verificar si la víctima tiene protección (spray de pimienta o cámara)
    const victimInventory = victim.inventory || [];
    const protectionItems = victimInventory.filter(item => 
      ['seg001', 'seg002', 'seg008'].includes(item.id) && (item.quantity || 1) > 0
    );
    
    let protectionBonus = 0;
    let protectionUsed = null;
    
    // Buscar el item de protección más fuerte
    if (protectionItems.length > 0) {
      protectionUsed = protectionItems.reduce((strongest, current) => {
        const currentProtection = current.rob_protection || this.getDefaultProtection(current.id);
        const strongestProtection = strongest.rob_protection || this.getDefaultProtection(strongest.id);
        return currentProtection > strongestProtection ? current : strongest;
      });
      
      protectionBonus = protectionUsed.rob_protection || this.getDefaultProtection(protectionUsed.id);
    }
    
    // Verificar si el robber tiene seguro de vida activo
    const subscriptionsCommand = require('./subscripciones');
    const robberInsurance = await subscriptionsCommand.hasActiveRobInsurance(message.author.id);
    
    const adjustedRobChance = Math.max(5, config.economy.robChance - protectionBonus);
    const success = Math.random() * 100 < adjustedRobChance;
    const amount = Math.floor(Math.random() * (Math.min(config.economy.robMax, victim.cash) - config.economy.robMin + 1)) + config.economy.robMin;

    await message.client.db.updateUser(message.author.id, { last_rob: now });

    if (success) {
      await message.client.db.updateUser(message.author.id, {
        cash: robber.cash + amount,
        total_earned: robber.total_earned + amount
      });

      await message.client.db.updateUser(target.id, {
        cash: victim.cash - amount,
        total_spent: victim.total_spent + amount
      });

      await message.client.db.addTransaction(message.author.id, 'rob', amount, `Robado a ${target.username}`);
      await message.client.db.addTransaction(target.id, 'rob', -amount, `Robado por ${message.author.username}`);

      const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('🦹 Robo Exitoso')
        .setDescription(`${message.author.username} robó **${CurrencyHelper.format(amount)}** a ${target.username}!`)
        .addFields(
          { name: '🎯 Víctima', value: `${target.username}\nPérdida: ${CurrencyHelper.format(amount)}`, inline: true },
          { name: '💰 Ladrón', value: `${message.author.username}\nGanancia: ${CurrencyHelper.format(amount)}`, inline: true }
        )
        .setTimestamp();

      message.reply({ embeds: [embed] });
    } else {
      let failureMessage = `¡Te atraparon robando a ${target.username}!`;
      let protectionMessage = '';
      
      // Si falló por protección, usar mensaje especial y remover item
      if (protectionUsed && Math.random() * 100 < protectionBonus) {
        if (protectionUsed.id === 'seg001') { // Spray de pimienta
          failureMessage = `Intentaste robar a ${target.username} pero te atacó con spray de pimienta y saliste corriendo!`;
          protectionMessage = `\n🌶️ **${target.username}** usó su spray de pimienta para defenderse.`;
        } else if (protectionUsed.id === 'seg002') { // Cámara CCTV
          failureMessage = `Intentaste robar a ${target.username} pero las cámaras de seguridad te detectaron!`;
          protectionMessage = `\n📹 **${target.username}** tenía cámaras CCTV instaladas.`;
        } else if (protectionUsed.id === 'seg008') { // Seguratas
          failureMessage = `Intentaste robar a ${target.username} pero los seguratas privados te interceptaron!`;
          protectionMessage = `\n👮 **${target.username}** tenía seguratas privados protegiéndolo.`;
        }
        
        // Remover el item de protección usado
        const updatedInventory = victim.inventory.map(item => {
          if (item.inventory_id === protectionUsed.inventory_id) {
            const newQuantity = (item.quantity || 1) - 1;
            return newQuantity > 0 ? { ...item, quantity: newQuantity } : null;
          }
          return item;
        }).filter(item => item !== null);
        
        await message.client.db.updateUser(target.id, {
          inventory: updatedInventory
        });
      }
      
      const fine = Math.floor(amount * 0.5);
      
      // Aplicar protección del seguro de vida del robber
      let finalFine = fine;
      if (robberInsurance) {
        const reduction = Math.floor(fine * (robberInsurance.rob_protection / 100));
        finalFine = fine - reduction;
        protectionMessage += `\n🛡️ Tu **${robberInsurance.name}** redujo la multa en ${CurrencyHelper.format(reduction)}.`;
      }
      
      await message.client.db.updateUser(message.author.id, {
        cash: Math.max(0, robber.cash - finalFine),
        total_spent: robber.total_spent + finalFine
      });

      await message.client.db.addTransaction(message.author.id, 'rob', -finalFine, 'Multa por robo fallido');

      const embed = new EmbedBuilder()
        .setColor('#ff6b6b')
        .setTitle('👮 Robo Fallido')
        .setDescription(`${failureMessage} Pagaste una multa de **${CurrencyHelper.format(finalFine)}**.${protectionMessage}`)
        .setTimestamp();

      message.reply({ embeds: [embed] });
    }
    } catch (error) {
      await ErrorHandler.handleError(error, message, 'robar');
    }
  },

  getDefaultProtection(itemId) {
    const defaults = {
      'seg001': 15, // Spray de pimienta
      'seg002': 30, // Cámara CCTV
      'seg008': 45  // Seguratas
    };
    return defaults[itemId] || 0;
  }
};