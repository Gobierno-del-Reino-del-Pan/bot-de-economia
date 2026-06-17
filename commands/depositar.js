const { EmbedBuilder } = require('discord.js');
const CurrencyHelper = require('../utils/currencyHelper');
const ErrorHandler = require('../utils/errorHandler');
const config = require('../config.json');

module.exports = {
  name: 'depositar',
  aliases: ['deposit', 'dep'],
  description: 'Deposita panedas en el banco',
  
  async execute(message, args) {
    try {
      // Verificar si el usuario está en un juego activo
      if (message.client.gameManager.isUserInGame(message.author.id)) {
        return ErrorHandler.handleGameActiveError(message);
      }

      const user = await message.client.db.getUser(message.author.id, message.author.username);
      
      if (!args[0]) {
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('❌ Falta Información')
          .setDescription('Especifica la cantidad a depositar.')
          .addFields({
            name: '💡 Opciones válidas',
            value: '• `todo`/`all` - Todo el efectivo\n• `half`/`mitad` - Mitad del efectivo\n• Número específico (ej: 1000)',
            inline: false
          })
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      const amount = CurrencyHelper.parseAmount(args[0], user.cash);
      
      if (amount === null) {
        return ErrorHandler.handleInvalidAmountError(message, 'depositar');
      }

      if (amount === 0) {
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('💸 Sin Efectivo')
          .setDescription('No tienes efectivo para depositar.')
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      if (amount > user.cash) {
        return ErrorHandler.handleInsufficientFundsError(
          message,
          CurrencyHelper.format(amount),
          CurrencyHelper.format(user.cash)
        );
      }

      await message.client.db.updateUser(message.author.id, {
        cash: user.cash - amount,
        bank: user.bank + amount
      });

      await message.client.db.addTransaction(message.author.id, 'deposit', amount, 'Depósito al banco');

      // Rastrear actividad para sistema anti-bot
      if (message.client.antibotDetector) {
        await message.client.antibotDetector.trackUserActivity(
          message.author.id,
          message.author.username,
          'deposit',
          { 
            amount: amount, 
            isAllCash: args[0].toLowerCase() === 'todo' || args[0].toLowerCase() === 'all',
            originalInput: args[0],
            userCashBefore: user.cash
          }
        );
      }

      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('🏦 Depósito Exitoso')
        .setAuthor({
          name: message.author.username,
          iconURL: message.author.displayAvatarURL({ dynamic: true })
        })
        .setDescription(`✅ Depositaste ${CurrencyHelper.format(amount)} en tu banco`)
        .setFooter({ text: message.client.user.username });

      await message.reply({ embeds: [embed] });
    } catch (error) {
      await ErrorHandler.handleError(error, message, 'depositar');
    }
  }
};
