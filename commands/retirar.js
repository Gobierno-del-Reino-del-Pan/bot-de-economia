const { EmbedBuilder } = require('discord.js');
const CurrencyHelper = require('../utils/currencyHelper');
const ErrorHandler = require('../utils/errorHandler');
const config = require('../config.json');

module.exports = {
  name: 'retirar',
  aliases: ['withdraw', 'with'],
  description: 'Retira panedas del banco',
  
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
          .setDescription('Especifica la cantidad a retirar.')
          .addFields({
            name: '💡 Opciones válidas',
            value: '• `todo`/`all` - Todo del banco\n• `half`/`mitad` - Mitad del banco\n• Número específico (ej: 1000)',
            inline: false
          })
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      const amount = CurrencyHelper.parseAmount(args[0], user.bank, user.bank);
      
      if (amount === null) {
        return ErrorHandler.handleInvalidAmountError(message, 'retirar');
      }

      if (amount === 0) {
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('🏦 Banco Vacío')
          .setDescription('No tienes panedas en el banco para retirar.')
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      if (amount > user.bank) {
        return ErrorHandler.handleInsufficientFundsError(
          message,
          CurrencyHelper.format(amount),
          `${CurrencyHelper.format(user.bank)} (banco)`
        );
      }

      // Actualizar balances
      await message.client.db.updateUser(message.author.id, {
        cash: user.cash + amount,
        bank: user.bank - amount
      });

      await message.client.db.addTransaction(message.author.id, 'withdraw', amount, 'Retiro del banco');

      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('💵 Retiro Exitoso')
        .setAuthor({
          name: message.author.username,
          iconURL: message.author.displayAvatarURL({ dynamic: true })
        })
        .setDescription(`✅ Retiraste ${CurrencyHelper.format(amount)} de tu banco`)
        .setFooter({ text: message.client.user.username });

      await message.reply({ embeds: [embed] });
    } catch (error) {
      await ErrorHandler.handleError(error, message, 'retirar');
    }
  }
};
