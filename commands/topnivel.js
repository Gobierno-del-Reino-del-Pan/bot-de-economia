const { EmbedBuilder } = require('discord.js');
const ErrorHandler = require('../utils/errorHandler');

module.exports = {
  name: 'topnivel',
  aliases: ['leveltop', 'topxp', 'leaderboard', 'lb'],
  description: 'Top 10 usuarios con más nivel',
  cooldown: 10,

  async execute(message) {
    try {
      const topUsers = await message.client.db.getTopLevels(10);

      if (!topUsers || topUsers.length === 0) {
        return message.reply('❌ Aún no hay usuarios con nivel registrado.');
      }

      const medals = ['🥇', '🥈', '🥉'];
      const lm     = message.client.levelManager;

      const rows = topUsers.map((user, i) => {
        const medal  = medals[i] || `**${i + 1}.**`;
        const bar    = lm.progressBar(
          lm.xpInCurrentLevel(user.total_xp),
          lm.xpNeededForNextLevel(user.total_xp),
          8
        );
        return (
          `${medal} **${user.username}**\n` +
          `┣ Nivel **${user.level}** • ${user.total_xp.toLocaleString()} XP total\n` +
          `┗ \`${bar}\` → Nv. ${user.level + 1}`
        );
      });

      const embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('🏆 Top 10 — Niveles')
        .setDescription(rows.join('\n\n'))
        .setFooter({
          text: `${message.client.user.username} • Usa !nivel @usuario para ver detalles`,
          iconURL: message.client.user.displayAvatarURL()
        })
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch (error) {
      await ErrorHandler.handleError(error, message, 'topnivel');
    }
  }
};