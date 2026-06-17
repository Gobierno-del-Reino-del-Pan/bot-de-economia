const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const CurrencyHelper = require('../utils/currencyHelper');
const config = require('../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('quitar-dinero')
    .setDescription('Quita dinero a un usuario (Solo administradores)')
    .addUserOption(option =>
      option
        .setName('usuario')
        .setDescription('Usuario al que quitar dinero')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('cantidad')
        .setDescription('Cantidad de dinero a quitar')
        .setRequired(true)
        .setMinValue(1)
    ),
  adminOnly: true,

  async execute(interaction) {
    // Verificar permisos de administrador
    if (!this.hasAdminPermission(interaction.member)) {
      const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('🚫 Sin Permisos de Administrador')
        .setDescription('No tienes permisos para usar este comando.')
        .addFields({
          name: '⚠️ Requerido',
          value: 'Este comando requiere permisos de administrador del servidor.',
          inline: false
        })
        .setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const target = interaction.options.getUser('usuario');
    const amount = interaction.options.getInteger('cantidad');

    if (target.bot) {
      const embed = new EmbedBuilder()
        .setColor('#ff6b6b')
        .setTitle('🤖 Usuario Inválido')
        .setDescription('No puedes quitar dinero a bots.')
        .setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    try {
      const user = await interaction.client.db.getUser(target.id, target.username);

      // Quitar dinero (puede quedar en negativo)
      const newCash = user.cash - amount;
      
      await interaction.client.db.updateUser(target.id, {
        cash: newCash,
        total_spent: user.total_spent + amount
      });

      await interaction.client.db.addTransaction(target.id, 'admin_remove', -amount, `Dinero quitado por admin: ${interaction.user.username}`);

      const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('💸 Dinero Retirado')
        .setDescription(`Se han retirado **${CurrencyHelper.format(amount)}** de **${target.username}**.`)
        .addFields(
          { name: '👤 Usuario', value: `<@${target.id}>`, inline: true },
          { name: '💵 Cantidad Retirada', value: CurrencyHelper.format(amount), inline: true },
          { name: '💼 Nuevo Balance', value: `${CurrencyHelper.format(newCash)} ${newCash < 0 ? '🔴' : '🟢'}`, inline: true },
          { name: '👮 Administrador', value: interaction.user.username, inline: false }
        )
        .setTimestamp();

      if (newCash < 0) {
        embed.addFields({
          name: '⚠️ Advertencia',
          value: 'El usuario ahora tiene balance negativo.',
          inline: false
        });
      }

      await interaction.reply({ embeds: [embed] });

    } catch (error) {
      console.error('Error en quitar-dinero:', error);
      const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('❌ Error de Transacción')
        .setDescription('Error al procesar la transacción.')
        .addFields({
          name: '🔧 Información Técnica',
          value: 'Problema temporal con la base de datos. Intenta de nuevo.',
          inline: false
        })
        .setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },

  hasAdminPermission(member) {
    return member.permissions.has('Administrator');
  }
};