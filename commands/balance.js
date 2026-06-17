const { EmbedBuilder } = require('discord.js');
const CurrencyHelper = require('../utils/currencyHelper');
const ErrorHandler = require('../utils/errorHandler');
const config = require('../config.json');

module.exports = {
  name: 'balance',
  aliases: ['bal', 'money', 'dinero'],
  description: 'Muestra tu dinero actual',
  
  async execute(message, args) {
    try {
      const target = message.mentions.users.first() || message.author;
      const user = await message.client.db.getUser(target.id, target.username);
      
      // Obtener ranking del usuario
      const topUsers = await message.client.db.getTopUsers(100);
      const userRank = topUsers.findIndex(u => u.id === target.id) + 1;

      const embed = new EmbedBuilder()
        .setColor('#4169e1')
        .setTitle(`💰 Balance de ${target.username}`)
        .setDescription(userRank > 0 ? `Rango del top: #${userRank}` : 'No está en el top 100')
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: '💵 Efectivo', value: CurrencyHelper.format(user.cash), inline: true },
          { name: '🏦 Banco', value: CurrencyHelper.format(user.bank), inline: true },
          { name: '💎 Total', value: CurrencyHelper.format(user.cash + user.bank), inline: true }
        )
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch (error) {
      await ErrorHandler.handleError(error, message, 'balance');
    }
  }
};