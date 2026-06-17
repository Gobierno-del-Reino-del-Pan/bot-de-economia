const { EmbedBuilder } = require('discord.js');
const CurrencyHelper = require('../utils/currencyHelper');
const ErrorHandler = require('../utils/errorHandler');

module.exports = {
  name: 'dar',
  aliases: ['give', 'pay', 'send', 'enviar'],
  description: 'Envía panedas a otro usuario o dona a una entidad',

  async execute(message, args) {
    try {
      if (message.client.gameManager.isUserInGame(message.author.id)) {
        return ErrorHandler.handleGameActiveError(message);
      }

      if (!args[0] || !args[1]) {
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('❌ Información Incompleta')
          .setDescription('Especifica el usuario y la cantidad a enviar.')
          .addFields({
            name: '💡 Uso correcto',
            value: '`!dar <@usuario> <cantidad>`\n\n**Opciones:** mención, ID, nombre, o entidades (`gobierno`)',
            inline: false
          })
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      const entityName = args[0].toLowerCase();
      if (entityName === 'gobierno') {
        return this.donateToEntidad(message, args[1], 'gobierno');
      }

      let target = message.mentions.users.first();

      if (!target && args[0].match(/^\d+$/)) {
        try {
          target = await message.client.users.fetch(args[0]);
        } catch (err) {}
      }

      if (!target && message.guild) {
        try {
          const members = await message.guild.members.fetch({ query: args[0], limit: 1 });
          if (members && members.size > 0) target = members.first().user;
        } catch (err) {}
      }

      if (!target) {
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('👤 Usuario No Encontrado')
          .setDescription('No pude encontrar al usuario especificado.')
          .addFields({
            name: '💡 Opciones válidas',
            value: '• Mencionar al usuario: `@usuario`\n• ID de Discord\n• Nombre de usuario\n• Entidades: `gobierno`',
            inline: false
          })
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      if (target.id === message.author.id) {
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('🚫 Acción Inválida')
          .setDescription('No puedes enviarte panedas a ti mismo.')
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      if (target.bot) {
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('🤖 Usuario Inválido')
          .setDescription('No puedes enviar panedas a bots.')
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      const sender = await message.client.db.getUser(message.author.id, message.author.username);
      const amount = CurrencyHelper.parseAmount(args[1], sender.cash);

      if (amount === null || amount <= 0) {
        return ErrorHandler.handleInvalidAmountError(message, 'dar');
      }

      if (amount > sender.cash) {
        return ErrorHandler.handleInsufficientFundsError(
          message,
          CurrencyHelper.format(amount),
          CurrencyHelper.format(sender.cash)
        );
      }

      const receiver = await message.client.db.getUser(target.id, target.username);

      await message.client.db.updateUser(message.author.id, {
        cash: sender.cash - amount,
        total_spent: sender.total_spent + amount
      });

      await message.client.db.updateUser(target.id, {
        cash: receiver.cash + amount,
        total_earned: receiver.total_earned + amount
      });

      await message.client.db.addTransaction(message.author.id, 'give', -amount, `Enviado a ${target.username}`);
      await message.client.db.addTransaction(target.id, 'give', amount, `Recibido de ${message.author.username}`);

      if (message.client.antibotDetector) {
        await message.client.antibotDetector.trackUserActivity(
          message.author.id,
          message.author.username,
          'transfer',
          { recipientId: target.id, recipientUsername: target.username, amount }
        );
      }

      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('💸 Transferencia Exitosa')
        .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
        .setDescription(`✅ <@${target.id}> ha recibido tu ${CurrencyHelper.format(amount)}`)
        .setFooter({ text: message.client.user.username });

      await message.reply({ embeds: [embed] });
    } catch (error) {
      await ErrorHandler.handleError(error, message, 'dar');
    }
  },

  async donateToEntidad(message, amountArg, entidadId) {
    try {
      if (!amountArg) {
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('❌ Falta Cantidad')
          .setDescription('Especifica la cantidad a donar.')
          .addFields({
            name: '💡 Uso correcto',
            value: '`!dar gobierno <cantidad>`',
            inline: false
          })
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      const user = await message.client.db.getUser(message.author.id, message.author.username);
      const amount = CurrencyHelper.parseAmount(amountArg, user.cash);

      if (amount === null || amount <= 0) {
        return ErrorHandler.handleInvalidAmountError(message, 'donar');
      }

      if (amount > user.cash) {
        return ErrorHandler.handleInsufficientFundsError(
          message,
          CurrencyHelper.format(amount),
          CurrencyHelper.format(user.cash)
        );
      }

      const entidad = await message.client.db.getEntidad(entidadId);

      if (!entidad) {
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('🏢 Entidad No Encontrada')
          .setDescription('La entidad especificada no existe.')
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      await message.client.db.updateUser(message.author.id, {
        cash: user.cash - amount,
        total_spent: user.total_spent + amount
      });

      await message.client.db.updateEntidad(entidadId, {
        balance: entidad.balance + amount,
        total_earned: entidad.total_earned + amount
      });

      await message.client.db.addTransaction(message.author.id, 'entity_donation', -amount, `Donación a ${entidad.name}`);

      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('🏛️ Donación a Entidad')
        .setDescription(`Has donado **${CurrencyHelper.format(amount)}** a **${entidad.name}**.`)
        .addFields(
          { name: '🏛️ Entidad', value: `${entidad.emoji || '🏛️'} ${entidad.name}`, inline: true },
          { name: '💰 Donación', value: CurrencyHelper.format(amount), inline: true },
          { name: '💼 Tu Balance Restante', value: CurrencyHelper.format(user.cash - amount), inline: true }
        )
        .setFooter({ text: 'Gracias por tu contribución' })
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch (error) {
      await ErrorHandler.handleError(error, message, 'donación entidad');
    }
  }
};