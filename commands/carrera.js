const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config.json');
const CurrencyHelper = require('../utils/currencyHelper');
const ErrorHandler = require('../utils/errorHandler');

module.exports = {
  name: 'carrera',
  aliases: ['horse-race', 'carrera-caballos', 'race'],
  description: 'Compite en una carrera de caballos con tu caballo',
  cooldown: 30,
  
  async execute(message, args) {
    try {
      // La verificación de canal se hace en index.js ahora
      
      const hasLossProtection = await message.client.db.hasActiveBoost(message.author.id, 'loss_prevention');

      // Verificar si el usuario está en un juego activo
      if (message.client.gameManager.isUserInGame(message.author.id)) {
        return ErrorHandler.handleGameActiveError(message);
      }

      if (!args[0]) {
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('❌ Falta Información')
          .setDescription('Especifica la cantidad a apostar.')
          .addFields({
            name: '💡 Uso correcto',
            value: '`!carrera <cantidad>`\n\n**Opciones:** `todo`/`all`, `half`, o cantidad específica',
            inline: false
          })
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      const user = await message.client.db.getUser(message.author.id, message.author.username);
      const amount = CurrencyHelper.parseAmount(args[0], user.cash);
      
      if (amount === null) {
        return ErrorHandler.handleInvalidAmountError(message, 'carrera');
      }

      if (!CurrencyHelper.validateAmount(amount, config.casino.minBet, config.casino.maxBet)) {
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('💰 Apuesta Inválida')
          .setDescription(`La apuesta debe estar entre **${CurrencyHelper.format(config.casino.minBet)}** y **${CurrencyHelper.format(config.casino.maxBet)}**.`)
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      const userHorses = await message.client.db.getUserHorses(message.author.id);

      if (userHorses.length === 0) {
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('🐎 Sin Caballos')
          .setDescription('No tienes caballos para competir.')
          .addFields({
            name: '💡 Cómo obtener caballos',
            value: 'Compra uno en la tienda con `!tienda` (busca los caballos desde 1,000 panedas)',
            inline: false
          })
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      if (amount > user.cash) {
        return ErrorHandler.handleInsufficientFundsError(
          message,
          CurrencyHelper.format(amount),
          CurrencyHelper.format(user.cash)
        );
      }

      // Seleccionar caballo del usuario (el primero si tiene varios)
      const userHorse = userHorses[0];
      
      // Generar 4 caballos rivales aleatorios
      const rivalHorses = [
        { name: 'Relámpago Azul', emoji: '🌀' },
        { name: 'Sombra Veloz', emoji: '🌙' },
        { name: 'Tornado Rojo', emoji: '🌪️' },
        { name: 'Cometa Plateado', emoji: '⭐' },
        { name: 'Huracán Verde', emoji: '🌿' },
        { name: 'Meteoro Dorado', emoji: '☄️' },
        { name: 'Rayo Púrpura', emoji: '⚡' },
        { name: 'Viento Cristal', emoji: '💎' }
      ];

      // Seleccionar 4 rivales aleatorios
      const selectedRivals = [];
      const usedIndexes = new Set();
      
      while (selectedRivals.length < 4) {
        const randomIndex = Math.floor(Math.random() * rivalHorses.length);
        if (!usedIndexes.has(randomIndex)) {
          selectedRivals.push(rivalHorses[randomIndex]);
          usedIndexes.add(randomIndex);
        }
      }

      // Crear array de todos los caballos (usuario + 4 rivales)
      const allHorses = [
        { name: userHorse.name, emoji: '🐎', isUser: true, position: 0 },
        ...selectedRivals.map(horse => ({ ...horse, isUser: false, position: 0 }))
      ];

      // Mezclar el orden de los caballos
      for (let i = allHorses.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allHorses[i], allHorses[j]] = [allHorses[j], allHorses[i]];
      }

      // Descontar la apuesta
      await message.client.db.updateUser(message.author.id, {
        cash: user.cash - amount
      });

      await message.client.db.addTransaction(message.author.id, 'gamble', -amount, `Apuesta carrera: ${userHorse.name}${hasLossProtection ? ' (Con protección)' : ''}`);

      // Mostrar carrera inicial
      const raceEmbed = this.createRaceEmbed(allHorses, userHorse.name, amount, 'starting', hasLossProtection);
      
      const raceMessage = await message.reply({ embeds: [raceEmbed] });

      // Esperar 2 segundos y luego iniciar la carrera automáticamente
      setTimeout(async () => {
        await this.runRace(message, allHorses, userHorse, amount, raceMessage, hasLossProtection);
      }, 2000);

    } catch (error) {
      await ErrorHandler.handleError(error, message, 'carrera');
    }
  },

  async runRace(interaction, allHorses, userHorse, amount, raceMessage, hasLossProtection) {
    try {
      const trackLength = 10;
      let raceFinished = false;
      let winner = null;

      // Calcular probabilidades basadas en el win rate del caballo del usuario
      const userHorseData = allHorses.find(h => h.isUser);
      const userWinRate = userHorse.total_races > 0 ? userHorse.wins / userHorse.total_races : 0.5;
      
      // Mientras más gane, más probable es que pierda (balanceado)
      let userWinChance = Math.max(0.15, 0.6 - (userWinRate * 0.3)); // Entre 15% y 60%

      // Simular carrera paso a paso
      while (!raceFinished) {
        // Mover cada caballo
        for (const horse of allHorses) {
          if (horse.position < trackLength) {
            let moveChance = 0.4; // Probabilidad base de avanzar
            
            if (horse.isUser) {
              moveChance = userWinChance;
            }
            
            // Agregar algo de aleatoriedad
            if (Math.random() < moveChance) {
              horse.position += Math.random() < 0.7 ? 1 : 2; // Avanzar 1 o 2 posiciones
            }
          }

          // Verificar si alguien ganó
          if (horse.position >= trackLength && !winner) {
            winner = horse;
            raceFinished = true;
          }
        }

        // Actualizar embed de la carrera
        const embed = this.createRaceEmbed(allHorses, userHorse.name, amount, raceFinished ? 'finished' : 'racing', hasLossProtection);
        
        await raceMessage.edit({ embeds: [embed] });
        
        if (!raceFinished) {
          await new Promise(resolve => setTimeout(resolve, 1200));
        }
      }

      // Procesar resultado
      await this.processRaceResult({ client: raceMessage.client, user: { id: interaction.author.id } }, winner, userHorse, amount, raceMessage, hasLossProtection);

    } catch (error) {
      console.error('Error en carrera:', error);
    }
  },

  createRaceEmbed(horses, userHorseName, amount, status, hasLossProtection = false) {
    const trackLength = 10;
    let description = '';

    // Crear la pista visual
    for (let i = 0; i < horses.length; i++) {
      const horse = horses[i];
      let track = '🏁'; // Meta al inicio
      
      for (let j = 0; j < trackLength; j++) {
        if (j === Math.min(horse.position, trackLength - 1)) {
          track += horse.emoji;
        } else {
          track += '⬜';
        }
      }
      
      track += '🏆'; // Premio al final
      
      const horseName = horse.isUser ? `**${horse.name}** (TU)` : horse.name;
      const progress = Math.min(Math.round((horse.position / trackLength) * 100), 100);
      description += `${horseName} (${progress}%)\n${track}\n\n`;
    }

    let color = '#ffaa00';
    let title = '🏇 Carrera de Caballos';
    
    if (status === 'starting') {
      title = '🏁 Preparando Carrera';
      color = '#00bfff';
    } else if (status === 'racing') {
      title = '🏇 ¡Carrera en Curso!';
      color = '#ff6b6b';
    } else if (status === 'finished') {
      title = '🏆 ¡Carrera Terminada!';
      color = '#00ff00';
    }

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setDescription(description)
      .addFields(
        { name: '🐎 Tu Caballo', value: userHorseName, inline: true },
        { name: '💰 Apuesta', value: CurrencyHelper.format(amount), inline: true },
        { name: hasLossProtection ? '🛡️ Protección' : '🏁 Meta', value: hasLossProtection ? 'Activa' : `${trackLength} casillas`, inline: true }
      )
      .setTimestamp();

    return embed;
  },

  async processRaceResult(interaction, winner, userHorse, amount, raceMessage, hasLossProtection) {
    try {
      const client = interaction.client;
      const userId = interaction.user.id;
      const user = await client.db.getUser(userId);
      
      const userWon = winner && winner.isUser;
      let finalEmbed;

      if (userWon) {
        // Usuario ganó - mantiene el caballo y gana dinero
        const winnings = amount * 2;
        
        await client.db.updateUser(userId, {
          cash: user.cash + winnings,
          total_earned: user.total_earned + winnings
        });

        await client.db.updateHorseStats(userId, userHorse.name, true);
        await client.db.addTransaction(userId, 'gamble', winnings, `Ganancia carrera: ${userHorse.name}`);

        finalEmbed = new EmbedBuilder()
          .setColor('#00ff00')
          .setTitle('Victoria')
          .setDescription(`**${userHorse.name}** ganó la carrera`)
          .addFields(
            { name: 'Ganador', value: `${winner.emoji} **${winner.name}**`, inline: true },
            { name: 'Ganancia', value: CurrencyHelper.format(amount), inline: true },
            { name: 'Estado del Caballo', value: 'Conservado', inline: true }
          )
          .setFooter({ text: `Balance: ${CurrencyHelper.format(user.cash + winnings)}` })
          .setTimestamp();

      } else {
        // Verificar seguro de casino
        const subscriptionsCommand = require('./subscripciones');
        const activeInsurance = await subscriptionsCommand.hasActiveInsurance(userId);
        let insuranceRecovery = 0;
        let insuranceMessage = '';
        
        if (activeInsurance) {
          insuranceRecovery = Math.floor(amount * (activeInsurance.coverage / 100));
          insuranceMessage = ` (recuperaste ${CurrencyHelper.format(insuranceRecovery)} gracias a ${activeInsurance.name})`;
          
          await client.db.updateUser(userId, {
            total_earned: user.total_earned + insuranceRecovery
          });
          
          await client.db.addTransaction(userId, 'insurance', insuranceRecovery, `Cobertura seguro: ${activeInsurance.name}`);
        }
        
        // Usuario perdió - pierde el caballo y el dinero
        let protectionUsed = false;
        
        if (hasLossProtection) {
          protectionUsed = true;
          await client.db.consumeBoost(userId, 'loss_prevention');
          
          // Devolver la apuesta pero aún pierde el caballo
          await client.db.updateUser(userId, {
            cash: user.cash + amount
          });
        } else if (insuranceRecovery > 0) {
          await client.db.updateUser(userId, {
            cash: user.cash + insuranceRecovery
          });
        }
        
        await client.db.removeUserHorse(userId, userHorse.name);
        await client.db.updateHorseStats(userId, userHorse.name, false);
        await client.db.addTransaction(userId, 'gamble', protectionUsed ? 0 : -(amount - insuranceRecovery), `Pérdida carrera: ${userHorse.name} (caballo perdido)${protectionUsed ? ' - Dinero protegido' : ''}${insuranceMessage}`);

        finalEmbed = new EmbedBuilder()
          .setColor(protectionUsed ? '#ffaa00' : '#ff0000')
          .setTitle(protectionUsed ? 'Derrota (Protegido)' : 'Derrota')
          .setDescription(`**${userHorse.name}** perdió la carrera${protectionUsed ? '\n🛡️ **Protección activada!** Tu dinero fue devuelto, pero perdiste el caballo.' : ''}${insuranceMessage}`)
          .addFields(
            { name: 'Ganador', value: `${winner.emoji} **${winner.name}**`, inline: true },
            { name: protectionUsed ? 'Dinero' : 'Pérdida', value: protectionUsed ? 'Protegido' : CurrencyHelper.format(amount - insuranceRecovery), inline: true },
            { name: 'Estado del Caballo', value: 'Perdido', inline: true }
          )
          .setFooter({ text: `Balance: ${CurrencyHelper.format(protectionUsed ? user.cash + amount : user.cash + insuranceRecovery)}` })
          .setTimestamp();
      }

      await raceMessage.edit({ embeds: [finalEmbed] });

    } catch (error) {
      console.error('Error procesando resultado de carrera:', error);
    }
  }
};