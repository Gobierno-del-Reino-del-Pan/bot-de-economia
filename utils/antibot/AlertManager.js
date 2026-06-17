const { EmbedBuilder, WebhookClient } = require('discord.js');

class AlertManager {
  constructor(webhookUrl, thresholds) {
    this.webhook = webhookUrl ? new WebhookClient({ url: webhookUrl }) : null;
    this.thresholds = thresholds;
  }

  async sendCriticalAlert(userRecord, flags) {
    if (!this.webhook) return;

    try {
      userRecord.is_flagged = true;
      userRecord.alert_sent = true;
      userRecord.manual_review_requested = true;

      const embed = new EmbedBuilder()
        .setColor('#8b0000')
        .setTitle('🚨 ALERTA CRÍTICA: Comportamiento Altamente Sospechoso')
        .setDescription(`**REVISIÓN MANUAL URGENTE REQUERIDA**\n\nUsuario: **${userRecord.username}** (<@${userRecord.user_id}>)`)
        .addFields(
          { name: '📊 Puntuación de Sospecha', value: `${userRecord.suspicion_score.toFixed(1)}/100`, inline: true },
          { name: '🎯 Confianza', value: `${userRecord.confidence_level.toFixed(1)}%`, inline: true },
          { name: '⚠️ Nivel de Riesgo', value: 'CRÍTICO', inline: true },
          { name: '🔍 Factores Detectados', value: flags.join('\n'), inline: false },
          { name: '📈 Análisis Detallado', value: this.formatDetailedStats(userRecord), inline: false },
          { name: '🎯 Recomendación', value: '🔴 **REVISIÓN MANUAL INMEDIATA** - Comportamiento altamente automatizado detectado', inline: false }
        )
        .setFooter({ text: 'Sistema Anti-Bot v3.1 | NO AUTO-BAN - Solo Alertas' })
        .setTimestamp();

      await this.webhook.send({
        content: '@here **🚨 ALERTA CRÍTICA - REVISIÓN MANUAL URGENTE 🚨**',
        embeds: [embed]
      });

      console.log(`🚨 ALERTA CRÍTICA enviada para ${userRecord.username} (${userRecord.suspicion_score.toFixed(1)}/100)`);

    } catch (error) {
      console.error('Error enviando alerta crítica:', error);
    }
  }

  async sendAlert(userRecord, flags) {
    if (!this.webhook) return;

    try {
      userRecord.is_flagged = true;
      userRecord.alert_sent = true;

      const riskColors = {
        'safe': '#27ae60',
        'low': '#f39c12',
        'medium': '#e67e22',
        'high': '#e74c3c',
        'critical': '#8b0000'
      };

      const embed = new EmbedBuilder()
        .setColor(riskColors[userRecord.risk_level])
        .setTitle('⚠️ ALERTA: Comportamiento Sospechoso Detectado')
        .setDescription(`Actividad sospechosa detectada en **${userRecord.username}**.`)
        .addFields(
          { name: '👤 Usuario', value: `<@${userRecord.user_id}>\nID: \`${userRecord.user_id}\``, inline: true },
          { name: '📊 Puntuación', value: `${userRecord.suspicion_score.toFixed(1)}/100`, inline: true },
          { name: '🎯 Confianza', value: `${userRecord.confidence_level.toFixed(1)}%`, inline: true },
          { name: '⚠️ Nivel', value: userRecord.risk_level.toUpperCase(), inline: true },
          { name: '🔍 Factores Detectados', value: flags.join('\n'), inline: false },
          { name: '📈 Análisis Detallado', value: this.formatDetailedStats(userRecord), inline: false },
          { name: '🎯 Recomendación', value: this.getRecommendation(userRecord), inline: false }
        )
        .setFooter({ text: 'Sistema Anti-Bot v3.1 | Solo Alertas - Sin Auto-Ban' })
        .setTimestamp();

      await this.webhook.send({
        content: userRecord.risk_level === 'critical' ? '@here **RIESGO CRÍTICO**' : '@here **USUARIO SOSPECHOSO**',
        embeds: [embed]
      });

    } catch (error) {
      console.error('Error enviando alerta:', error);
    }
  }

  formatDetailedStats(userRecord) {
    const safe = (value, defaultValue = 0) => {
      const num = Number(value);
      return isNaN(num) ? defaultValue : num;
    };

    const accountAge = userRecord.discord_account_created 
      ? Math.floor((Date.now() - new Date(userRecord.discord_account_created).getTime()) / (1000 * 60 * 60 * 24))
      : 'Desconocida';

    const totalWorks = safe(userRecord.total_works, 0);
    const perfectTiming = safe(userRecord.perfect_timing_count, 0);
    const nearPerfectTiming = safe(userRecord.near_perfect_timing_count, 0);
    const workVariance = safe(userRecord.work_variance_score, 50);
    const totalDeposits = safe(userRecord.total_deposits, 0);
    const depositAllCount = safe(userRecord.deposit_all_pattern_count, 0);
    const roboticDepositScore = safe(userRecord.robotic_deposit_score, 0);
    const voiceMinutes = safe(userRecord.voice_activity_minutes, 0);
    const voiceConnections = safe(userRecord.voice_connections_count, 0);
    const socialScore = safe(userRecord.social_interaction_score, 0);
    const channelCount = safe(userRecord.unique_channels_count, 0);

    return `**📊 Estadísticas Completas:**
• **Edad de cuenta:** ${accountAge} días
• **Trabajos:** ${totalWorks} (${perfectTiming} perfectos, ${nearPerfectTiming} casi perfectos)
• **Varianza de trabajo:** ${workVariance.toFixed(1)}/100
• **Depósitos:** ${totalDeposits} (${depositAllCount} "dep all")
• **Puntuación robótica depósitos:** ${roboticDepositScore.toFixed(1)}/100
• **Actividad de voz:** ${voiceConnections} conexiones, ${voiceMinutes.toFixed(1)} min
• **Interacción social:** ${socialScore.toFixed(1)}/100 (${channelCount} canales)
• **Patrones sospechosos:** ${(userRecord.suspicious_patterns || []).length}`;
  }

  getRecommendation(userRecord) {
    const safe = (value, defaultValue = 0) => {
      const num = Number(value);
      return isNaN(num) ? defaultValue : num;
    };

    const voiceScore = safe(userRecord.voice_verification_score, 0);
    const socialScore = safe(userRecord.social_interaction_score, 0);
    const workVariance = safe(userRecord.work_variance_score, 50);
    const suspiciousPatterns = (userRecord.suspicious_patterns || []).length;

    const humanIndicators = [
      voiceScore > 30,
      socialScore > 25,
      workVariance > 40,
      safe(userRecord.unique_channels_count, 0) > 2
    ];

    const humanCount = humanIndicators.filter(Boolean).length;

    switch (userRecord.risk_level) {
      case 'critical':
        return humanCount >= 2 
          ? '🟠 **REVISIÓN MANUAL CUIDADOSA** - Tiene indicadores humanos, analizar detalladamente'
          : '🔴 **BAN MANUAL RECOMENDADO** - Comportamiento claramente automatizado';
      case 'high':
        return humanCount >= 2
          ? '🟡 **MONITOREO INTENSIVO** - Posible falso positivo, observar más tiempo'
          : '🟠 **CONSIDERAR BAN MANUAL** - Revisar y decidir según contexto';
      case 'medium':
        return '🟡 **MONITOREO CONTINUO** - Patrones sospechosos pero no concluyentes';
      case 'low':
        return '🟢 **MONITOREO NORMAL** - Actividad dentro de parámetros normales';
      case 'safe':
        return '✅ **USUARIO VERIFICADO** - Humano confirmado por actividad de voz/social';
      default:
        return '⚪ **SIN CLASIFICAR**';
    }
  }
}

module.exports = AlertManager;