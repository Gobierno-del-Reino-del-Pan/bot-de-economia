const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('denegarcasino')
    .setDescription('Deniega comandos de casino en un canal específico (Solo administradores)')
    .addChannelOption(option =>
      option
        .setName('canal')
        .setDescription('Canal donde denegar los comandos de casino (opcional, por defecto canal actual)')
        .setRequired(false)
    ),
  adminOnly: true,

  async execute(interaction) {
    if (!this.hasAdminPermission(interaction.member)) {
      const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('🚫 Sin Permisos de Administrador')
        .setDescription('No tienes la autoridad suficiente para usar este comando.')
        .addFields({
          name: '⚠️ Requerido',
          value: 'Este comando requiere permisos de administrador del servidor.',
          inline: false
        })
        .setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const channel = interaction.options.getChannel('canal') || interaction.channel;

    try {
      const permitData = this.loadPermitData();
      
      if (!permitData.casinoChannels.includes(channel.id)) {
        const embed = new EmbedBuilder()
          .setColor('#ffaa00')
          .setTitle('⚠️ Canal No Configurado')
          .setDescription(`El canal ${channel} no está en la lista de canales permitidos para casino.`)
          .addFields({
            name: '💡 Información',
            value: 'Solo puedes denegar canales que previamente fueron permitidos.',
            inline: false
          })
          .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      permitData.casinoChannels = permitData.casinoChannels.filter(id => id !== channel.id);
      this.savePermitData(permitData);

      const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('🚫 Canal de Casino Denegado')
        .setDescription(`El canal ${channel} ya no permite comandos de casino.`)
        .addFields(
          { name: '📝 Canal', value: `${channel}`, inline: true },
          { name: '🚫 Comandos Bloqueados', value: '`!ruleta`, `!blackjack`, `!tragaperras`, `!dados`, `!carrera`', inline: true },
          { name: '👮 Administrador', value: interaction.user.username, inline: true }
        )
        .setFooter({ text: 'Los comandos de casino no funcionarán en este canal' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });

    } catch (error) {
      console.error('Error en denegarcasino:', error);
      const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('❌ Error del Sistema')
        .setDescription('Error al procesar el comando.')
        .addFields({
          name: '🔧 Información Técnica',
          value: 'Problema temporal. Intenta de nuevo en unos momentos.',
          inline: false
        })
        .setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },

  loadPermitData() {
    try {
      const filePath = path.join(__dirname, '../data/permitchannels.json');
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return { workChannels: [], casinoChannels: [] };
    }
  },

  savePermitData(data) {
    try {
      const filePath = path.join(__dirname, '../data/permitchannels.json');
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error guardando permitchannels.json:', error);
    }
  },

  hasAdminPermission(member) {
    return member.permissions.has('Administrator');
  }
};