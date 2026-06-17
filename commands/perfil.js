const { EmbedBuilder } = require('discord.js');
const CurrencyHelper = require('../utils/currencyHelper');
const ErrorHandler = require('../utils/errorHandler');

module.exports = {
  name: 'perfil',
  aliases: ['profile', 'stats'],
  description: 'Muestra el perfil económico de un usuario',
  
  async execute(message, args) {
    try {
      const target = message.mentions.users.first() || message.author;
      const user = await message.client.db.getUser(target.id, target.username);

      const totalWealth = user.cash + user.bank;
      const netWorth = user.total_earned - user.total_spent;

      const embed = new EmbedBuilder()
        .setColor('#4169e1')
        .setTitle(`📊 Perfil de ${target.username}`)
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: '💵 Efectivo', value: CurrencyHelper.format(user.cash), inline: true },
          { name: '🏦 Banco', value: CurrencyHelper.format(user.bank), inline: true },
          { name: '💎 Total', value: CurrencyHelper.format(totalWealth), inline: true },
          { name: '📈 Ganado Total', value: CurrencyHelper.format(user.total_earned), inline: true },
          { name: '📉 Gastado Total', value: CurrencyHelper.format(user.total_spent), inline: true },
          { name: '💰 Valor Neto', value: CurrencyHelper.format(netWorth), inline: true }
        )
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch (error) {
      await ErrorHandler.handleError(error, message, 'perfil');
    }
  }
};