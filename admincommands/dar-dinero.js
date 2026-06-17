const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const CurrencyHelper = require('../utils/currencyHelper');
const config = require('../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dar-dinero')
    .setDescription('Da dinero a un usuario (Solo administradores)')
    .addUserOption(option =>
      option
        .setName('usuario')
        .setDescription('Usuario que recibirá el dinero')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('cantidad')
        .setDescription('Cantidad de dinero a dar')
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
        .setDescription('No puedes dar dinero a bots.')
        .setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    try {
      const user = await interaction.client.db.getUser(target.id, target.username);

      // Actualizar dinero del usuario
      await interaction.client.db.updateUser(target.id, {
        cash: user.cash + amount,
        total_earned: user.total_earned + amount
      });

      await interaction.client.db.addTransaction(target.id, 'admin_give', amount, `Dinero dado por admin: ${interaction.user.username}`);

      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('💰 Dinero Otorgado')
        .setDescription(`Se han otorgado **${CurrencyHelper.format(amount)}** a **${target.username}**.`)
        .addFields(
          { name: '👤 Usuario', value: `<@${target.id}>`, inline: true },
          { name: '💵 Cantidad', value: CurrencyHelper.format(amount), inline: true },
          { name: '💼 Nuevo Balance', value: CurrencyHelper.format(user.cash + amount), inline: true },
          { name: '👮 Administrador', value: interaction.user.username, inline: false }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });

    } catch (error) {
      console.error('Error en dar-dinero:', error);
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