const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('permitwork')
    .setDescription('Permite comandos de trabajo en un canal específico (Solo administradores)')
    .addChannelOption(option =>
      option
        .setName('canal')
        .setDescription('Canal donde permitir los comandos de trabajo (opcional, por defecto canal actual)')
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
      
      if (permitData.workChannels.includes(channel.id)) {
        const embed = new EmbedBuilder()
          .setColor('#ffaa00')
          .setTitle('⚠️ Canal Ya Configurado')
          .setDescription(`El canal ${channel} ya está permitido para comandos de trabajo.`)
          .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      permitData.workChannels.push(channel.id);
      this.savePermitData(permitData);

      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('✅ Canal de Trabajo Permitido')
        .setDescription(`El canal ${channel} ahora permite comandos de trabajo.`)
        .addFields(
          { name: '📝 Canal', value: `${channel}`, inline: true },
          { name: '🔧 Comandos Permitidos', value: '`!trabajar`, `!work`, `!currar`', inline: true },
          { name: '👮 Administrador', value: interaction.user.username, inline: true }
        )
        .setFooter({ text: 'Los usuarios solo podrán trabajar en canales permitidos' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });

    } catch (error) {
      console.error('Error en permitwork:', error);
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