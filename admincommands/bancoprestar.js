const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const CurrencyHelper = require('../utils/currencyHelper');
const config = require('../config.json');
const ErrorHandler = require('../utils/errorHandler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bancoprestar')
    .setDescription('Otorga un préstamo manual a un usuario (Solo banqueros)')
    .addIntegerOption(option =>
      option
        .setName('cantidad')
        .setDescription('Cantidad del préstamo')
        .setRequired(true)
        .setMinValue(1)
    )
    .addUserOption(option =>
      option
        .setName('usuario')
        .setDescription('Usuario que recibirá el préstamo')
        .setRequired(true)
    )
    .addNumberOption(option =>
      option
        .setName('interes')
        .setDescription('Tasa de interés (0-25%)')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(25)
    )
    .addIntegerOption(option =>
      option
        .setName('dias')
        .setDescription('Duración en días (1-365)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(365)
    ),
  adminOnly: true,

  async execute(interaction) {
    if (!this.hasBankerPermission(interaction.member)) {
      const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('🏦 Sin Autorización Bancaria')
        .setDescription('No tienes la autoridad suficiente para otorgar préstamos.')
        .addFields({
          name: '⚠️ Requerido',
          value: 'Este comando requiere roles específicos de banquero configurados por los administradores.',
          inline: false
        })
        .setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const amount = interaction.options.getInteger('cantidad');
    const target = interaction.options.getUser('usuario');
    const interestRate = interaction.options.getNumber('interes');
    const days = interaction.options.getInteger('dias');

    if (target.bot) {
      const embed = new EmbedBuilder()
        .setColor('#ff6b6b')
        .setTitle('🤖 Usuario Inválido')
        .setDescription('No puedes dar préstamos a bots.')
        .setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (target.id === interaction.user.id) {
      const embed = new EmbedBuilder()
        .setColor('#ff6b6b')
        .setTitle('🚫 Acción Inválida')
        .setDescription('No puedes prestarte dinero a ti mismo.')
        .setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    try {
      // Verificar si ya tiene préstamos activos
      const activeLoans = await interaction.client.db.getUserActiveLoans(target.id);
      if (activeLoans.length >= config.loans.maxActiveLoans) {
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('🚫 Límite de Préstamos')
          .setDescription(`${target.username} ya tiene el máximo de préstamos activos permitidos.`)
          .addFields({
            name: '📊 Límite',
            value: `Máximo permitido: ${config.loans.maxActiveLoans} préstamo${config.loans.maxActiveLoans !== 1 ? 's' : ''}`,
            inline: false
          })
          .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      const user = await interaction.client.db.getUser(target.id, target.username);

      // Calcular términos del préstamo
      const dailyPayment = this.calculateDailyPayment(amount, days, interestRate);
      const totalPayment = dailyPayment * days;
      const interestAmount = totalPayment - amount;

      // Crear préstamo en la base de datos
      const loanData = {
        lender_id: interaction.user.id,
        borrower_id: target.id,
        loan_name: `Préstamo Manual - ${interaction.user.username}`,
        amount: amount,
        interest_rate: interestRate,
        daily_payment: dailyPayment,
        total_amount: totalPayment,
        total_days: days,
        start_date: new Date(),
        end_date: new Date(Date.now() + (days * 24 * 60 * 60 * 1000)),
        status: 'active'
      };

      await interaction.client.db.createLoan(loanData);

      // Dar el dinero al usuario
      await interaction.client.db.updateUser(target.id, {
        cash: user.cash + amount,
        total_earned: user.total_earned + amount
      });

      await interaction.client.db.addTransaction(target.id, 'manual_loan', amount, `Préstamo manual de ${interaction.user.username}`);

      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('🏦 Préstamo Manual Otorgado')
        .setDescription(`**${interaction.user.username}** ha otorgado un préstamo a **${target.username}**.`)
        .setThumbnail('https://images.pexels.com/photos/259027/pexels-photo-259027.jpeg?auto=compress&cs=tinysrgb&w=400')
        .addFields(
          { name: '👤 Prestatario', value: `<@${target.id}>`, inline: true },
          { name: '🏦 Prestamista', value: `<@${interaction.user.id}>`, inline: true },
          { name: '💰 Cantidad', value: CurrencyHelper.format(amount), inline: true },
          { name: '📈 Interés', value: `${interestRate}%`, inline: true },
          { name: '📅 Plazo', value: `${days} días`, inline: true },
          { name: '💸 Pago Diario', value: CurrencyHelper.format(dailyPayment), inline: true },
          { name: '📊 Total a Pagar', value: CurrencyHelper.format(totalPayment), inline: true },
          { name: '💎 Interés Total', value: CurrencyHelper.format(interestAmount), inline: true },
          { name: '💼 Nuevo Balance', value: CurrencyHelper.format(user.cash + amount), inline: true }
        )
        .addFields({
          name: '⚠️ Información',
          value: `• El primer pago se descontará mañana automáticamente\n• Los pagos se procesan diariamente\n• El préstamo aparecerá en \`!prestamos\``,
          inline: false
        })
        .setFooter({ text: `Préstamo ID: ${loanData.loan_name}` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });

      // Notificar al usuario que recibió el préstamo
      try {
        const dmEmbed = new EmbedBuilder()
          .setColor('#4169e1')
          .setTitle('🏦 Has Recibido un Préstamo')
          .setDescription(`**${interaction.user.username}** te ha otorgado un préstamo de **${CurrencyHelper.format(amount)}**.`)
          .addFields(
            { name: '💰 Cantidad Recibida', value: CurrencyHelper.format(amount), inline: true },
            { name: '📈 Interés', value: `${interestRate}%`, inline: true },
            { name: '📅 Plazo', value: `${days} días`, inline: true },
            { name: '💸 Pago Diario', value: CurrencyHelper.format(dailyPayment), inline: true },
            { name: '📊 Total a Pagar', value: CurrencyHelper.format(totalPayment), inline: true }
          )
          .addFields({
            name: '⚠️ Importante',
            value: `• Los pagos se descontarán automáticamente cada día\n• Usa \`!prestamos\` para ver el estado\n• Si no tienes efectivo, tu balance puede quedar negativo`,
            inline: false
          })
          .setTimestamp();

        await target.send({ embeds: [dmEmbed] });
      } catch (dmError) {
        console.log(`⚠️ No se pudo enviar DM a ${target.username} sobre el préstamo`);
      }

    } catch (error) {
      await ErrorHandler.handleError(error, { reply: interaction.reply.bind(interaction) }, 'bancoprestar');
    }
  },

  calculateDailyPayment(amount, days, interestRate) {
    // Calcular interés correctamente
    const interestAmount = Math.floor(amount * (interestRate / 100));
    const totalWithInterest = amount + interestAmount;
    return Math.ceil(totalWithInterest / days);
  },

  hasBankerPermission(member) {
    if (!config.bankerRoles || config.bankerRoles.length === 0) {
      return false;
    }
    
    return config.bankerRoles.some(roleId => member.roles.cache.has(roleId));
  }
};