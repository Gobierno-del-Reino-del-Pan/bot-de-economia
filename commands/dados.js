const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const CurrencyHelper = require('../utils/currencyHelper');
const ErrorHandler = require('../utils/errorHandler');

module.exports = {
  name: 'dados',
  aliases: ['dice', 'roll'],
  description: 'Lanza dados y apuesta por el resultado',
  
  async execute(message, args) {
    try {
      const hasLossProtection = await message.client.db.hasActiveBoost(message.author.id, 'loss_prevention');

      // Verificar si el usuario está en un juego activo
      if (message.client.gameManager.isUserInGame(message.author.id)) {
        return ErrorHandler.handleGameActiveError(message);
      }

      if (!args[0] || !args[1]) {
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('❌ Información Incompleta')
          .setDescription('Especifica la cantidad y el número objetivo.')
          .addFields({
            name: '💡 Uso correcto',
            value: '`!dados <cantidad> <número_objetivo>`\n\n**Cantidad:** `todo`/`all`, `half`, o número específico\n**Número objetivo:** 1-6',
            inline: false
          })
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      const target = parseInt(args[1]);
      if (isNaN(target) || target < 1 || target > 6) {
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('🎲 Número Inválido')
          .setDescription('El número objetivo debe ser entre 1 y 6.')
          .addFields({
            name: '💡 Números válidos',
            value: '1, 2, 3, 4, 5, 6',
            inline: false
          })
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      const user = await message.client.db.getUser(message.author.id, message.author.username);
      const amount = CurrencyHelper.parseAmount(args[0], user.cash);

      if (amount === null) {
        return ErrorHandler.handleInvalidAmountError(message, 'dados');
      }

      if (!CurrencyHelper.validateAmount(amount, config.casino.minBet, config.casino.maxBet)) {
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('💰 Apuesta Inválida')
          .setDescription(`La apuesta debe estar entre **${CurrencyHelper.format(config.casino.minBet)}** y **${CurrencyHelper.format(config.casino.maxBet)}**.`)
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      if (amount > user.cash) {
        return ErrorHandler.handleInsufficientFundsError(
          message,
          CurrencyHelper.format(amount),
          CurrencyHelper.format(user.cash)
        );
      }

      const result = Math.floor(Math.random() * 6) + 1;
      const won = result === target;
      let protectionUsed = false;

      const diceEmojis = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

      // Footer personalizado: nombre del bot + hora
      const now = new Date();
      const hora = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      const footerText = `${message.client.user.username} • hoy a las ${hora}`;

      if (won) {
        const winnings = amount * 6;
        await message.client.db.updateUser(message.author.id, {
          cash: user.cash + winnings - amount,
          total_earned: user.total_earned + winnings
        });

        await message.client.db.addTransaction(message.author.id, 'gamble', winnings - amount, 'Ganancia dados');

        const embed = new EmbedBuilder()
          .setColor('#00ff00')
          .setTitle('🎲 Dados - ¡Ganaste!')
          .setDescription(`El dado cayó en **${result}** ${diceEmojis[result]}`)
          .addFields(
            { name: '🎯 Tu número', value: `${target}`, inline: true },
            { name: '🎲 Resultado', value: `${result}`, inline: true },
            { name: '💰 Ganancia', value: CurrencyHelper.format(winnings - amount), inline: true }
          )
          .setFooter({ text: footerText });

        await message.reply({ embeds: [embed] });
      } else {
        // Verificar seguro de casino
        const subscriptionsCommand = require('./subscripciones');
        const activeInsurance = await subscriptionsCommand.hasActiveInsurance(message.author.id);
        let insuranceRecovery = 0;
        let insuranceMessage = '';
        
        if (activeInsurance) {
          insuranceRecovery = Math.floor(amount * (activeInsurance.coverage / 100));
          insuranceMessage = ` (recuperaste ${CurrencyHelper.format(insuranceRecovery)} gracias a ${activeInsurance.name})`;
          
          await message.client.db.updateUser(message.author.id, {
            total_earned: user.total_earned + insuranceRecovery
          });
          
          await message.client.db.addTransaction(message.author.id, 'insurance', insuranceRecovery, `Cobertura seguro: ${activeInsurance.name}`);
        }
        
        if (hasLossProtection) {
          protectionUsed = true;
          await message.client.db.consumeBoost(message.author.id, 'loss_prevention');
          
          await message.client.db.updateUser(message.author.id, {
            cash: user.cash + amount
          });
        } else {
          await message.client.db.updateUser(message.author.id, {
            cash: user.cash - amount + insuranceRecovery,
            total_spent: user.total_spent + amount
          });
        }

        const transactionAmount = protectionUsed ? 0 : -(amount - insuranceRecovery);
        await message.client.db.addTransaction(message.author.id, 'gamble', transactionAmount, `Pérdida dados${protectionUsed ? ' (Protegido)' : ''}${insuranceMessage}`);

        const embed = new EmbedBuilder()
          .setColor(protectionUsed ? '#ffaa00' : '#ff0000')
          .setTitle(protectionUsed ? '🎲 Dados - Perdiste (Protegido)' : '🎲 Dados - Perdiste')
          .setDescription(`El dado cayó en **${result}** ${diceEmojis[result]}${protectionUsed ? '\n🛡️ **Protección activada!** Tu apuesta fue devuelta.' : ''}${insuranceMessage}`)
          .addFields(
            { name: '🎯 Tu número', value: `${target}`, inline: true },
            { name: '🎲 Resultado', value: `${result}`, inline: true },
            { name: protectionUsed ? '🛡️ Protegido' : '💸 Pérdida', value: protectionUsed ? 'Apuesta devuelta' : CurrencyHelper.format(amount - insuranceRecovery), inline: true }
          )
          .setFooter({ text: footerText });

        await message.reply({ embeds: [embed] });
      }
    } catch (error) {
      await ErrorHandler.handleError(error, message, 'dados');
    }
  }
};
