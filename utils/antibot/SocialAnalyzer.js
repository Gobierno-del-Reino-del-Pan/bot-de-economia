class SocialAnalyzer {
  constructor() {}

  async processMessageActivity(userRecord, patterns, data) {
    userRecord.total_messages = (userRecord.total_messages || 0) + 1;
    
    if (data.channelId) {
      patterns.messageChannels.add(data.channelId);
      userRecord.unique_channels_count = patterns.messageChannels.size;
    }

    // Marcar actividad humana si envía mensajes en múltiples canales
    if (patterns.messageChannels.size > 2) {
      patterns.humanMarkers.push({
        type: 'multi_channel_activity',
        channelCount: patterns.messageChannels.size,
        timestamp: Date.now()
      });
    }

    // Calcular ratios
    const totalCommands = (userRecord.total_works || 0) + (userRecord.total_transfers || 0) + (userRecord.total_deposits || 0);
    const totalMessages = userRecord.total_messages || 0;
    
    if (totalCommands > 0 && totalMessages > 0) {
      userRecord.command_only_ratio = (totalCommands / (totalCommands + totalMessages)) * 100;
    }

    // Calcular puntuación de interacción social
    const channelDiversity = patterns.messageChannels.size;
    const messageFrequency = totalMessages / Math.max(1, totalCommands);
    userRecord.social_interaction_score = Math.min(100, (channelDiversity * 8) + (messageFrequency * 12));

    return userRecord;
  }

  async processVoiceActivity(userRecord, patterns, data) {
    if (data.type === 'join') {
      userRecord.voice_connections_count = (userRecord.voice_connections_count || 0) + 1;
      userRecord.has_voice_activity = true;
      userRecord.last_voice_activity = new Date();
      
      // Marcar como verificación humana fuerte
      patterns.humanMarkers.push({
        type: 'voice_connection',
        channelId: data.channelId,
        timestamp: Date.now()
      });
      
      console.log(`✅ Usuario ${userRecord.user_id} conectado a voz - marcado como actividad humana`);
      
    } else if (data.type === 'leave' && data.minutes) {
      const minutes = parseFloat(data.minutes) || 0;
      userRecord.voice_activity_minutes = (userRecord.voice_activity_minutes || 0) + minutes;
      userRecord.last_voice_activity = new Date();
      
      // Más tiempo en voz = más humano
      if (minutes > 15) {
        patterns.humanMarkers.push({
          type: 'extended_voice_session',
          minutes: minutes,
          timestamp: Date.now()
        });
      }
    } else if (data.type === 'channel_switch' && data.minutes) {
      const minutes = parseFloat(data.minutes) || 0;
      userRecord.voice_activity_minutes = (userRecord.voice_activity_minutes || 0) + minutes;
      userRecord.last_voice_activity = new Date();
      
      // Registrar cambio de canal como actividad humana natural
      patterns.humanMarkers.push({
        type: 'voice_channel_switch',
        minutes: minutes,
        oldChannelId: data.oldChannelId,
        newChannelId: data.newChannelId,
        timestamp: Date.now()
      });
    }

    // Calcular puntuación de verificación por voz
    const voiceMinutes = userRecord.voice_activity_minutes || 0;
    const voiceConnections = userRecord.voice_connections_count || 0;
    
    userRecord.voice_verification_score = Math.min(100, 
      (voiceMinutes * 0.5) + (voiceConnections * 5)
    );

    return userRecord;
  }
}

module.exports = SocialAnalyzer;