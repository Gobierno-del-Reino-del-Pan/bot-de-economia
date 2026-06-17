const { EmbedBuilder } = require('discord.js');
const CurrencyHelper = require('./currencyHelper');

// =============================================
// Sistema de Xprestamos
// =============================================

class LoanProcessor {
  constructor(client) {
    this.client = client;
    this.isProcessing = false;
  }

  async processDailyPayments() {
    if (this.isProcessing) {
      console.log('⚠️ Ya se están procesando pagos de préstamos');
      return;
    }

    this.isProcessing = true;
    console.log('🏦 Iniciando procesamiento de pagos diarios de préstamos...');

    try {
      const activeLoans = await this.client.db.getAllActiveLoans();
      
      if (activeLoans.length === 0) {
        console.log('ℹ️ No hay préstamos activos para procesar');
        this.isProcessing = false;
        return;
      }

      for (const loan of activeLoans) {
        try {
          const newBalance = await this.client.db.processLoanPayment(
            loan.id,
            loan.borrower_id,
            loan.daily_payment
          );

          // Notificar al usuario sobre el pago
          await this.notifyLoanPayment(loan, newBalance);

        } catch (error) {
          console.error(`❌ Error procesando préstamo ${loan.id}:`, error);
        }
      }

      console.log(`✅ Procesados ${activeLoans.length} pagos de préstamos`);
    } catch (error) {
      console.error('❌ Error en procesamiento de préstamos:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  async notifyLoanPayment(loan, newBalance) {
    try {
      const user = await this.client.users.fetch(loan.borrower_id);
      if (!user) return;

      const daysLeft = Math.ceil((new Date(loan.end_date) - new Date()) / (1000 * 60 * 60 * 24));
      const isCompleted = daysLeft <= 0;

      let embed;

      if (isCompleted) {
        embed = new EmbedBuilder()
          .setColor('#00ff00')
          .setTitle('🎉 Préstamo Completado')
          .setDescription(`¡Felicidades! Has completado el pago de tu **${loan.loan_name}**.`)
          .addFields(
            { name: '💰 Último Pago', value: CurrencyHelper.format(loan.daily_payment), inline: true },
            { name: '💵 Balance Actual', value: CurrencyHelper.format(newBalance), inline: true },
            { name: '🏆 Estado', value: 'Préstamo Completado', inline: true }
          )
          .setTimestamp();
      } else {
        const balanceStatus = newBalance < 0 ? '🔴 Negativo' : '🟢 Positivo';
        
        embed = new EmbedBuilder()
          .setColor(newBalance < 0 ? '#ff6b6b' : '#4169e1')
          .setTitle('💸 Pago de Préstamo Procesado')
          .setDescription(`Se ha descontado el pago diario de tu **${loan.loan_name}**.`)
          .addFields(
            { name: '💰 Pago Diario', value: CurrencyHelper.format(loan.daily_payment), inline: true },
            { name: '📅 Días Restantes', value: `${daysLeft} días`, inline: true },
            { name: '💵 Balance Actual', value: `${CurrencyHelper.format(newBalance)} ${balanceStatus}`, inline: true }
          )
          .setFooter({ text: newBalance < 0 ? 'Tu balance está en negativo. Trabaja para recuperarte.' : 'Usa !prestamos para ver el estado completo' })
          .setTimestamp();
      }

      // Intentar enviar DM al usuario
      try {
        await user.send({ embeds: [embed] });
      } catch (dmError) {
        console.log(`⚠️ No se pudo enviar DM a ${user.username} sobre pago de préstamo`);
      }

    } catch (error) {
      console.error('Error notificando pago de préstamo:', error);
    }
  }

  calculateDailyPayment(amount, days, interestRate = 30) {
    // Calcular interés correctamente
    const interestAmount = Math.floor(amount * (interestRate / 100));
    const totalWithInterest = amount + interestAmount;
    return Math.ceil(totalWithInterest / days);
  }

  startDailyProcessor() {
    // Procesar pagos cada 24 horas (86400000 ms)
    // Para testing, puedes cambiar a 60000 (1 minuto)
    const interval = 86400000; // 24 horas
    
    setInterval(() => {
      this.processDailyPayments();
    }, interval);

    console.log('🕐 Procesador de préstamos diarios iniciado');
  }
}

module.exports = LoanProcessor;