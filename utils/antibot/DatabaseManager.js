class DatabaseManager {
  constructor(client) {
    this.client = client;
  }

  async getUserRecord(userId, username) {
    try {
      const { data, error } = await this.client.db.supabase
        .from('antibots')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code === 'PGRST116') {
        // Obtener fecha de creación de la cuenta de Discord
        let accountCreated = null;
        try {
          const user = await this.client.users.fetch(userId);
          accountCreated = user.createdAt;
        } catch (error) {
          console.error('Error obteniendo fecha de creación:', error);
        }

        // Crear nuevo registro con solo los campos que existen en la tabla
        const newRecord = {
          user_id: userId,
          username: username || 'Usuario',
          discord_account_created: accountCreated,
          total_works: 0,
          work_intervals: [],
          perfect_timing_count: 0,
          near_perfect_timing_count: 0,
          work_variance_score: 50.0,
          consistent_timing_streaks: 0,
          total_transfers: 0,
          transfer_recipients: [],
          same_recipient_ratio: 0.0,
          total_deposits: 0,
          immediate_deposits_after_work: 0,
          deposit_all_pattern_count: 0,
          deposit_timing_variance: 50.0,
          robotic_deposit_score: 0.0,
          total_messages: 0,
          command_only_ratio: 0.0,
          social_interaction_score: 0.0,
          unique_channels_count: 0,
          voice_connections_count: 0,
          voice_activity_minutes: 0.0,
          last_voice_activity: null,
          has_voice_activity: false,
          voice_verification_score: 0.0,
          human_activity_markers: [],
          suspicious_patterns: [],
          suspicion_score: 0.0,
          confidence_level: 50.0,
          risk_level: 'low',
          is_verified_human: false,
          verification_method: null,
          is_flagged: false,
          alert_sent: false,
          manual_review_requested: false
        };

        const { error: insertError } = await this.client.db.supabase
          .from('antibots')
          .insert([newRecord]);

        if (insertError) throw insertError;

        return newRecord;
      }

      if (error) throw error;

      const record = data;
      
      // Parsear campos JSON de forma segura
      if (typeof record.work_intervals === 'string') {
        record.work_intervals = this.safeJsonParse(record.work_intervals, []);
      }
      if (typeof record.transfer_recipients === 'string') {
        record.transfer_recipients = this.safeJsonParse(record.transfer_recipients, []);
      }
      if (typeof record.human_activity_markers === 'string') {
        record.human_activity_markers = this.safeJsonParse(record.human_activity_markers, []);
      }
      if (typeof record.suspicious_patterns === 'string') {
        record.suspicious_patterns = this.safeJsonParse(record.suspicious_patterns, []);
      }
      
      return record;
    } catch (error) {
      console.error('Error obteniendo registro de usuario:', error);
      throw error;
    }
  }

  async updateUserRecord(userRecord) {
    try {
      const safe = (value, defaultValue = 0) => {
        const num = Number(value);
        return isNaN(num) ? defaultValue : num;
      };

      // CRÍTICO: NUNCA sobrescribir transfer_recipients si está vacío
      // Primero obtener los datos existentes
      const { data: existingData, error: selectError } = await this.client.db.supabase
        .from('antibots')
        .select('transfer_recipients')
        .eq('user_id', userRecord.user_id)
        .single();
      
      let transferRecipientsToSave = userRecord.transfer_recipients;
      
      // Si los nuevos datos están vacíos pero hay datos existentes, preservar los existentes
      if ((!transferRecipientsToSave || transferRecipientsToSave.length === 0) && !selectError && existingData) {
        const existingRecipients = this.safeJsonParse(existingData.transfer_recipients, []);
        if (existingRecipients.length > 0) {
          transferRecipientsToSave = existingRecipients;
          console.log(`🔒 PRESERVANDO transfer_recipients existentes para usuario ${userRecord.user_id} (${existingRecipients.length} registros)`);
        }
      }

      // Si tenemos nuevos datos de transferencias, combinarlos con los existentes
      if (userRecord.transfer_recipients && userRecord.transfer_recipients.length > 0 && !selectError && existingData) {
        const existingRecipients = this.safeJsonParse(existingData.transfer_recipients, []);
        
        // Combinar datos: actualizar existentes y agregar nuevos
        const combinedData = [...existingRecipients];
        
        for (const newRecipient of userRecord.transfer_recipients) {
          const existingIndex = combinedData.findIndex(r => r.userId === newRecipient.userId);
          
          if (existingIndex !== -1) {
            // Actualizar registro existente manteniendo el historial
            const existing = combinedData[existingIndex];
            combinedData[existingIndex] = {
              ...existing,
              ...newRecipient,
              // Preservar historial completo
              fullHistory: {
                amounts: [...(existing.fullHistory?.amounts || []), ...(newRecipient.fullHistory?.amounts || [])].slice(-200),
                timings: [...(existing.fullHistory?.timings || []), ...(newRecipient.fullHistory?.timings || [])].slice(-200)
              }
            };
          } else {
            // Agregar nuevo registro
            combinedData.push(newRecipient);
          }
        }
        
        transferRecipientsToSave = combinedData;
        console.log(`🔄 COMBINANDO transfer_recipients para usuario ${userRecord.user_id} (${combinedData.length} registros totales)`);
      }

      const updateData = {
        username: userRecord.username || 'Usuario',
        total_works: safe(userRecord.total_works, 0),
        work_intervals: userRecord.work_intervals || [],
        perfect_timing_count: safe(userRecord.perfect_timing_count, 0),
        near_perfect_timing_count: safe(userRecord.near_perfect_timing_count, 0),
        work_variance_score: safe(userRecord.work_variance_score, 50.0),
        consistent_timing_streaks: safe(userRecord.consistent_timing_streaks, 0),
        total_transfers: safe(userRecord.total_transfers, 0),
        transfer_recipients: transferRecipientsToSave || [],
        same_recipient_ratio: safe(userRecord.same_recipient_ratio, 0.0),
        total_deposits: safe(userRecord.total_deposits, 0),
        immediate_deposits_after_work: safe(userRecord.immediate_deposits_after_work, 0),
        deposit_all_pattern_count: safe(userRecord.deposit_all_pattern_count, 0),
        deposit_timing_variance: safe(userRecord.deposit_timing_variance, 50.0),
        robotic_deposit_score: safe(userRecord.robotic_deposit_score, 0.0),
        total_messages: safe(userRecord.total_messages, 0),
        command_only_ratio: safe(userRecord.command_only_ratio, 0.0),
        social_interaction_score: safe(userRecord.social_interaction_score, 0.0),
        unique_channels_count: safe(userRecord.unique_channels_count, 0),
        voice_connections_count: safe(userRecord.voice_connections_count, 0),
        voice_activity_minutes: safe(userRecord.voice_activity_minutes, 0.0),
        last_voice_activity: userRecord.last_voice_activity,
        has_voice_activity: userRecord.has_voice_activity || false,
        voice_verification_score: safe(userRecord.voice_verification_score, 0.0),
        human_activity_markers: userRecord.human_activity_markers || [],
        suspicious_patterns: userRecord.suspicious_patterns || [],
        suspicion_score: safe(userRecord.suspicion_score, 0.0),
        confidence_level: safe(userRecord.confidence_level, 50.0),
        risk_level: userRecord.risk_level || 'low',
        is_flagged: userRecord.is_flagged || false,
        alert_sent: userRecord.alert_sent || false,
        manual_review_requested: userRecord.manual_review_requested || false,
        last_activity: new Date().toISOString()
      };

      const { error: updateError } = await this.client.db.supabase
        .from('antibots')
        .update(updateData)
        .eq('user_id', userRecord.user_id);

      if (updateError) throw updateError;

      console.log(`✅ Registro actualizado para usuario ${userRecord.user_id} - transfer_recipients: ${(transferRecipientsToSave || []).length} registros`);
    } catch (error) {
      console.error('Error actualizando registro antibot:', error);
    }
  }

  async verifyUserAsHuman(userId, method = 'voice_activity') {
    try {
      const { error } = await this.client.db.supabase
        .from('antibots')
        .update({
          is_verified_human: true,
          verification_method: method,
          risk_level: 'safe',
          is_flagged: false,
          suspicion_score: 0.0,
          confidence_level: 95.0
        })
        .eq('user_id', userId);

      if (error) throw error;
      
      console.log(`✅ Usuario ${userId} verificado como humano (método: ${method})`);
    } catch (error) {
      console.error('Error verificando usuario como humano:', error);
    }
  }

  async getSuspiciousUsers(limit = 25) {
    try {
      const { data, error } = await this.client.db.supabase
        .from('antibots')
        .select('*')
        .gt('suspicion_score', 40)
        .eq('is_verified_human', false)
        .order('suspicion_score', { ascending: false })
        .order('confidence_level', { ascending: false })
        .order('work_variance_score', { ascending: true })
        .limit(limit);

      if (error) throw error;
      
      return (data || []).map(row => ({
        ...row,
        work_intervals: this.safeJsonParse(row.work_intervals, []),
        transfer_recipients: this.safeJsonParse(row.transfer_recipients, []),
        human_activity_markers: this.safeJsonParse(row.human_activity_markers, []),
        suspicious_patterns: this.safeJsonParse(row.suspicious_patterns, [])
      }));
    } catch (error) {
      console.error('Error obteniendo usuarios sospechosos:', error);
      return [];
    }
  }

  async getUserById(id) {
    try {
      const { data, error } = await this.client.db.supabase
        .from('antibots')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) return null;
      
      const record = data;
      record.work_intervals = this.safeJsonParse(record.work_intervals, []);
      record.transfer_recipients = this.safeJsonParse(record.transfer_recipients, []);
      record.human_activity_markers = this.safeJsonParse(record.human_activity_markers, []);
      record.suspicious_patterns = this.safeJsonParse(record.suspicious_patterns, []);
      
      return record;
    } catch (error) {
      console.error('Error obteniendo usuario por ID:', error);
      return null;
    }
  }

  safeJsonParse(jsonString, defaultValue = null) {
    if (!jsonString || typeof jsonString !== 'string') {
      return defaultValue;
    }
    
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      return defaultValue;
    }
  }
}

module.exports = DatabaseManager;