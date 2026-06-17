const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const CurrencyHelper = require('../utils/currencyHelper');
const ErrorHandler = require('../utils/errorHandler');

module.exports = {
  name: 'solicitar',
  aliases: ['request-loan', 'pedir-prestamo', 'loan'],
  description: 'Solicita un préstamo del banco',
  cooldown: 10,
  
  async execute(message, args) {
    try {
      // Verificar si el usuario está en un juego activo
      if (message.client.gameManager.isUserInGame(message.author.id)) {
        return ErrorHandler.handleGameActiveError(message);
      }

      if (!args[0]) {
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('❌ Falta Información')
          .setDescription('Especifica el ID del préstamo a solicitar.')
          .addFields({
            name: '💡 Uso correcto',
            value: '`!solicitar <id_prestamo>`\n\nUsa `!prestamos` para ver los préstamos disponibles.\n**Ejemplo:** `!solicitar 1`',
            inline: false
          })
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      const loanId = args[0];
      const user = await message.client.db.getUser(message.author.id, message.author.username);
      const loanTemplate = message.client.db.getLoanTemplate(loanId);

      if (!loanTemplate) {
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('🏦 Préstamo No Encontrado')
          .setDescription('El préstamo especificado no existe.')
          .addFields({
            name: '💡 Consejo',
            value: 'Usa `!prestamos` para ver todos los préstamos disponibles.',
            inline: false
          })
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      // Verificar si ya tiene préstamos activos
      const activeLoans = await message.client.db.getUserActiveLoans(message.author.id);
      if (activeLoans.length >= config.loans.maxActiveLoans) {
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('🚫 Límite de Préstamos')
          .setDescription(`Ya tienes el máximo de préstamos activos permitidos.`)
          .addFields({
            name: '📊 Límite',
            value: `Máximo permitido: ${config.loans.maxActiveLoans} préstamo${config.loans.maxActiveLoans !== 1 ? 's' : ''}`,
            inline: true
          },
          {
            name: '💡 Solución',
            value: 'Paga tus préstamos actuales primero con `!pagarprestamo`.',
            inline: true
          })
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      // Verificar cualificación
      const qualified = this.checkQualification(user, loanTemplate);
      if (!qualified.qualified) {
        const embed = new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Solicitud Denegada')
          .setDescription(`No cumples los requisitos para el **${loanTemplate.name}**.`)
          .addFields(
            { name: '📋 Requisitos', value: qualified.reasons.join('\n'), inline: false },
            { name: '💡 Consejos', value: 'Trabaja más, gana dinero y mejora tu historial crediticio para acceder a mejores préstamos.', inline: false }
          )
          .setTimestamp();

        return message.reply({ embeds: [embed] });
      }

      // Calcular términos del préstamo
      const dailyPayment = this.calculateDailyPayment(loanTemplate.amount, loanTemplate.days);
      const totalPayment = dailyPayment * loanTemplate.days;
      const interestAmount = totalPayment - loanTemplate.amount;

      // Crear préstamo en la base de datos
      const loanData = {
        lender_id: 'bot',
        borrower_id: message.author.id,
        loan_name: loanTemplate.name,
        amount: loanTemplate.amount,
        interest_rate: config.loans.interestRate,
        daily_payment: dailyPayment,
        total_amount: totalPayment,
        total_days: loanTemplate.days,
        start_date: new Date(),
        end_date: new Date(Date.now() + (loanTemplate.days * 24 * 60 * 60 * 1000)),
        status: 'active'
      };

      await message.client.db.createLoan(loanData);

      // Dar el dinero al usuario
      await message.client.db.updateUser(message.author.id, {
        cash: user.cash + loanTemplate.amount,
        total_earned: user.total_earned + loanTemplate.amount
      });

      await message.client.db.addTransaction(message.author.id, 'loan', loanTemplate.amount, `Préstamo: ${loanTemplate.name}`);

      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('✅ Préstamo Aprobado')
        .setDescription(`¡Felicidades! Tu solicitud para **${loanTemplate.name}** ha sido aprobada.`)
        .setThumbnail('https://images.pexels.com/photos/259027/pexels-photo-259027.jpeg?auto=compress&cs=tinysrgb&w=400')
        .addFields(
          { name: '💰 Cantidad Recibida', value: CurrencyHelper.format(loanTemplate.amount), inline: true },
          { name: '📅 Plazo', value: `${loanTemplate.days} días`, inline: true },
          { name: '📈 Tasa de Interés', value: `${config.loans.interestRate}%`, inline: true },
          { name: '💸 Pago Diario', value: CurrencyHelper.format(dailyPayment), inline: true },
          { name: '📊 Total a Pagar', value: CurrencyHelper.format(totalPayment), inline: true },
          { name: '💎 Interés Total', value: CurrencyHelper.format(interestAmount), inline: true }
        )
        .addFields({
          name: '⚠️ Importante',
          value: `• El primer pago se descontará mañana automáticamente\n• Si no tienes suficiente efectivo, tu balance puede quedar en negativo\n• Usa \`!prestamos\` para ver el estado de tus préstamos`,
          inline: false
        })
        .setFooter({ text: `Nuevo balance: ${CurrencyHelper.format(user.cash + loanTemplate.amount)}` })
        .setTimestamp();

      await message.reply({ embeds: [embed] });

    } catch (error) {
      await ErrorHandler.handleError(error, message, 'solicitar');
    }
  },

  checkQualification(user, loanTemplate) {
    const reasons = [];
    let qualified = true;

    // Verificar ganancia mínima total
    if (user.total_earned < loanTemplate.requirements.minTotalEarned) {
      qualified = false;
      reasons.push(`❌ Necesitas haber ganado al menos ${CurrencyHelper.format(loanTemplate.requirements.minTotalEarned)} (tienes ${CurrencyHelper.format(user.total_earned)})`);
    }

    // Verificar ratio de deuda (earned/spent)
    const debtRatio = user.total_spent > 0 ? user.total_earned / user.total_spent : user.total_earned;
    if (debtRatio < loanTemplate.requirements.maxDebtRatio) {
      qualified = false;
      reasons.push(`❌ Tu ratio de ganancias/gastos es muy bajo (${debtRatio.toFixed(2)}, necesitas al menos ${loanTemplate.requirements.maxDebtRatio})`);
    }

    // Verificar si tiene balance negativo
    if (user.cash < 0) {
      qualified = false;
      reasons.push(`❌ Tienes balance negativo (${CurrencyHelper.format(user.cash)})`);
    }

    if (qualified) {
      reasons.push('✅ Cumples todos los requisitos');
    }

    return { qualified, reasons };
  },

  calculateDailyPayment(amount, days, interestRate = 30) {
    // Calcular interés correctamente
    const interestAmount = Math.floor(amount * (interestRate / 100));
    const totalWithInterest = amount + interestAmount;
    return Math.ceil(totalWithInterest / days);
  }
};