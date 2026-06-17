const { EmbedBuilder } = require('discord.js');
const CurrencyHelper = require('../utils/currencyHelper');
const ErrorHandler = require('../utils/errorHandler');

module.exports = {
  name: 'pagarprestamo',
  aliases: ['pay-loan', 'pagar-prestamo', 'pagar'],
  description: 'Paga todos tus préstamos activos anticipadamente',
  cooldown: 10,
  
  async execute(message, args) {
    try {
      // Verificar si el usuario está en un juego activo
      if (message.client.gameManager.isUserInGame(message.author.id)) {
        return ErrorHandler.handleGameActiveError(message);
      }

      const user = await message.client.db.getUser(message.author.id, message.author.username);
      const activeLoans = await message.client.db.getUserActiveLoans(message.author.id);

      if (activeLoans.length === 0) {
        const embed = new EmbedBuilder()
          .setColor('#00ff00')
          .setTitle('✅ Sin Préstamos')
          .setDescription('No tienes préstamos activos para pagar.')
          .addFields({
            name: '🎉 ¡Felicidades!',
            value: 'Estás libre de deudas.',
            inline: false
          })
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      // Calcular el total a pagar de todos los préstamos
      let totalToPay = 0;
      const loanDetails = [];

      for (const loan of activeLoans) {
        const daysLeft = Math.ceil((new Date(loan.end_date) - new Date()) / (1000 * 60 * 60 * 24));
        const totalPaid = loan.daily_payment * (loan.total_days - daysLeft);
        const remaining = loan.total_amount - totalPaid;
        
        totalToPay += remaining;
        loanDetails.push({
          id: loan.id,
          name: loan.loan_name,
          remaining: remaining,
          lender: loan.lender_id,
          daysLeft: daysLeft
        });
      }

      // Mostrar confirmación antes de proceder
      if (!args[0] || args[0].toLowerCase() !== 'confirmar') {
        const loansList = loanDetails.map(loan => {
          const lenderInfo = loan.lender === 'bot' ? 'Banco' : `<@${loan.lender}>`;
          return `• **${loan.name}**\n  Prestamista: ${lenderInfo}\n  Restante: ${CurrencyHelper.format(loan.remaining)}\n  Días restantes: ${loan.daysLeft}`;
        }).join('\n\n');

        const embed = new EmbedBuilder()
          .setColor('#ffaa00')
          .setTitle('💸 Confirmación de Pago Anticipado')
          .setDescription(`¿Estás seguro de que quieres pagar todos tus préstamos anticipadamente?`)
          .addFields(
            { name: '📋 Préstamos a Pagar', value: loansList, inline: false },
            { name: '💰 Total a Pagar', value: CurrencyHelper.format(totalToPay), inline: true },
            { name: '🏦 Tu Balance Actual', value: `Efectivo: ${CurrencyHelper.format(user.cash)}\nBanco: ${CurrencyHelper.format(user.bank)}`, inline: true },
            { name: '💼 Balance Después del Pago', value: CurrencyHelper.format(user.cash - totalToPay), inline: true }
          )
          .addFields({
            name: '⚠️ Importante',
            value: `• Se descontará de tu **efectivo** primero\n• Si no tienes suficiente efectivo, tu balance quedará **negativo**\n• Todos los préstamos se cancelarán **inmediatamente**\n• Esta acción **no se puede deshacer**`,
            inline: false
          })
          .addFields({
            name: '✅ Para Confirmar',
            value: `Usa: \`!pagarprestamo confirmar\``,
            inline: false
          })
          .setTimestamp();

        return message.reply({ embeds: [embed] });
      }

      // Proceder con el pago
      const newCash = user.cash - totalToPay;

      // Actualizar usuario
      await message.client.db.updateUser(message.author.id, {
        cash: newCash,
        total_spent: user.total_spent + totalToPay
      });

      // Marcar todos los préstamos como completados
      for (const loan of activeLoans) {
        try {
          await message.client.db.pool.execute(
            'UPDATE prestamos SET status = "completed" WHERE id = ?',
            [loan.id]
          );
        } catch (error) {
          console.error(`Error marcando préstamo ${loan.id} como completado:`, error);
        }
      }

      await message.client.db.addTransaction(message.author.id, 'loan_payoff', -totalToPay, `Pago anticipado de ${activeLoans.length} préstamo${activeLoans.length !== 1 ? 's' : ''}`);

      // Crear resumen de préstamos pagados
      const paidLoansList = loanDetails.map(loan => {
        const lenderInfo = loan.lender === 'bot' ? 'Banco' : `<@${loan.lender}>`;
        return `✅ **${loan.name}**\n  Prestamista: ${lenderInfo}\n  Pagado: ${CurrencyHelper.format(loan.remaining)}`;
      }).join('\n\n');

      const embed = new EmbedBuilder()
        .setColor(newCash >= 0 ? '#00ff00' : '#ff6b6b')
        .setTitle('🎉 Préstamos Pagados Exitosamente')
        .setDescription(`¡Has pagado **${activeLoans.length}** préstamo${activeLoans.length !== 1 ? 's' : ''} anticipadamente!`)
        .addFields(
          { name: '💸 Préstamos Cancelados', value: paidLoansList, inline: false },
          { name: '💰 Total Pagado', value: CurrencyHelper.format(totalToPay), inline: true },
          { name: '💵 Nuevo Balance', value: `${CurrencyHelper.format(newCash)} ${newCash < 0 ? '🔴' : '🟢'}`, inline: true },
          { name: '🏦 Balance Bancario', value: CurrencyHelper.format(user.bank), inline: true }
        )
        .setTimestamp();

      if (newCash < 0) {
        embed.addFields({
          name: '⚠️ Balance Negativo',
          value: `Tu balance está en negativo. Trabaja o recolecta para recuperarte.`,
          inline: false
        });
      } else {
        embed.addFields({
          name: '🎊 ¡Felicidades!',
          value: `Ya no tienes deudas pendientes. ¡Eres libre de préstamos!`,
          inline: false
        });
      }

      await message.reply({ embeds: [embed] });

      // Notificar a prestamistas manuales si los hay
      for (const loan of loanDetails) {
        if (loan.lender !== 'bot') {
          try {
            const lender = await message.client.users.fetch(loan.lender);
            if (lender) {
              const dmEmbed = new EmbedBuilder()
                .setColor('#4169e1')
                .setTitle('💰 Préstamo Pagado Anticipadamente')
                .setDescription(`**${message.author.username}** ha pagado anticipadamente el préstamo **${loan.name}**.`)
                .addFields(
                  { name: '👤 Prestatario', value: `<@${message.author.id}>`, inline: true },
                  { name: '💰 Cantidad Pagada', value: CurrencyHelper.format(loan.remaining), inline: true },
                  { name: '📅 Días Restantes', value: `${loan.daysLeft} días`, inline: true }
                )
                .addFields({
                  name: '✅ Estado',
                  value: 'El préstamo ha sido completado exitosamente.',
                  inline: false
                })
                .setTimestamp();

              await lender.send({ embeds: [dmEmbed] });
            }
          } catch (dmError) {
            console.log(`⚠️ No se pudo notificar al prestamista ${loan.lender}`);
          }
        }
      }

    } catch (error) {
      await ErrorHandler.handleError(error, message, 'pagarprestamo');
    }
  }
};