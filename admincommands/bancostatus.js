const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const CurrencyHelper = require('../utils/currencyHelper');
const config = require('../config.json');
const ErrorHandler = require('../utils/errorHandler');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bancostatus')
    .setDescription('Muestra el estado financiero de un usuario para préstamos (Solo banqueros)')
    .addUserOption(option =>
      option
        .setName('usuario')
        .setDescription('Usuario para consultar su estado financiero')
        .setRequired(true)
    ),
  adminOnly: true,

  async execute(interaction) {
    if (!this.hasBankerPermission(interaction.member)) {
      const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('🏦 Sin Autorización Bancaria')
        .setDescription('No tienes la autoridad suficiente para consultar estados financieros.')
        .addFields({
          name: '⚠️ Requerido',
          value: 'Este comando requiere roles específicos de banquero configurados por los administradores.',
          inline: false
        })
        .setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const target = interaction.options.getUser('usuario');

    if (target.bot) {
      const embed = new EmbedBuilder()
        .setColor('#ff6b6b')
        .setTitle('🤖 Usuario Inválido')
        .setDescription('No puedes consultar el estado financiero de bots.')
        .setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    try {
      const user = await interaction.client.db.getUser(target.id, target.username);
      const activeLoans = await interaction.client.db.getUserActiveLoans(target.id);

      // Calcular métricas financieras
      const totalWealth = user.cash + user.bank;
      const netWorth = user.total_earned - user.total_spent;
      const debtRatio = user.total_spent > 0 ? user.total_earned / user.total_spent : user.total_earned;
      const creditScore = this.calculateCreditScore(user);

      // Determinar elegibilidad para préstamos
      const isEligible = this.checkLoanEligibility(user, activeLoans.length);
      const maxLoanAmount = this.calculateMaxLoanAmount(user);

      // Información de préstamos activos
      let activeLoansInfo = 'Ninguno';
      let totalDebt = 0;
      
      if (activeLoans.length > 0) {
        const loansList = activeLoans.map(loan => {
          const daysLeft = Math.ceil((new Date(loan.end_date) - new Date()) / (1000 * 60 * 60 * 24));
          const totalPaid = loan.daily_payment * (loan.total_days - daysLeft);
          const remaining = loan.total_amount - totalPaid;
          totalDebt += remaining;
          
          const lenderInfo = loan.lender_id === 'bot' ? 'Banco' : `<@${loan.lender_id}>`;
          
          return `• **${loan.loan_name}**\n  Prestamista: ${lenderInfo}\n  Restante: ${CurrencyHelper.format(remaining)}\n  Días: ${daysLeft}`;
        }).join('\n\n');
        
        activeLoansInfo = loansList;
      }

      const embed = new EmbedBuilder()
        .setColor(isEligible ? '#00ff00' : '#ff6b6b')
        .setTitle(`🏦 Estado Bancario - ${target.username}`)
        .setDescription(`Análisis financiero completo para evaluación de préstamos.`)
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: '💰 Situación Financiera', value: `**Efectivo:** ${CurrencyHelper.format(user.cash)}\n**Banco:** ${CurrencyHelper.format(user.bank)}\n**Total:** ${CurrencyHelper.format(totalWealth)}\n**Valor Neto:** ${CurrencyHelper.format(netWorth)}`, inline: true },
          { name: '📊 Historial Económico', value: `**Total Ganado:** ${CurrencyHelper.format(user.total_earned)}\n**Total Gastado:** ${CurrencyHelper.format(user.total_spent)}\n**Ratio E/G:** ${debtRatio.toFixed(2)}\n**Puntuación:** ${creditScore}/100`, inline: true },
          { name: '🏦 Estado de Préstamos', value: `**Activos:** ${activeLoans.length}/${config.loans.maxActiveLoans}\n**Deuda Total:** ${CurrencyHelper.format(totalDebt)}\n**Elegible:** ${isEligible ? '✅ Sí' : '❌ No'}\n**Máximo Sugerido:** ${CurrencyHelper.format(maxLoanAmount)}`, inline: true }
        )
        .setTimestamp();

      // Mostrar préstamos activos si los hay
      if (activeLoans.length > 0) {
        embed.addFields({
          name: '📋 Préstamos Activos',
          value: activeLoansInfo.length > 1024 ? activeLoansInfo.substring(0, 1020) + '...' : activeLoansInfo,
          inline: false
        });
      }

      // Recomendaciones para el banquero
      const recommendations = this.getRecommendations(user, activeLoans.length, isEligible);
      embed.addFields({
        name: '💡 Recomendaciones para Préstamo',
        value: recommendations,
        inline: false
      });

      // Información adicional
      embed.addFields({
        name: '📈 Análisis de Riesgo',
        value: this.getRiskAnalysis(user, totalDebt, totalWealth),
        inline: false
      });

      embed.setFooter({ text: `Consultado por ${interaction.user.username} | Solo para uso bancario` });

      await interaction.reply({ embeds: [embed] });

    } catch (error) {
      await ErrorHandler.handleError(error, { reply: interaction.reply.bind(interaction) }, 'bancostatus');
    }
  },

  calculateCreditScore(user) {
    let score = 50;

    // Puntuación por ganancias totales
    if (user.total_earned > 100000) score += 30;
    else if (user.total_earned > 50000) score += 20;
    else if (user.total_earned > 20000) score += 10;

    // Puntuación por ratio de deuda
    const debtRatio = user.total_spent > 0 ? user.total_earned / user.total_spent : user.total_earned;
    if (debtRatio < 1.5) score -= 30;
    else if (debtRatio < 2.0) score -= 15;
    else if (debtRatio > 3.0) score += 15;

    // Puntuación por balance actual
    const totalBalance = user.cash + user.bank;
    if (totalBalance > 50000) score += 20;
    else if (totalBalance > 20000) score += 10;
    else if (totalBalance < 0) score -= 25;

    return Math.max(0, Math.min(100, score));
  },

  checkLoanEligibility(user, activeLoansCount) {
    // No puede tener más préstamos del máximo
    if (activeLoansCount >= config.loans.maxActiveLoans) return false;
    
    // No puede tener balance negativo
    if (user.cash < 0) return false;
    
    // Debe tener un mínimo de actividad económica
    if (user.total_earned < 5000) return false;
    
    // Ratio de deuda aceptable
    const debtRatio = user.total_spent > 0 ? user.total_earned / user.total_spent : user.total_earned;
    if (debtRatio < 1.2) return false;
    
    return true;
  },

  calculateMaxLoanAmount(user) {
    const totalWealth = user.cash + user.bank;
    const creditScore = this.calculateCreditScore(user);
    
    // Base del préstamo según riqueza total
    let baseAmount = Math.min(totalWealth * 0.5, user.total_earned * 0.3);
    
    // Ajustar según puntuación crediticia
    const creditMultiplier = creditScore / 100;
    baseAmount *= creditMultiplier;
    
    // Límites mínimos y máximos
    return Math.max(1000, Math.min(100000, Math.floor(baseAmount)));
  },

  getRecommendations(user, activeLoansCount, isEligible) {
    const recommendations = [];
    
    if (!isEligible) {
      if (activeLoansCount >= config.loans.maxActiveLoans) {
        recommendations.push('❌ **No elegible:** Máximo de préstamos activos alcanzado');
      }
      if (user.cash < 0) {
        recommendations.push('❌ **No elegible:** Balance negativo');
      }
      if (user.total_earned < 5000) {
        recommendations.push('❌ **No elegible:** Actividad económica insuficiente');
      }
      
      const debtRatio = user.total_spent > 0 ? user.total_earned / user.total_spent : user.total_earned;
      if (debtRatio < 1.2) {
        recommendations.push('❌ **No elegible:** Ratio de deuda muy alto');
      }
    } else {
      const maxAmount = this.calculateMaxLoanAmount(user);
      const creditScore = this.calculateCreditScore(user);
      
      recommendations.push('✅ **Elegible para préstamos**');
      recommendations.push(`💰 **Cantidad sugerida:** Hasta ${CurrencyHelper.format(maxAmount)}`);
      
      if (creditScore >= 80) {
        recommendations.push('🟢 **Riesgo bajo:** Cliente confiable');
        recommendations.push('📈 **Interés sugerido:** 5-15%');
      } else if (creditScore >= 60) {
        recommendations.push('🟡 **Riesgo medio:** Cliente estable');
        recommendations.push('📈 **Interés sugerido:** 10-20%');
      } else {
        recommendations.push('🟠 **Riesgo alto:** Monitorear de cerca');
        recommendations.push('📈 **Interés sugerido:** 15-25%');
      }
    }
    
    return recommendations.join('\n');
  },

  getRiskAnalysis(user, totalDebt, totalWealth) {
    const analysis = [];
    
    // Análisis de liquidez
    if (user.cash > 10000) {
      analysis.push('💧 **Liquidez:** Excelente');
    } else if (user.cash > 5000) {
      analysis.push('💧 **Liquidez:** Buena');
    } else if (user.cash > 0) {
      analysis.push('💧 **Liquidez:** Regular');
    } else {
      analysis.push('💧 **Liquidez:** Crítica');
    }
    
    // Análisis de solvencia
    const debtToWealthRatio = totalWealth > 0 ? (totalDebt / totalWealth) * 100 : 0;
    if (debtToWealthRatio < 20) {
      analysis.push('🏦 **Solvencia:** Muy sólida');
    } else if (debtToWealthRatio < 50) {
      analysis.push('🏦 **Solvencia:** Sólida');
    } else if (debtToWealthRatio < 80) {
      analysis.push('🏦 **Solvencia:** Moderada');
    } else {
      analysis.push('🏦 **Solvencia:** Riesgosa');
    }
    
    // Análisis de actividad
    if (user.total_earned > 50000) {
      analysis.push('📈 **Actividad:** Muy activo');
    } else if (user.total_earned > 20000) {
      analysis.push('📈 **Actividad:** Activo');
    } else if (user.total_earned > 5000) {
      analysis.push('📈 **Actividad:** Moderado');
    } else {
      analysis.push('📈 **Actividad:** Bajo');
    }
    
    return analysis.join(' | ');
  },

  hasBankerPermission(member) {
    if (!config.bankerRoles || config.bankerRoles.length === 0) {
      return false;
    }
    
    return config.bankerRoles.some(roleId => member.roles.cache.has(roleId));
  }
};