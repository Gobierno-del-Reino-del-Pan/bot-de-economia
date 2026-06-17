const { EmbedBuilder } = require('discord.js');
const CurrencyHelper = require('../utils/currencyHelper');

module.exports = {
  name: 'ranking',
  aliases: ['leaderboard', 'lb', 'top', 'rich'],
  description: 'Muestra los usuarios más ricos',
  
  async execute(message, args) {
    try {
      const topUsers = await message.client.db.getTopUsers();
      
      if (topUsers.length === 0) {
        const embed = new EmbedBuilder()
          .setColor('#ffaa00')
          .setTitle('📊 Sin Datos')
          .setDescription('Nadie ha chambeado todavía')
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      const leaderboard = topUsers.map((user, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `**${index + 1}.**`;
        return `${medal} ${user.username || 'Usuario'} - ${CurrencyHelper.format(user.total)}`;
      }).join('\n');

      const embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('🏆 Ranking - ReinoDelPan')
        .setDescription(leaderboard)
        .setFooter({ text: 'Top 10 usuarios más ricos' })
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch (error) {
      const ErrorHandler = require('../utils/errorHandler');
      await ErrorHandler.handleError(error, message, 'ranking');
    }
  }
};