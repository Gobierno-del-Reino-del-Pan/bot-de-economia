const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const CurrencyHelper = require('../utils/currencyHelper');
const ErrorHandler = require('../utils/errorHandler');

module.exports = {
  name: 'ruleta',
  aliases: ['roulette', 'spin'],
  description: 'Juega a la ruleta grupal',
  cooldown: 5,
  
  async execute(message, args) {
    try {
      // La verificación de canal se hace en index.js ahora
      
      const hasLossProtection = await message.client.db.hasActiveBoost(message.author.id, 'loss_prevention');

      // Verificar si el usuario está en un juego activo
      if (message.client.gameManager.isUserInGame(message.author.id)) {
        return ErrorHandler.handleGameActiveError(message);
      }

      if (!args[0] || !args[1]) {
        return message.reply('❌ Uso: `!ruleta <cantidad> <tipo>`\n**Tipos:** `rojo`/`red`, `negro`/`black`, `par`/`even`, `impar`/`odd`, `1-18`/`low`, `19-36`/`high`, `1docena`/`2docena`/`3docena`, `1columna`/`2columna`/`3columna`, o un número específico (0-36)\n**Opciones:** `todo`/`all`, `half`, o cantidad específica.');
      }

      const betType = args[1].toLowerCase();
      
      // Mapear tipos de apuestas en inglés y español
      const betTypeMap = {
        // Colores
        'rojo': 'red',
        'red': 'red',
        'negro': 'black', 
        'black': 'black',
        
        // Paridad
        'par': 'even',
        'even': 'even',
        'impar': 'odd',
        'odd': 'odd',
        
        // Mitades
        '1-18': 'low',
        'low': 'low',
        'bajo': 'low',
        '19-36': 'high',
        'high': 'high',
        'alto': 'high',
        
        // Docenas
        '1-12': 'dozen1',
        '1docena': 'dozen1',
        '1ra': 'dozen1',
        '1era': 'dozen1',
        'primera': 'dozen1',
        '13-24': 'dozen2',
        '2docena': 'dozen2',
        '2da': 'dozen2',
        '2nda': 'dozen2',
        'segunda': 'dozen2',
        '25-36': 'dozen3',
        '3docena': 'dozen3',
        '3ra': 'dozen3',
        '3era': 'dozen3',
        'tercera': 'dozen3',
        
        // Columnas
        '1columna': 'column1',
        'columna1': 'column1',
        '2columna': 'column2',
        'columna2': 'column2', 
        '3columna': 'column3',
        'columna3': 'column3'
      };

      const normalizedBetType = betTypeMap[betType] || betType;
      const validBetTypes = ['red', 'black', 'even', 'odd', 'low', 'high', 'dozen1', 'dozen2', 'dozen3', 'column1', 'column2', 'column3'];
      const isNumberBet = !isNaN(parseInt(betType)) && parseInt(betType) >= 0 && parseInt(betType) <= 36;

      if (!validBetTypes.includes(normalizedBetType) && !isNumberBet) {
        return message.reply('❌ Tipo de apuesta inválido.\n**Tipos válidos:** `rojo`/`red`, `negro`/`black`, `par`/`even`, `impar`/`odd`, `1-18`/`low`, `19-36`/`high`, `1docena`/`2docena`/`3docena`, `1columna`/`2columna`/`3columna`, o un número específico (0-36).');
      }

      const user = await message.client.db.getUser(message.author.id, message.author.username);
      const amount = CurrencyHelper.parseAmount(args[0], user.cash);
      
      if (amount === null) {
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('💰 Apuesta Inválida')
          .setDescription(`La apuesta debe estar entre **${CurrencyHelper.format(config.casino.minBet)}** y **${CurrencyHelper.format(config.casino.maxBet)}**.`)
          .addFields({
            name: '💡 Opciones válidas',
            value: '• `todo`/`all` - Todo tu efectivo\n• `half`/`mitad` - Mitad del efectivo\n• Número específico dentro del rango',
            inline: false
          })
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      if (!CurrencyHelper.validateAmount(amount, config.casino.minBet, config.casino.maxBet)) {
        return message.reply(`❌ La apuesta debe estar entre **${CurrencyHelper.format(config.casino.minBet)}** y **${CurrencyHelper.format(config.casino.maxBet)}**.`);
      }

      if (amount > user.cash) {
        return ErrorHandler.handleInsufficientFundsError(
          message,
          CurrencyHelper.format(amount),
          CurrencyHelper.format(user.cash)
        );
      }

      // Buscar sesión activa en el canal
      let session = message.client.gameManager.getActiveRouletteSession(message.channel.id);
      
      if (!session) {
        // Crear nueva sesión
        session = message.client.gameManager.createRouletteSession(message.channel.id, message.author.id);
        message.client.db.createRouletteSession(session.id, message.channel.id, message.author.id);
        
        // Configurar timeout para iniciar la ruleta automáticamente
        session.timeout = setTimeout(async () => {
          await this.spinRoulette(message, session.id);
        }, config.casino.rouletteTimeout);
      }

      // Verificar si el usuario ya apostó en esta sesión (PERMITIR MÚLTIPLES APUESTAS)
      const existingBets = message.client.db.getRouletteBets(session.id);
      const userBets = existingBets.filter(bet => bet.user_id === message.author.id);
      
      // Permitir hasta 6 apuestas por usuario por sesión
      if (userBets.length >= 6) {
        return message.reply('❌ Ya tienes el máximo de 6 apuestas en esta ruleta. Espera a que termine para apostar de nuevo.');
      }

      // Descontar la apuesta
      await message.client.db.updateUser(message.author.id, {
        cash: user.cash - amount
      });

      // Agregar apuesta
      const betValue = isNumberBet ? parseInt(betType) : normalizedBetType;
      const displayBetType = isNumberBet ? betType : this.getDisplayNameForBetType(normalizedBetType);
      message.client.db.addRouletteBet(session.id, message.author.id, displayBetType, betValue, amount, message.author.username, hasLossProtection);

      await message.client.db.addTransaction(message.author.id, 'gamble', -amount, `Apuesta ruleta: ${displayBetType}${hasLossProtection ? ' (Con protección)' : ''}`);

      // Mostrar estado actual de la ruleta
      await this.showRouletteStatus(message, session.id);

    } catch (error) {
      await ErrorHandler.handleError(error, message, 'ruleta');
    }
  },

  getDisplayNameForBetType(betType) {
    const displayNames = {
      'red': 'Rojo',
      'black': 'Negro',
      'even': 'Par',
      'odd': 'Impar',
      'low': '1-18',
      'high': '19-36',
      'dozen1': '1ra Docena (1-12)',
      'dozen2': '2da Docena (13-24)',
      'dozen3': '3ra Docena (25-36)',
      'column1': '1ra Columna',
      'column2': '2da Columna',
      'column3': '3ra Columna'
    };
    
    return displayNames[betType] || betType;
  },

  async showRouletteStatus(message, sessionId) {
    const session = message.client.db.getRouletteSession(sessionId);
    const bets = message.client.db.getRouletteBets(sessionId);
    
    if (!session || bets.length === 0) return;

    const totalBets = bets.reduce((sum, bet) => sum + bet.amount, 0);
    const timeLeft = Math.ceil((config.casino.rouletteTimeout - (Date.now() - new Date(session.created_at).getTime())) / 1000);

    // Agrupar apuestas por usuario
    const userBets = {};
    bets.forEach(bet => {
      if (!userBets[bet.username]) {
        userBets[bet.username] = [];
      }
      userBets[bet.username].push(`${bet.bet_type} (${CurrencyHelper.format(bet.amount)})`);
    });

    const betsList = Object.entries(userBets).map(([username, userBetList]) => {
      return `**${username}:** ${userBetList.join(', ')}`;
    }).join('\n');

    const embed = new EmbedBuilder()
      .setColor('#ff6b6b')
      .setTitle('🎰 Ruleta Activa')
      .setDescription('¡La ruleta está abierta para apuestas!')
      .addFields(
        { name: 'Apuestas Actuales', value: betsList || 'Ninguna apuesta aún', inline: false },
        { name: 'Total Apostado', value: CurrencyHelper.format(totalBets), inline: true },
        { name: 'Jugadores', value: `${Object.keys(userBets).length}`, inline: true },
        { name: 'Tiempo Restante', value: `${Math.max(0, timeLeft)} segundos`, inline: true }
      )
      .setFooter({ text: 'Usa !ruleta <cantidad> <tipo> para unirte (máximo 6 apuestas por usuario)' })
      .setTimestamp();

    await message.channel.send({ embeds: [embed] });
  },

  async spinRoulette(message, sessionId) {
    try {
      const session = message.client.db.getRouletteSession(sessionId);
      const bets = message.client.db.getRouletteBets(sessionId);
      
      if (!session || bets.length === 0) {
        message.client.gameManager.endRouletteSession(sessionId);
        message.client.db.endRouletteSession(sessionId);
        return;
      }

      // Generar número ganador
      const winningNumber = Math.floor(Math.random() * 37); // 0-36
      
      // Determinar propiedades del número ganador
      const numberProperties = this.getNumberProperties(winningNumber);
      
      const color = winningNumber === 0 ? 'verde' : numberProperties.isRed ? 'rojo' : 'negro';

      // Procesar apuestas y determinar ganadores
      const winners = [];
      const userResults = {}; // Para agrupar resultados por usuario
      
      for (const bet of bets) {
        const user = await message.client.db.getUser(bet.user_id);
        let won = false;
        let multiplier = 0;

        // Verificar si ganó según el tipo de apuesta
        const result = this.checkBetWin(bet.bet_value, winningNumber, numberProperties);
        won = result.won;
        multiplier = result.multiplier;

        if (!userResults[bet.user_id]) {
          userResults[bet.user_id] = {
            username: bet.username,
            totalWinnings: 0,
            totalBets: 0,
            winningBets: [],
            losingBets: []
          };
        }

        userResults[bet.user_id].totalBets += bet.amount;

        if (won) {
          const winnings = bet.amount * multiplier; // TOTAL (apuesta + ganancia)
          await message.client.db.updateUser(bet.user_id, {
            cash: user.cash + winnings,
            total_earned: user.total_earned + (winnings - bet.amount)
          });

          await message.client.db.addTransaction(
            bet.user_id,
            'gamble',
            winnings - bet.amount,
            `Ganancia ruleta: ${winningNumber} ${color}`
          );

          userResults[bet.user_id].totalWinnings += winnings;
          userResults[bet.user_id].winningBets.push(`${bet.bet_type} x${multiplier}`);
        } else {
          // Verificar si tiene seguro de casino activo
          const subscriptionsCommand = require('./subscripciones');
          const activeInsurance = await subscriptionsCommand.hasActiveInsurance(bet.user_id);
          let insuranceRecovery = 0;
          let insuranceMessage = '';
          
          if (activeInsurance) {
            insuranceRecovery = Math.floor(bet.amount * (activeInsurance.coverage / 100));
            insuranceMessage = ` - recuperaste ${CurrencyHelper.format(insuranceRecovery)} gracias a ${activeInsurance.name}`;
            
            // Devolver el dinero del seguro
            await message.client.db.updateUser(bet.user_id, {
              cash: user.cash + insuranceRecovery
            });
            
            await message.client.db.addTransaction(
              bet.user_id,
              'insurance',
              insuranceRecovery,
              `Cobertura seguro: ${activeInsurance.name}`
            );
          }
          
          let protectionUsed = false;
          
          // Verificar si el usuario tenía protección
          if (bet.hasLossProtection) {
            protectionUsed = true;
            await message.client.db.consumeBoost(bet.user_id, 'loss_prevention');
            
            // Devolver la apuesta
            await message.client.db.updateUser(bet.user_id, {
              cash: user.cash + bet.amount
            });
          } else {
            await message.client.db.updateUser(bet.user_id, {
              total_spent: user.total_spent + (bet.amount - insuranceRecovery)
            });
          }

          const transactionAmount = protectionUsed ? 0 : -(bet.amount - insuranceRecovery);
          await message.client.db.addTransaction(
            bet.user_id,
            'gamble',
            transactionAmount,
            `Pérdida ruleta: ${winningNumber} ${color}${protectionUsed ? ' - Protegido' : ''}${insuranceMessage}`
          );

          userResults[bet.user_id].losingBets.push(`${bet.bet_type}${protectionUsed ? ' - 🛡️ Protegido' : ''}${insuranceMessage}`);
        }
      }

      // Enviar mensaje con resultados agrupados por usuario
      let resultMessage = `🎰 **La bola cayó en ${winningNumber} ${color}**\n\n`;
      
      const hasWinners = Object.values(userResults).some(result => result.totalWinnings > 0);
      
      if (hasWinners) {
        resultMessage += '🎉 **Ganadores:**\n';
        for (const [userId, result] of Object.entries(userResults)) {
          if (result.totalWinnings > 0) {
            const profit = result.totalWinnings - result.totalBets;
            resultMessage += `**${result.username}** ganó ${CurrencyHelper.format(profit)} (${result.winningBets.join(', ')})\n`;
          }
        }
        resultMessage += '\n';
      }

      // Mostrar perdedores
      const losers = Object.values(userResults).filter(result => result.totalWinnings === 0);
      if (losers.length > 0) {
        resultMessage += '😔 **Sin suerte:**\n';
        for (const result of losers) {
          resultMessage += `**${result.username}** (${result.losingBets.join(', ')})\n`;
        }
      }

      await message.channel.send(resultMessage);

      // Limpiar sesión
      message.client.gameManager.endRouletteSession(sessionId);
      message.client.db.endRouletteSession(sessionId);

    } catch (error) {
      console.error('Error en spinRoulette:', error);
      message.client.gameManager.endRouletteSession(sessionId);
      message.client.db.endRouletteSession(sessionId);
    }
  },

  getNumberProperties(number) {
    const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
    
    return {
      isRed: redNumbers.includes(number),
      isBlack: number !== 0 && !redNumbers.includes(number),
      isEven: number !== 0 && number % 2 === 0,
      isOdd: number !== 0 && number % 2 === 1,
      isLow: number >= 1 && number <= 18,
      isHigh: number >= 19 && number <= 36,
      dozen: number === 0 ? null : number <= 12 ? 1 : number <= 24 ? 2 : 3,
      column: number === 0 ? null : ((number - 1) % 3) + 1
    };
  },

  checkBetWin(betValue, winningNumber, properties) {
    // Apuestas directas a números
    if (typeof betValue === 'number') {
      return {
        won: betValue === winningNumber,
        multiplier: 36
      };
    }

    // Apuestas de color, paridad, etc.
    switch (betValue) {
      case 'red':
        return { won: properties.isRed, multiplier: 2 };
      case 'black':
        return { won: properties.isBlack, multiplier: 2 };
      case 'even':
        return { won: properties.isEven, multiplier: 2 };
      case 'odd':
        return { won: properties.isOdd, multiplier: 2 };
      case 'low':
        return { won: properties.isLow, multiplier: 2 };
      case 'high':
        return { won: properties.isHigh, multiplier: 2 };
      case 'dozen1':
        return { won: properties.dozen === 1, multiplier: 3 };
      case 'dozen2':
        return { won: properties.dozen === 2, multiplier: 3 };
      case 'dozen3':
        return { won: properties.dozen === 3, multiplier: 3 };
      case 'column1':
        return { won: properties.column === 1, multiplier: 3 };
      case 'column2':
        return { won: properties.column === 2, multiplier: 3 };
      case 'column3':
        return { won: properties.column === 3, multiplier: 3 };
      default:
        return { won: false, multiplier: 0 };
    }
  }
};