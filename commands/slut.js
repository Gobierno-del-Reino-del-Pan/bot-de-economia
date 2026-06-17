const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const CurrencyHelper = require('../utils/currencyHelper');
const ErrorHandler = require('../utils/errorHandler');

module.exports = {
  name: 'slut',
  aliases: ['prostituta', 'puta'],
  description: 'Trabaja como prostituta para ganar dinero rápido',
  cooldown: 1, // Cooldown mínimo para evitar spam

  async execute(message) {
    try {
      const user = await message.client.db.getUser(message.author.id, message.author.username);
      const now = Date.now();

      // Verificar cooldown específico de slut (24 horas) usando la base de datos
      const slutCooldown = 86400000; // 24 horas en milisegundos
      const timeLeft = slutCooldown - (now - user.last_slut);
      
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
          .setDescription(`⏰ Podrás trabajar como prostituta de nuevo en **${hours}h ${minutes}m**.`)
          .setFooter({ text: message.client.user.username });

        return message.reply({ embeds: [embed] });
      }

      // Lista de trabajos de prostituta
      const slutJobs = [
        '💋 Trabajaste en un club nocturno',
        '🌙 Atendiste clientes VIP',
        '💄 Trabajaste en una casa de citas',
        '🍸 Acompañaste a un empresario',
        '💎 Trabajaste para clientes exclusivos',
        '🌹 Ofreciste servicios premium',
        '🥂 Trabajaste en una fiesta privada',
        '💃 Bailaste en un club de lujo',
        '🎭 Trabajaste en un evento especial',
        '🌟 Atendiste a un cliente millonario',
        '💰 Trabajaste toda la noche',
        '🔥 Ofreciste servicios especiales'
      ];

      // Calcular probabilidad de arresto basada en la riqueza del usuario (más realista)
      const totalWealth = user.cash + user.bank;
      let arrestChance = 0.25; // 25% base (reducido)
      
      // Aumentar probabilidad según la riqueza (pero menos agresivo)
      if (totalWealth > 500000) {
        arrestChance = 0.35; // 35% para muy ricos
      } else if (totalWealth > 200000) {
        arrestChance = 0.32; // 32% para ricos
      } else if (totalWealth > 100000) {
        arrestChance = 0.30; // 30% para clase media alta
      } else if (totalWealth > 50000) {
        arrestChance = 0.28; // 28% para clase media
      }
      
      const arrested = Math.random() < arrestChance;
      
      if (arrested) {
        // Multa más realista basada en la riqueza
        let baseFine = Math.floor(Math.random() * 400) + 200; // 200-600 base
        
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
          last_slut: now
        });

        await message.client.db.addTransaction(message.author.id, 'slut', -fine, 'Multa por prostitución');

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

      // Trabajo exitoso - ganancias más balanceadas
      let baseEarnings = Math.floor(Math.random() * 600) + 400; // 400-1000 base
      
      if (totalWealth > 500000) {
        baseEarnings *= 1.3; // 30% más ganancias para muy ricos
      } else if (totalWealth > 200000) {
        baseEarnings *= 1.2; // 20% más ganancias para ricos
      } else if (totalWealth > 100000) {
        baseEarnings *= 1.1; // 10% más ganancias para clase media alta
      }
      
      const earnings = Math.floor(baseEarnings);
      const job = slutJobs[Math.floor(Math.random() * slutJobs.length)];

      await message.client.db.updateUser(message.author.id, {
        cash: user.cash + earnings,
        total_earned: user.total_earned + earnings,
        last_slut: now
      });

      await message.client.db.addTransaction(message.author.id, 'slut', earnings, job);

      const embed = new EmbedBuilder()
        .setColor('#ff69b4')
        .setAuthor({
          name: message.author.username,
          iconURL: message.author.displayAvatarURL({ dynamic: true })
        })
        .setDescription(`${job} y ganaste **${CurrencyHelper.format(earnings)}**${totalWealth > 100000 ? '\n💎 *Ganancias aumentadas por tu estatus*' : ''}`)
        .setFooter({ text: message.client.user.username });

      message.reply({ embeds: [embed] });

    } catch (error) {
      await ErrorHandler.handleError(error, message, 'slut');
    }
  }
};