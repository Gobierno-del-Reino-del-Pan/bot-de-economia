const { EmbedBuilder } = require('discord.js');

// =============================================
// Error handler
// =============================================

class ErrorHandler {
  static async handleError(error, message, context = '') {
    console.error(`❌ Error en ${context}:`, error);

    const embed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('❌ Error del Sistema')
      .setDescription('Ocurrió un error inesperado. El equipo técnico ha sido notificado.')
      .setFooter({ text: 'Si el problema persiste, contacta a un administrador' })
      .setTimestamp();

    try {
      if (message.reply) {
        await message.reply({ embeds: [embed] });
      } else if (message.editReply) {
        await message.editReply({ embeds: [embed] });
      } else if (message.followUp) {
        await message.followUp({ embeds: [embed] });
      }
    } catch (replyError) {
      console.error('Error enviando mensaje de error:', replyError);
    }
  }

  static async handleDatabaseError(error, message) {
    console.error('❌ Error de base de datos:', error);

    const embed = new EmbedBuilder()
      .setColor('#ff6b6b')
      .setTitle('🗄️ Error de Base de Datos')
      .setDescription('Problema temporal con la base de datos. Intenta de nuevo en unos momentos.')
      .setTimestamp();

    try {
      if (message.reply) {
        await message.reply({ embeds: [embed] });
      } else if (message.editReply) {
        await message.editReply({ embeds: [embed] });
      } else if (message.followUp) {
        await message.followUp({ embeds: [embed] });
      }
    } catch (replyError) {
      console.error('Error enviando mensaje de error de BD:', replyError);
    }
  }

  static async handleCooldownError(timeLeft, commandName, message) {
    const minutes = Math.ceil(timeLeft / 60000);
    const hours = Math.ceil(timeLeft / 3600000);
    const days = Math.ceil(timeLeft / 86400000);

    let timeString;
    if (timeLeft < 3600000) {
      timeString = `${minutes} minuto${minutes !== 1 ? 's' : ''}`;
    } else if (timeLeft < 86400000) {
      timeString = `${hours} hora${hours !== 1 ? 's' : ''}`;
    } else {
      timeString = `${days} día${days !== 1 ? 's' : ''}`;
    }

    const embed = new EmbedBuilder()
      .setColor('#ffaa00')
      .setTitle('⏰ Comando en Cooldown')
      .setDescription(`Debes esperar **${timeString}** antes de usar \`${commandName}\` de nuevo.`)
      .setTimestamp();

    try {
      if (message.reply) {
        await message.reply({ embeds: [embed] });
      } else if (message.editReply) {
        await message.editReply({ embeds: [embed] });
      } else if (message.followUp) {
        await message.followUp({ embeds: [embed] });
      }
    } catch (replyError) {
      console.error('Error enviando mensaje de cooldown:', replyError);
    }
  }

  static async handlePermissionError(message, commandName, isSlash = false) {
    const embed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('🚫 Sin Permisos')
      .setDescription(`No tienes permisos para usar el comando \`${commandName}\`.`)
      .addFields({
        name: '⚠️ Información',
        value: 'Este comando requiere permisos especiales de administrador o roles específicos.',
        inline: false
      })
      .setTimestamp();

    try {
      if (isSlash) {
        await message.reply({ embeds: [embed], ephemeral: true });
      } else {
        await message.reply({ embeds: [embed] });
      }
    } catch (replyError) {
      console.error('Error enviando mensaje de permisos:', replyError);
    }
  }

  static async handleChannelPermissionError(message, commandType) {
    const embed = new EmbedBuilder()
      .setColor('#ff6b6b')
      .setTitle('🚫 Canal No Permitido')
      .setDescription(`Este canal no está habilitado para comandos de ${commandType}.`)
      .addFields({
        name: '💡 Información',
        value: commandType === 'casino' 
          ? 'Los comandos de casino solo funcionan en canales específicos habilitados por los administradores.'
          : 'Los comandos de trabajo solo funcionan en canales específicos habilitados por los administradores.',
        inline: false
      })
      .setTimestamp();

    try {
      await message.reply({ embeds: [embed] });
    } catch (replyError) {
      console.error('Error enviando mensaje de canal:', replyError);
    }
  }

  static async handleGameActiveError(message) {
    const embed = new EmbedBuilder()
      .setColor('#ff6b6b')
      .setTitle('🎮 Juego Activo')
      .setDescription('Ya estás en un juego activo. Termina tu juego actual primero.')
      .addFields({
        name: '💡 Consejo',
        value: 'Completa tu juego de blackjack, carrera o cualquier otro juego antes de usar este comando.',
        inline: false
      })
      .setTimestamp();

    try {
      await message.reply({ embeds: [embed] });
    } catch (replyError) {
      console.error('Error enviando mensaje de juego activo:', replyError);
    }
  }

  static async handleInsufficientFundsError(message, required, available) {
    const embed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('💸 Fondos Insuficientes')
      .setDescription('No tienes suficiente dinero para realizar esta acción.')
      .addFields(
        { name: '💰 Requerido', value: required, inline: true },
        { name: '💵 Disponible', value: available, inline: true }
      )
      .setTimestamp();

    try {
      await message.reply({ embeds: [embed] });
    } catch (replyError) {
      console.error('Error enviando mensaje de fondos:', replyError);
    }
  }

  static async handleInvalidAmountError(message, commandName) {
    const embed = new EmbedBuilder()
      .setColor('#ff6b6b')
      .setTitle('❌ Cantidad Inválida')
      .setDescription('La cantidad especificada no es válida.')
      .addFields({
        name: '💡 Opciones válidas',
        value: '• `todo`/`all` - Todo tu dinero\n• `half`/`mitad` - La mitad\n• Número específico (ej: 1000)',
        inline: false
      })
      .setTimestamp();

    try {
      await message.reply({ embeds: [embed] });
    } catch (replyError) {
      console.error('Error enviando mensaje de cantidad:', replyError);
    }
  }
}

module.exports = ErrorHandler;