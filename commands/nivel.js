const { EmbedBuilder } = require('discord.js');
const ErrorHandler = require('../utils/errorHandler');

module.exports = {
  name: 'nivel',
  aliases: ['level', 'lvl', 'rank', 'xp'],
  description: 'Muestra tu nivel o el de otro usuario',
  cooldown: 5,

  async execute(message, args) {
    try {
      // Determinar objetivo
      let target = message.member;
      let targetUser = message.author;

      if (args[0]) {
        const mention = message.mentions.members.first();
        if (mention) {
          if (mention.user.bot) {
            return message.reply('❌ Los bots no tienen nivel.');
          }
          target = mention;
          targetUser = mention.user;
        }
      }

      const record = await message.client.db.getUserLevel(targetUser.id, targetUser.username);
      const lm     = message.client.levelManager;

      const currentXp   = lm.xpInCurrentLevel(record.total_xp);
      const neededXp    = lm.xpNeededForNextLevel(record.total_xp);
      const bar         = lm.progressBar(currentXp, neededXp, 14);
      const percentage  = Math.floor((currentXp / neededXp) * 100);

      // Rol actual de nivel
      const levelRoles  = lm.levelRoles.filter(r => r.level <= record.level);
      const currentRole = levelRoles.length > 0 ? levelRoles[levelRoles.length - 1] : null;

      // Siguiente rol
      const nextRole    = lm.levelRoles.find(r => r.level > record.level);

      const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(`📊 Nivel de ${targetUser.username}`)
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
        .addFields(
          {
            name: '🏅 Nivel',
            value: `**${record.level}**`,
            inline: true
          },
          {
            name: '✨ XP Total',
            value: `**${record.total_xp.toLocaleString()}**`,
            inline: true
          },
          {
            name: '💬 Mensajes',
            value: `**${record.messages.toLocaleString()}**`,
            inline: true
          },
          {
            name: `📈 Progreso al nivel ${record.level + 1}`,
            value: `\`${bar}\` **${percentage}%**\n${currentXp.toLocaleString()} / ${neededXp.toLocaleString()} XP`,
            inline: false
          }
        )
        .setFooter({ text: message.client.user.username })
        .setTimestamp();

      if (currentRole) {
        embed.addFields({
          name: '🎖️ Rango actual',
          value: currentRole.roleId !== 'ROLE_ID_AQUI'
            ? `<@&${currentRole.roleId}> ${currentRole.name}`
            : currentRole.name,
          inline: true
        });
      }

      if (nextRole) {
        const levelsLeft = nextRole.level - record.level;
        embed.addFields({
          name: '🎯 Siguiente rango',
          value: `**${nextRole.name}** — nivel ${nextRole.level} (faltan ${levelsLeft} niveles)`,
          inline: true
        });
      }

      await message.reply({ embeds: [embed] });
    } catch (error) {
      await ErrorHandler.handleError(error, message, 'nivel');
    }
  }
};