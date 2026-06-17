const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const ErrorHandler = require('../utils/errorHandler');
const CurrencyHelper = require('../utils/currencyHelper');
const config = require('../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('advertencias')
    .setDescription('Muestra usuarios con advertencias del bot (staff only)')
    .addStringOption(option =>
      option
        .setName('usuario_id')
        .setDescription('ID específico de usuario para ver detalles')
        .setRequired(false)
    ),
  adminOnly: true,

  async execute(interaction) {
    if (!this.hasStaffPermission(interaction.member)) {
      const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('🚫 Sin Permisos')
        .setDescription('No tienes permisos para usar este comando.')
        .addFields({
          name: '⚠️ Requerido',
          value: 'Este comando requiere permisos de administrador o roles de staff específicos.',
          inline: false
        })
        .setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    try {
      const userId = interaction.options.getString('usuario_id');

      // Si se proporciona un ID específico, mostrar detalles de ese usuario
      if (userId) {
        return this.showUserDetails(interaction, userId);
      }

      const { data: rows, error } = await interaction.client.db.supabase
        .from('antibots')
        .select('id, user_id, username, suspicion_score, confidence_level, risk_level, is_verified_human, is_flagged, last_activity, total_works')
        .in('risk_level', ['medium', 'high', 'critical'])
        .order('suspicion_score', { ascending: false })
        .limit(25);

      if (error) {
        console.error('Error obteniendo advertencias:', error);
        const embed = new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('❌ Error de Base de Datos')
          .setDescription('Error obteniendo datos del sistema anti-bot.')
          .addFields({
            name: '🔧 Información Técnica',
            value: 'Problema temporal con la base de datos. Intenta de nuevo en unos momentos.',
            inline: false
          })
          .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (!rows || rows.length === 0) {
        const embed = new EmbedBuilder()
          .setColor('#00ff00')
          .setTitle('✅ Sin Advertencias')
          .setDescription('No hay usuarios con advertencias del sistema anti-bot.')
          .addFields({
            name: '🛡️ Estado del Sistema',
            value: 'Todos los usuarios están dentro de parámetros normales.',
            inline: false
          })
          .setTimestamp();

        return interaction.reply({ embeds: [embed] });
      }

      const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle('⚠️ Advertencias del Sistema Anti-Bot')
        .setDescription(`Se encontraron **${rows.length}** usuario${rows.length !== 1 ? 's' : ''} con comportamiento sospechoso.\n\n**Uso:** \`/advertencias usuario_id:<id>\` para ver detalles específicos`)
        .setTimestamp();

      // Agrupar por nivel de riesgo
      const riskGroups = {
        critical: rows.filter(u => u.risk_level === 'critical'),
        high: rows.filter(u => u.risk_level === 'high'),
        medium: rows.filter(u => u.risk_level === 'medium')
      };

      const riskLabels = {
        critical: '🔴 CRÍTICO',
        high: '🟠 ALTO',
        medium: '🟡 MEDIO'
      };

      for (const [riskLevel, users] of Object.entries(riskGroups)) {
        if (users.length === 0) continue;

        const userList = users.map(user => {
          const lastActivity = new Date(user.last_activity).toLocaleDateString();
          const verifiedStatus = user.is_verified_human ? '✅' : '❌';
          const flaggedStatus = user.is_flagged ? '🚩' : '';

          return `**ID: ${user.id}** | **${user.username}** (<@${user.user_id}>)
Puntuación: ${user.suspicion_score}/100 | Trabajos: ${user.total_works}
${verifiedStatus} ${flaggedStatus} | Última: ${lastActivity}`;
        }).join('\n\n');

        embed.addFields({
          name: `${riskLabels[riskLevel]} (${users.length})`,
          value: userList,
          inline: false
        });
      }

      await interaction.reply({ embeds: [embed] });

    } catch (error) {
      await ErrorHandler.handleError(error, { reply: interaction.reply.bind(interaction) }, 'advertencias');
    }
  },

  async showUserDetails(interaction, userId) {
    try {
      // Buscar por ID de la tabla antibots
      const userRecord = await interaction.client.antibotDetector.getUserById(parseInt(userId));
      
      if (!userRecord) {
        return interaction.reply({ content: '❌ No se encontró un usuario con ese ID en el sistema anti-bot.', ephemeral: true });
      }

      const safe = (value, defaultValue = 0) => {
        const num = Number(value);
        return isNaN(num) ? defaultValue : num;
      };

      const accountAge = userRecord.discord_account_created 
        ? Math.floor((Date.now() - new Date(userRecord.discord_account_created).getTime()) / (1000 * 60 * 60 * 24))
        : 'Desconocida';

      const riskColors = {
        'safe': '#27ae60',
        'low': '#f39c12',
        'medium': '#e67e22',
        'high': '#e74c3c',
        'critical': '#8b0000'
      };

      const embed = new EmbedBuilder()
        .setColor(riskColors[userRecord.risk_level] || '#95a5a6')
        .setTitle(`🔍 Análisis Detallado - ${userRecord.username}`)
        .setDescription(`**Usuario:** <@${userRecord.user_id}> (ID: \`${userRecord.user_id}\`)`)
        .addFields(
          { name: '📊 Puntuación General', value: `**${userRecord.suspicion_score}/100** (${userRecord.confidence_level}% confianza)\n**Nivel:** ${userRecord.risk_level.toUpperCase()}`, inline: true },
          { name: '👤 Información Básica', value: `**Edad cuenta:** ${accountAge} días\n**Verificado:** ${userRecord.is_verified_human ? '✅ Sí' : '❌ No'}\n**Marcado:** ${userRecord.is_flagged ? '🚩 Sí' : '✅ No'}`, inline: true },
          { name: '💼 Actividad Laboral', value: `**Trabajos:** ${userRecord.total_works}\n**Timing perfecto:** ${safe(userRecord.perfect_timing_count, 0)} (${userRecord.total_works > 0 ? ((safe(userRecord.perfect_timing_count, 0) / userRecord.total_works) * 100).toFixed(1) : 0}%)\n**Casi perfecto:** ${safe(userRecord.near_perfect_timing_count, 0)} (${userRecord.total_works > 0 ? ((safe(userRecord.near_perfect_timing_count, 0) / userRecord.total_works) * 100).toFixed(1) : 0}%)\n**Varianza:** ${safe(userRecord.work_variance_score, 50).toFixed(1)}/100\n**Secuencias consistentes:** ${safe(userRecord.consistent_timing_streaks, 0)}`, inline: true }
        )
        .setTimestamp();

      // Análisis de transferencias detallado
      const transferRecipients = userRecord.transfer_recipients || [];
      if (transferRecipients.length > 0) {
        console.log(`📊 MOSTRANDO ${transferRecipients.length} destinatarios de transferencias para usuario ${userRecord.user_id}`);
        
        // Ordenar por cantidad total transferida (mayor a menor)
        const sortedRecipients = transferRecipients
          .sort((a, b) => (b.totalAmountGiven || 0) - (a.totalAmountGiven || 0))
          .slice(0, 10); // Mostrar top 10 para slash command

        const transferList = sortedRecipients.map((recipient, index) => {
          const lastTransferDate = recipient.lastTransfer ? new Date(recipient.lastTransfer).toLocaleDateString() : 'Desconocida';
          const totalAmount = recipient.totalAmountGiven || recipient.totalAmount || 0;
          const transferCount = recipient.transferCount || recipient.count || 0;
          const avgAmount = recipient.avgAmount || (totalAmount > 0 && transferCount > 0 ? Math.round(totalAmount / transferCount) : 0);
          const consistencyScore = recipient.stats?.consistencyScore || 0;
          
          return `**#${index + 1}** → <@${recipient.userId || recipient.id}>
💰 **Total:** ${CurrencyHelper.format(totalAmount)} | **${transferCount} transfers**
📊 **Promedio:** ${CurrencyHelper.format(avgAmount)} | **Consistencia:** ${consistencyScore}%
📅 **Última:** ${lastTransferDate}`;
        }).join('\n\n');

        embed.addFields({
          name: `💸 Top ${Math.min(sortedRecipients.length, 10)} Destinatarios de Transferencias`,
          value: transferList.length > 1024 ? transferList.substring(0, 1020) + '...' : transferList,
          inline: false
        });
      }

      // Estadísticas de depósitos
      if (safe(userRecord.total_deposits, 0) > 0) {
        embed.addFields({
          name: '🏦 Patrones de Depósito',
          value: `**Total depósitos:** ${userRecord.total_deposits}\n**Inmediatos después de trabajar:** ${userRecord.immediate_deposits_after_work}\n**"Dep all" usado:** ${userRecord.deposit_all_pattern_count} veces\n**Puntuación robótica:** ${safe(userRecord.robotic_deposit_score, 0).toFixed(1)}/100`,
          inline: true
        });
      }

      // Actividad social y de voz
      embed.addFields({
        name: '🗣️ Actividad Social',
        value: `**Mensajes:** ${userRecord.total_messages}\n**Canales únicos:** ${userRecord.unique_channels_count}\n**Solo comandos:** ${safe(userRecord.command_only_ratio, 0).toFixed(1)}%\n**Puntuación social:** ${safe(userRecord.social_interaction_score, 0).toFixed(1)}/100`,
        inline: true
      });

      if (safe(userRecord.voice_connections_count, 0) > 0) {
        embed.addFields({
          name: '🎤 Actividad de Voz',
          value: `**Conexiones:** ${userRecord.voice_connections_count}\n**Minutos totales:** ${safe(userRecord.voice_activity_minutes, 0).toFixed(1)}\n**Última actividad:** ${userRecord.last_voice_activity ? new Date(userRecord.last_voice_activity).toLocaleDateString() : 'Nunca'}\n**Puntuación voz:** ${safe(userRecord.voice_verification_score, 0).toFixed(1)}/100`,
          inline: true
        });
      }

      // Recomendación
      embed.addFields({
        name: '🎯 Recomendación',
        value: interaction.client.antibotDetector.getRecommendation(userRecord),
        inline: false
      });

      await interaction.reply({ embeds: [embed] });

    } catch (error) {
      await ErrorHandler.handleError(error, { reply: interaction.reply.bind(interaction) }, 'advertencias detalles');
    }
  },

  hasStaffPermission(member) {
    // Verificar si tiene permisos de administrador
    if (member.permissions.has('Administrator')) {
      return true;
    }
    
    // Verificar roles de staff
    if (config.staffRoles && config.staffRoles.length > 0) {
      return config.staffRoles.some(roleId => member.roles.cache.has(roleId));
    }
    
    return false;
  }
};