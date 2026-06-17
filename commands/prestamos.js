const { EmbedBuilder } = require('discord.js');
const CurrencyHelper = require('../utils/currencyHelper');
const ErrorHandler = require('../utils/errorHandler');

module.exports = {
  name: 'prestamos',
  aliases: ['loans', 'loan', 'prestamo'],
  description: 'Muestra los préstamos disponibles y tu estado actual',
  
  async execute(message, args) {
    try {
      const user = await message.client.db.getUser(message.author.id, message.author.username);
      const loans = message.client.db.getAvailableLoans();
      const activeLoans = await message.client.db.getUserActiveLoans(message.author.id);

      const embed = new EmbedBuilder()
        .setColor('#4169e1')
        .setTitle('Préstamos - Reino del Pan')
        .setDescription('Solicita préstamos para impulsar tu economía.*')
        .setThumbnail('https://images.pexels.com/photos/259027/pexels-photo-259027.jpeg?auto=compress&cs=tinysrgb&w=400')
        .setTimestamp();

      // 📌 Préstamos disponibles
      if (loans.length > 0) {
        const loansList = loans.map(loan => {
          const dailyPayment = this.calculateDailyPayment(loan.amount, loan.days);
          const totalPayment = dailyPayment * loan.days;
          const qualified = this.checkQualification(user, loan);

          return `**${loan.emoji} ${loan.name}** (ID: \`${loan.id}\`)
Monto: ${CurrencyHelper.format(loan.amount)}
Plazo: ${loan.days} días
Pago diario: ${CurrencyHelper.format(dailyPayment)}
Total a pagar: ${CurrencyHelper.format(totalPayment)}
Estado: ${qualified ? '✅ Cualificado' : '❌ No cualificado'}`;
        }).join('\n\n');

        embed.addFields({
          name: 'Préstamos Disponibles',
          value: loansList,
          inline: false
        });
      }

      // 📌 Préstamos activos
      if (activeLoans.length > 0) {
        const activeLoansList = activeLoans.map(loan => {
          const daysLeft = Math.ceil((new Date(loan.end_date) - new Date()) / (1000 * 60 * 60 * 24));
          const totalPaid = loan.daily_payment * (loan.total_days - daysLeft);
          const remaining = loan.total_amount - totalPaid;
          
          const lenderInfo = loan.lender_id === 'bot' ? 'Banco' : `Prestamista: <@${loan.lender_id}>`;
          
          return `**${loan.loan_name}**
${lenderInfo}
Restante: ${CurrencyHelper.format(remaining)}
Días restantes: ${daysLeft}
Pago diario: ${CurrencyHelper.format(loan.daily_payment)}`;
        }).join('\n\n');

        embed.addFields({
          name: '📌 Tus Préstamos Activos',
          value: activeLoansList,
          inline: false
        });
      }

      // 📌 Información del usuario
      const debtRatio = user.total_spent > 0 ? user.total_earned / user.total_spent : user.total_earned;
      const creditScore = this.calculateCreditScore(user);

      embed.addFields(
        { name: '📊 Tu Perfil Crediticio', value: `Puntuación: **${creditScore}/100**\nRatio E/G: **${debtRatio.toFixed(2)}**`, inline: true },
        { name: '💰 Tu Balance', value: `Efectivo: **${CurrencyHelper.format(user.cash)}**\nBanco: **${CurrencyHelper.format(user.bank)}**`, inline: true },
        { name: '💡 Comandos Disponibles', value: '• `!solicitar <id>` - Solicitar un préstamo\n• `!pagarprestamo` - Pagar todos tus préstamos anticipadamente', inline: false }

      );

      await message.reply({ embeds: [embed] });

    } catch (error) {
      await ErrorHandler.handleError(error, message, 'prestamos');
    }
  },

  calculateDailyPayment(amount, days, interestRate = 30) {
    // Calcular interés correctamente
    const interestAmount = Math.floor(amount * (interestRate / 100));
    const totalWithInterest = amount + interestAmount;
    return Math.ceil(totalWithInterest / days);
  },

  checkQualification(user, loan) {
    if (user.total_earned < loan.requirements.minTotalEarned) return false;

    const debtRatio = user.total_spent > 0 ? user.total_earned / user.total_spent : user.total_earned;
    if (debtRatio < loan.requirements.maxDebtRatio) return false;

    return true;
  },

  calculateCreditScore(user) {
    let score = 50;

    if (user.total_earned > 100000) score += 30;
    else if (user.total_earned > 50000) score += 20;
    else if (user.total_earned > 20000) score += 10;

    const debtRatio = user.total_spent > 0 ? user.total_earned / user.total_spent : user.total_earned;
    if (debtRatio < 1.5) score -= 30;
    else if (debtRatio < 2.0) score -= 15;

    const totalBalance = user.cash + user.bank;
    if (totalBalance > 50000) score += 20;
    else if (totalBalance > 20000) score += 10;

    return Math.max(0, Math.min(100, score));
  }
};
