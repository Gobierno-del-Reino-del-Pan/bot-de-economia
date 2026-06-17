const { EmbedBuilder } = require('discord.js');
const CurrencyHelper = require('../utils/currencyHelper');
const ErrorHandler = require('../utils/errorHandler');

module.exports = {
  name: 'gobierno',
  aliases: ['gov', 'tesoreria'],
  description: 'Ver el estado financiero del Gobierno del Reino o donar dinero',

  async execute(message, args) {
    try {
      // Subcomando: dar
      if (args[0] && args[0].toLowerCase() === 'dar') {
        return this.donateToGobierno(message, args.slice(1));
      }

      // Obtener directamente el gobierno (sin caché)
      const gobierno = await message.client.db.getGobierno();

      if (!gobierno) {
        return message.reply('❌ No se pudo obtener la información del Gobierno.');
      }

      const embed = new EmbedBuilder()
        .setColor('#1a3a6b')
        .setTitle(`${gobierno.emoji || '🏛️'} ${gobierno.name}`)
        .setDescription(gobierno.description || 'Entidad gubernamental del Reino del Pan')
        .addFields(
          {
            name: '💰 Balance Actual',
            value: CurrencyHelper.format(gobierno.balance),
            inline: true
          },
          {
            name: '📈 Total Recaudado',
            value: CurrencyHelper.format(gobierno.total_earned),
            inline: true
          },
          {
            name: '📉 Total Retirado',
            value: CurrencyHelper.format(gobierno.total_withdrawn),
            inline: true
          }
        )
        .setFooter({ text: 'Gobierno del Reino del Pan · Transparencia fiscal' })
        .setTimestamp();

      await message.reply({ embeds: [embed] });

    } catch (error) {
      await ErrorHandler.handleError(error, message, 'gobierno');
    }
  },

  async donateToGobierno(message, args) {
    try {
      const user = await message.client.db.getUser(message.author.id, message.author.username);
      let amount = 0;

      if (!args[0]) {
        return message.reply('❌ Debes especificar una cantidad o `all`/`todo` para donar todo tu dinero en efectivo.');
      }

      if (args[0].toLowerCase() === 'all' || args[0].toLowerCase() === 'todo') {
        amount = user.cash;
      } else {
        amount = parseInt(args[0]);
        if (isNaN(amount) || amount <= 0) {
          return message.reply('❌ La cantidad debe ser un número positivo.');
        }
      }

      if (amount === 0) {
        return message.reply('❌ No tienes dinero en efectivo para donar.');
      }

      if (user.cash < amount) {
        return message.reply(`❌ No tienes suficiente dinero. Tienes ${CurrencyHelper.format(user.cash)} en efectivo.`);
      }

      // Descontar del usuario
      await message.client.db.updateUser(message.author.id, {
        cash: user.cash - amount,
        total_spent: user.total_spent + amount
      });

      // Enviar al gobierno
      await message.client.db.addToGobierno(amount);

      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('💰 Donación al Gobierno')
        .setDescription(`Has donado ${CurrencyHelper.format(amount)} al Gobierno del Reino.`)
        .addFields(
          { name: 'Tu Cash restante', value: CurrencyHelper.format(user.cash - amount), inline: true },
          { name: 'Balance del Gobierno', value: 'Usa `!gobierno` para ver el nuevo balance.', inline: true }
        )
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch (error) {
      await ErrorHandler.handleError(error, message, 'gobierno dar');
    }
  }
};