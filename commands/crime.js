const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const CurrencyHelper = require('../utils/currencyHelper');
const ErrorHandler = require('../utils/errorHandler');

module.exports = {
  name: 'crime',
  aliases: ['crimen', 'delito'],
  description: 'Comete crímenes para ganar dinero (riesgoso)',
  cooldown: 1, // Cooldown mínimo para evitar spam

  async execute(message) {
    try {
      const user = await message.client.db.getUser(message.author.id, message.author.username);
      const now = Date.now();

      // Verificar cooldown específico de crime (2 horas) usando la base de datos
      const crimeCooldown = 7200000; // 2 horas en milisegundos
      const timeLeft = crimeCooldown - (now - user.last_crime);
      
      if (timeLeft > 0) {
        const hours = Math.floor(timeLeft / 3600000);
        const minutes = Math.floor((timeLeft % 3600000) / 60000);

        const embed = new EmbedBuilder()
          .setColor('#ff0000')
          .setTitle('⏰ Cooldown Activo')
          .setAuthor({
            name: message.author.username,
            iconURL: message.author.displayAvatarURL({ dynamic: true })
          })
          .setDescription(`⏰ Podrás cometer otro crimen en **${hours}h ${minutes}m**.`)
          .setFooter({ text: message.client.user.username });

        return message.reply({ embeds: [embed] });
      }

      // Lista de crímenes
      const crimes = [
        '🏪 Robaste una tienda de conveniencia',
        '🚗 Robaste un auto de lujo',
        '💎 Robaste joyas de una mansión',
        '🏦 Asaltaste un banco pequeño',
        '📱 Vendiste teléfonos robados',
        '💻 Hackeaste cuentas bancarias',
        '🎰 Hiciste trampa en el casino',
        '🚚 Robaste un camión de carga',
        '💰 Estafaste a turistas',
        '🏢 Robaste una oficina corporativa',
        '⌚ Vendiste relojes falsificados',
        '🎭 Organizaste una estafa piramidal',
        '🔫 Asaltaste una joyería',
        '💳 Clonaste tarjetas de crédito',
        '🏠 Robaste una casa vacía'
      ];

      // Calcular probabilidad de arresto basada en la riqueza del usuario (más realista)
      const totalWealth = user.cash + user.bank;
      let arrestChance = 0.35; // 35% base (reducido)
      
      // Aumentar probabilidad según la riqueza (pero menos agresivo)
      if (totalWealth > 500000) {
        arrestChance = 0.50; // 50% para muy ricos
      } else if (totalWealth > 200000) {
        arrestChance = 0.47; // 47% para ricos
      } else if (totalWealth > 100000) {
        arrestChance = 0.43; // 43% para clase media alta
      } else if (totalWealth > 50000) {
        arrestChance = 0.40; // 40% para clase media
      }
      
      const arrested = Math.random() < arrestChance;
      
      if (arrested) {
        // Multa más realista basada en la riqueza
        let baseFine = Math.floor(Math.random() * 600) + 300; // 300-900 base
        
        if (totalWealth > 500000) {
          baseFine *= 1.8; // Multa 80% mayor para muy ricos
        } else if (totalWealth > 200000) {
          baseFine *= 1.5; // Multa 50% mayor para ricos
        } else if (totalWealth > 100000) {
          baseFine *= 1.3; // Multa 30% mayor para clase media alta
        }
        
        const fine = Math.min(baseFine, user.cash); // No puede ser mayor al efectivo disponible
        const newCash = Math.max(0, user.cash - fine);
        
        await message.client.db.updateUser(message.author.id, {
          cash: newCash,
          total_spent: user.total_spent + fine,
          last_crime: now
        });

        await message.client.db.addTransaction(message.author.id, 'crime', -fine, 'Multa por crimen');

        const embed = new EmbedBuilder()
          .setColor('#ff0000')
          .setAuthor({
            name: message.author.username,
            iconURL: message.author.displayAvatarURL({ dynamic: true })
          })
          .setDescription(`🚔 ¡Te arrestaron! Pagaste una multa de **${CurrencyHelper.format(fine)}**.${totalWealth > 100000 ? '\n💸 *Multa aumentada por tu riqueza*' : ''}`)
          .setFooter({ text: message.client.user.username });

        return message.reply({ embeds: [embed] });
      }

      // Crimen exitoso - ganancias más balanceadas
      let baseEarnings = Math.floor(Math.random() * 800) + 600; // 600-1400 base
      
      if (totalWealth > 500000) {
        baseEarnings *= 1.3; // 30% más ganancias para muy ricos
      } else if (totalWealth > 200000) {
        baseEarnings *= 1.2; // 20% más ganancias para ricos
      } else if (totalWealth > 100000) {
        baseEarnings *= 1.1; // 10% más ganancias para clase media alta
      }
      
      const earnings = Math.floor(baseEarnings);
      const crime = crimes[Math.floor(Math.random() * crimes.length)];

      await message.client.db.updateUser(message.author.id, {
        cash: user.cash + earnings,
        total_earned: user.total_earned + earnings,
        last_crime: now
      });

      await message.client.db.addTransaction(message.author.id, 'crime', earnings, crime);

      const embed = new EmbedBuilder()
        .setColor('#8b0000')
        .setAuthor({
          name: message.author.username,
          iconURL: message.author.displayAvatarURL({ dynamic: true })
        })
        .setDescription(`${crime} y ganaste **${CurrencyHelper.format(earnings)}**${totalWealth > 100000 ? '\n💎 *Ganancias aumentadas por tu estatus*' : ''}`)
        .setFooter({ text: message.client.user.username });

      message.reply({ embeds: [embed] });

    } catch (error) {
      await ErrorHandler.handleError(error, message, 'crime');
    }
  }
};