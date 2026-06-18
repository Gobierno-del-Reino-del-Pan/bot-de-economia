const { EmbedBuilder } = require('discord.js');
const CurrencyHelper = require('../utils/currencyHelper');
const ErrorHandler = require('../utils/errorHandler');

module.exports = {
  name: 'dar',
  aliases: ['give', 'pay', 'send', 'enviar'],
  description: 'Envía panedas a otro usuario (con mención) o dona a una empresa/gobierno',

  async execute(message, args) {
    try {
      if (message.client.gameManager.isUserInGame(message.author.id)) {
        return ErrorHandler.handleGameActiveError(message);
      }

      if (!args[0] || !args[1]) {
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('❌ Información Incompleta')
          .setDescription('Especifica el destino y la cantidad.')
          .addFields({
            name: '💡 Uso correcto',
            value: '`!dar <@usuario|gobierno|nombre_empresa> <cantidad>`',
            inline: false
          })
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      const targetArg = args[0];
      const amountArg = args[1];

      // 1. Verificar si es mención a usuario
      const mention = message.mentions.users.first();
      if (mention) {
        return this.transferToUser(message, mention, amountArg);
      }

      // 2. Verificar si es "gobierno"
      if (targetArg.toLowerCase() === 'gobierno') {
        return this.donateToGobierno(message, amountArg);
      }

      // 3. Buscar empresa por nombre (exacto, ignorando mayúsculas)
      const empresas = await message.client.db.getAllEmpresas();
      const empresa = empresas.find(e => e.name.toLowerCase() === targetArg.toLowerCase());
      if (empresa) {
        return this.donateToEmpresa(message, amountArg, empresa);
      }

      // 4. No se encontró nada
      const embed = new EmbedBuilder()
        .setColor('#ff6b6b')
        .setTitle('Destino No Encontrado')
        .setDescription(`No encontré un usuario (mencionado), ni la empresa "${targetArg}", ni el gobierno.`)
        .addFields({
          name: '💡 Opciones válidas',
          value: '• Mencionar a un usuario: `@usuario`\n• `gobierno`\n• Nombre exacto de una empresa registrada',
          inline: false
        })
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    } catch (error) {
      await ErrorHandler.handleError(error, message, 'dar');
    }
  },

  // Transferencia a usuario (solo por mención)
  async transferToUser(message, target, amountArg) {
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
    const amount = CurrencyHelper.parseAmount(amountArg, sender.cash);

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
  },

  // Donación a gobierno
  async donateToGobierno(message, amountArg) {
    try {
      if (!amountArg) {
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('❌ Falta Cantidad')
          .setDescription('Especifica la cantidad a donar al gobierno.')
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

      // Obtener gobierno (para mostrar nombre/emoji)
      const gobierno = await message.client.db.getGobierno();
      if (!gobierno) {
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('🏛️ Gobierno No Disponible')
          .setDescription('No se pudo obtener la cuenta del gobierno.')
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      // Descontar del usuario
      await message.client.db.updateUser(message.author.id, {
        cash: user.cash - amount,
        total_spent: user.total_spent + amount
      });

      // Añadir al gobierno
      await message.client.db.addToGobierno(amount);

      await message.client.db.addTransaction(message.author.id, 'gobierno_donation', -amount, `Donación al gobierno`);

      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('🏛️ Donación al Gobierno')
        .setDescription(`Has donado **${CurrencyHelper.format(amount)}** al Gobierno del Reino.`)
        .addFields(
          { name: '🏛️ Entidad', value: `${gobierno.emoji || '🏛️'} ${gobierno.name || 'Gobierno'}`, inline: true },
          { name: '💰 Donación', value: CurrencyHelper.format(amount), inline: true },
          { name: '💼 Tu Balance Restante', value: CurrencyHelper.format(user.cash - amount), inline: true }
        )
        .setFooter({ text: 'Gracias por tu contribución' })
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch (error) {
      await ErrorHandler.handleError(error, message, 'donación gobierno');
    }
  },

  // Donación a empresa
  async donateToEmpresa(message, amountArg, empresa) {
    try {
      if (!amountArg) {
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('❌ Falta Cantidad')
          .setDescription(`Especifica la cantidad a donar a ${empresa.name}.`)
          .addFields({
            name: '💡 Uso correcto',
            value: `\`!dar ${empresa.name} <cantidad>\``,
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

      // Descontar del usuario
      await message.client.db.updateUser(message.author.id, {
        cash: user.cash - amount,
        total_spent: user.total_spent + amount
      });

      // Añadir a la empresa (usando el balance actual + amount)
      const nuevoBalance = (empresa.balance || 0) + amount;
      await message.client.db.updateEmpresa(empresa.id, {
        balance: nuevoBalance
      });

      await message.client.db.addTransaction(
        message.author.id,
        'company_donation',
        -amount,
        `Donación a ${empresa.name}`
      );

      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('🏢 Donación a Empresa')
        .setDescription(`Has donado **${CurrencyHelper.format(amount)}** a **${empresa.name}**.`)
        .addFields(
          { name: '🏢 Empresa', value: `${empresa.emoji || '🏢'} ${empresa.name}`, inline: true },
          { name: '💰 Donación', value: CurrencyHelper.format(amount), inline: true },
          { name: '💼 Tu Balance Restante', value: CurrencyHelper.format(user.cash - amount), inline: true }
        )
        .setFooter({ text: 'Gracias por tu contribución' })
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch (error) {
      await ErrorHandler.handleError(error, message, 'donación empresa');
    }
  }
};