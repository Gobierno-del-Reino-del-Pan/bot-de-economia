const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config.json');
const CurrencyHelper = require('../utils/currencyHelper');
const ErrorHandler = require('../utils/errorHandler');

module.exports = {
  name: 'blackjack',
  aliases: ['bj', '21'],
  description: 'Juega al blackjack contra la casa',
  
  async execute(message, args) {
    try {
      // La verificación de canal se hace en index.js ahora
      
      const hasLossProtection = await message.client.db.hasActiveBoost(message.author.id, 'loss_prevention');

      // Verificar si el usuario ya está en un juego
      if (message.client.gameManager.isUserInGame(message.author.id)) {
        return ErrorHandler.handleGameActiveError(message);
      }

      const user = await message.client.db.getUser(message.author.id, message.author.username);
      const amount = CurrencyHelper.parseAmount(args[0], user.cash);
      
      if (amount === null || !CurrencyHelper.validateAmount(amount, config.casino.minBet, config.casino.maxBet)) {
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

      if (amount > user.cash) {
        return ErrorHandler.handleInsufficientFundsError(
          message,
          CurrencyHelper.format(amount),
          CurrencyHelper.format(user.cash)
        );
      }

      // Descontar la apuesta inmediatamente
      await message.client.db.updateUser(message.author.id, {
        cash: user.cash - amount
      });

      const deck = this.createDeck();
      const playerHand = [this.drawCard(deck), this.drawCard(deck)];
      const dealerHand = [this.drawCard(deck), this.drawCard(deck)];

      const gameState = {
        deck,
        playerHand,
        dealerHand,
        amount,
        userId: message.author.id,
        gameOver: false,
        doubled: false,
        hasLossProtection
      };

      message.client.gameManager.createBlackjackGame(message.author.id, gameState);

      const playerValue = this.getHandValue(playerHand);
      const dealerValue = this.getHandValue(dealerHand);

      // Verificar blackjack natural
      if (playerValue === 21) {
        if (dealerValue === 21) {
          return this.endGame(message, gameState, 'push');
        }
        return this.endGame(message, gameState, 'blackjack');
      }

      // Mostrar el juego inicial con botones
      const embed = this.createGameEmbed(gameState);
      const buttons = this.createGameButtons(gameState);
      
      const gameMessage = await message.reply({ embeds: [embed], components: [buttons] });
      gameState.messageId = gameMessage.id;
    } catch (error) {
      await ErrorHandler.handleError(error, message, 'blackjack');
    }
  },

  createDeck() {
    const suits = ['♠️', '♥️', '♦️', '♣️'];
    const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const deck = [];

    for (const suit of suits) {
      for (const value of values) {
        deck.push({ suit, value, points: this.getCardPoints(value) });
      }
    }

    // Barajar
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    return deck;
  },

  drawCard(deck) {
    return deck.pop();
  },

  getCardPoints(value) {
    if (['J', 'Q', 'K'].includes(value)) return 10;
    if (value === 'A') return 11;
    return parseInt(value);
  },

  getHandValue(hand) {
    let value = 0;
    let aces = 0;

    for (const card of hand) {
      if (card.value === 'A') {
        aces++;
      }
      value += card.points;
    }

    while (value > 21 && aces > 0) {
      value -= 10;
      aces--;
    }

    return value;
  },

  createGameEmbed(gameState) {
    const { playerHand, dealerHand, amount } = gameState;
    const playerValue = this.getHandValue(playerHand);

    return new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('🃏 Blackjack')
      .addFields(
        { name: '🎩 Dealer', value: `${this.formatHand(dealerHand, true)}\nValor: ?`, inline: false },
        { name: '👤 Tu mano', value: `${this.formatHand(playerHand)}\nValor: ${playerValue}`, inline: false },
        { name: '💰 Apuesta', value: CurrencyHelper.format(amount), inline: true }
      )
      .setTimestamp();
  },

  createGameButtons(gameState) {
    const { playerHand, doubled } = gameState;
    const canDouble = playerHand.length === 2 && !doubled;

    const buttons = [
      new ButtonBuilder()
        .setCustomId('bj_hit')
        .setLabel('🃏 Pedir')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('bj_stand')
        .setLabel('✋ Plantarse')
        .setStyle(ButtonStyle.Secondary)
    ];

    if (canDouble) {
      buttons.push(
        new ButtonBuilder()
          .setCustomId('bj_double')
          .setLabel('⚡ Doblar')
          .setStyle(ButtonStyle.Success)
      );
    }

    return new ActionRowBuilder().addComponents(buttons);
  },

  formatHand(hand, hideFirst = false) {
    if (hideFirst) {
      return `🂠 ${hand[1].value}${hand[1].suit}`;
    }
    return hand.map(card => `${card.value}${card.suit}`).join(' ');
  },

  async hit(interaction, gameState) {
    const card = this.drawCard(gameState.deck);
    gameState.playerHand.push(card);
    
    const playerValue = this.getHandValue(gameState.playerHand);
    
    if (playerValue > 21) {
      await this.endGame(interaction, gameState, 'bust');
    } else {
      await this.updateGame(interaction, gameState);
    }
  },

  async stand(interaction, gameState) {
    await this.dealerPlay(interaction, gameState);
  },

  async double(interaction, gameState) {
    const user = await interaction.client.db.getUser(interaction.user.id);
    
    if (user.cash < gameState.amount) {
      return interaction.reply({ 
        content: '❌ No tienes suficiente dinero para doblar.', 
        flags: 64 // Ephemeral
      });
    }

    // Descontar la apuesta adicional
    await interaction.client.db.updateUser(interaction.user.id, {
      cash: user.cash - gameState.amount
    });

    gameState.amount *= 2;
    gameState.doubled = true;
    
    // Pedir una carta y plantarse
    const card = this.drawCard(gameState.deck);
    gameState.playerHand.push(card);
    
    const playerValue = this.getHandValue(gameState.playerHand);
    
    if (playerValue > 21) {
      await this.endGame(interaction, gameState, 'bust');
    } else {
      await this.dealerPlay(interaction, gameState);
    }
  },

  async updateGame(interaction, gameState) {
    const embed = this.createGameEmbed(gameState);
    const buttons = this.createGameButtons(gameState);

    await interaction.update({ embeds: [embed], components: [buttons] });
  },

  async dealerPlay(interaction, gameState) {
    // El dealer juega automáticamente
    while (this.getHandValue(gameState.dealerHand) < 17) {
      gameState.dealerHand.push(this.drawCard(gameState.deck));
    }

    const playerValue = this.getHandValue(gameState.playerHand);
    const dealerValue = this.getHandValue(gameState.dealerHand);

    let result;
    if (dealerValue > 21) {
      result = 'win';
    } else if (playerValue > dealerValue) {
      result = 'win';
    } else if (playerValue === dealerValue) {
      result = 'push';
    } else {
      result = 'lose';
    }

    await this.endGame(interaction, gameState, result);
  },

  async endGame(context, gameState, result) {
    try {
      // Marcar el juego como terminado
      gameState.gameOver = true;
      
      const { amount, userId, hasLossProtection } = gameState;
      const user = await context.client.db.getUser(userId);
      let color, title, description, winnings = 0;
      let protectionUsed = false;

      switch (result) {
        case 'blackjack':
          winnings = Math.floor(amount * 2.5);
          color = '#FFD700';
          title = 'BLACKJACK';
          description = `Blackjack natural! Ganaste ${CurrencyHelper.format(winnings - amount)}`;
          break;
        case 'win':
          winnings = amount * 2;
          color = '#00ff00';
          title = 'Ganaste';
          description = `Venciste al dealer! Ganaste ${CurrencyHelper.format(amount)}`;
          break;
        case 'push':
          winnings = amount;
          color = '#ffff00';
          title = 'Empate';
          description = 'Empate con el dealer. Tu apuesta fue devuelta.';
          break;
        case 'lose':
        case 'bust':
          winnings = 0;
          // Verificar seguro de casino
          const subscriptionsCommand = require('./subscripciones');
          const activeInsurance = await subscriptionsCommand.hasActiveInsurance(userId);
          let insuranceRecovery = 0;
          let insuranceMessage = '';
          
          if (activeInsurance) {
            insuranceRecovery = Math.floor(amount * (activeInsurance.coverage / 100));
            insuranceMessage = ` - recuperaste ${CurrencyHelper.format(insuranceRecovery)} gracias a ${activeInsurance.name}`;
            winnings += insuranceRecovery;
            
            await context.client.db.addTransaction(userId, 'insurance', insuranceRecovery, `Cobertura seguro: ${activeInsurance.name}`);
          }
          
          // Verificar protección contra pérdidas
          if (hasLossProtection) {
            winnings = amount; // Devolver la apuesta
            protectionUsed = true;
            await context.client.db.consumeBoost(userId, 'loss_prevention');
            color = '#ffaa00';
            title = result === 'bust' ? 'Te pasaste (Protegido)' : 'Perdiste (Protegido)';
            description = `🛡️ **Protección activada!** Tu apuesta fue devuelta.`;
          } else {
            color = '#ff0000';
            title = result === 'bust' ? 'Te pasaste' : 'Perdiste';
            description = `Perdiste ${CurrencyHelper.format(amount - insuranceRecovery)}.${insuranceMessage}`;
          }
          break;
      }

      await context.client.db.updateUser(userId, {
        cash: user.cash + winnings,
        total_earned: winnings > amount ? user.total_earned + (winnings - amount) : user.total_earned
      });

      const transactionAmount = protectionUsed ? 0 : winnings - amount;
      await context.client.db.addTransaction(userId, 'gamble', transactionAmount, `Blackjack - ${result}${protectionUsed ? ' (Protegido)' : ''}`);

      const { playerHand, dealerHand } = gameState;
      const playerValue = this.getHandValue(playerHand);
      const dealerValue = this.getHandValue(dealerHand);

      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`🃏 ${title}`)
        .setDescription(description)
        .addFields(
          { name: '🎩 Dealer', value: `${this.formatHand(dealerHand)}\nValor: ${dealerValue}`, inline: false },
          { name: '👤 Tu mano', value: `${this.formatHand(playerHand)}\nValor: ${playerValue}`, inline: false }
        )
        .setFooter({ text: context.client.user.username })
        .setTimestamp();

      // Determinar si el contexto es una interacción o un mensaje
      if (context.update) {
        // Es una interacción (botón)
        await context.update({ embeds: [embed], components: [] });
      } else {
        // Es un mensaje (comando inicial)
        await context.reply({ embeds: [embed] });
      }
      
      // Limpiar el juego del gameManager
      context.client.gameManager.endBlackjackGame(userId);
    } catch (error) {
      await ErrorHandler.handleError(error, context, 'blackjack end game');
    }
  },

  async handleAction(interaction, action) {
    try {
      // Verificar si la interacción ya expiró
      if (Date.now() - interaction.createdTimestamp > 14 * 60 * 1000) {
        return;
      }

      const gameState = interaction.client.gameManager.getBlackjackGame(interaction.user.id);
      
      if (!gameState || gameState.gameOver) {
        return interaction.reply({ content: '❌ No tienes un juego activo o el juego ya terminó.', flags: 64 });
      }

      switch (action) {
        case 'hit':
          await this.hit(interaction, gameState);
          break;
        case 'stand':
          await this.stand(interaction, gameState);
          break;
        case 'double':
          await this.double(interaction, gameState);
          break;
      }
    } catch (error) {
      console.error('Error en acción de blackjack:', error);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ 
            content: '❌ Error procesando la acción.', 
            flags: 64 // Ephemeral
          });
        }
      } catch (replyError) {
        console.error('Error enviando respuesta de error:', replyError);
      }
    }
  }
};