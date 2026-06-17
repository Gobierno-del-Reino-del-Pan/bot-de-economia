const { EmbedBuilder } = require('discord.js');
const CurrencyHelper = require('../utils/currencyHelper');

module.exports = {
  name: 'topcash',
  aliases: ['topefectivo', 'top-cash', 'cash-ranking'],
  description: 'Muestra los usuarios con más dinero en efectivo',
  
  async execute(message, args) {
    try {
      // Obtener top usuarios por efectivo (sin contar banco)
      const { data: rows, error } = await message.client.db.supabase
        .from('users_economy')
        .select('id, username, cash')
        .order('cash', { ascending: false })
        .limit(10);
      
      if (error || !rows || rows.length === 0) {
        const embed = new EmbedBuilder()
          .setColor('#ffaa00')
          .setTitle('📊 Sin Datos')
          .setDescription('No hay usuarios en la base de datos.')
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      const leaderboard = rows.map((user, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `**${index + 1}.**`;
        return `${medal} ${user.username || 'Usuario'} - ${CurrencyHelper.format(user.cash)}`;
      }).join('\n');

      const embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('💰 Top Efectivo - ReinoDelPan')
        .setDescription(leaderboard)
        .addFields({
          name: 'ℹ️ Información',
          value: 'Este ranking muestra solo el **dinero en efectivo**, sin contar el dinero del banco.',
          inline: false
        })
        .setFooter({ text: 'Top 10 usuarios con más efectivo' })
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch (error) {
      const ErrorHandler = require('../utils/errorHandler');
      await ErrorHandler.handleError(error, message, 'topcash');
    }
  }
};