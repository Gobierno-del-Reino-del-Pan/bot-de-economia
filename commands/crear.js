const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ErrorHandler = require('../utils/errorHandler');

module.exports = {
  name: 'crear',
  aliases: ['create'],
  description: 'Crear una nueva entidad/empresa',

  async execute(message, args) {
    try {
      if (!args[0]) {
        const embed = new EmbedBuilder()
          .setColor('#4169e1')
          .setTitle('Crear Entidad/Empresa')
          .setDescription('Selecciona qué tipo de entidad deseas crear.')
          .addFields({
            name: 'Opciones disponibles',
            value: '• `!crear entidad` - Crear una nueva empresa',
            inline: false
          })
          .setTimestamp();

        return message.reply({ embeds: [embed] });
      }

      const tipo = args[0].toLowerCase();

      if (tipo === 'entidad' || tipo === 'empresa') {
        return this.crearEntidad(message);
      }

      const embed = new EmbedBuilder()
        .setColor('#ff6b6b')
        .setTitle('Opción no válida')
        .setDescription('Usa `!crear entidad` para crear una nueva empresa.')
        .setTimestamp();

      return message.reply({ embeds: [embed] });

    } catch (error) {
      await ErrorHandler.handleError(error, message, 'crear');
    }
  },

  async crearEntidad(message) {
    const embed = new EmbedBuilder()
      .setColor('#4169e1')
      .setTitle('Creación de Entidad')
      .setDescription('Para crear una nueva entidad/empresa, debes tramitar la solicitud en el portal oficial.')
      .addFields({
        name: 'Portal de Trámites',
        value: 'Haz clic en el botón de abajo para acceder al formulario de creación.',
        inline: false
      })
      .addFields({
        name: 'Requisitos',
        value: '• Nombre de la entidad\n• Descripción\n• Documentación requerida',
        inline: false
      })
      .setTimestamp();

    const button = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setLabel('Ir al Portal de Trámites')
          .setStyle(ButtonStyle.Link)
          .setURL('https://mineco.duckdns.org/lpb/tramites/crear-empresa')
          .setEmoji('📝')
      );

    return message.reply({ embeds: [embed], components: [button] });
  }
};
