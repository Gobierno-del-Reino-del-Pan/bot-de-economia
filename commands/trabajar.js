const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const ErrorHandler = require('../utils/errorHandler');
const CurrencyHelper = require('../utils/currencyHelper');

module.exports = {
  name: 'trabajar',
  aliases: ['work', 'currar'],
  description: 'Trabaja para ganar dinero',
  cooldown: 5,

  async execute(message) {
    try {
      // La verificación de canal se hace en index.js ahora
      
      const user = await message.client.db.getUser(message.author.id, message.author.username);
      const now = Date.now();

      const hasWorkBoost = await message.client.db.hasActiveBoost(message.author.id, 'coffee_addict');
      let boostUsed = false;
      let timeLeft = config.economy.workCooldown - (now - user.last_work);

      if (hasWorkBoost) {
        boostUsed = true;
        await message.client.db.consumeBoost(message.author.id, 'coffee_addict');
        timeLeft = 0;
      }

      // Si hay cooldown y no se usó boost → embed rojo
      if (timeLeft > 0 && !boostUsed) {
        const minutes = Math.floor(timeLeft / 60000);
        const seconds = Math.floor((timeLeft % 60000) / 1000);

        const embed = new EmbedBuilder()
          .setColor('#ff0000') // rojo
          .setTitle('⏰ Cooldown Activo')
          .setAuthor({
            name: message.author.username,
            iconURL: message.author.displayAvatarURL({ dynamic: true })
          })
          .setDescription(`⏰ Podrás volver a trabajar en **${minutes} minutos y ${seconds} segundos**.`)
          .setFooter({ text: message.client.user.username });

        return message.reply({ embeds: [embed] });
      }

      // Lista de trabajos
      const jobs = [
        '🥖 Horneaste pan francés',
        '🍞 Preparaste pan artesanal',
        '🥐 Elaboraste croissants',
        '🧁 Decoraste cupcakes',
        '🍕 Entregaste pizzas',
        '🚗 Trabajaste como conductor',
        '💻 Programaste una aplicación',
        '🏪 Atendiste una tienda',
        '🎨 Diseñaste un logo',
        '📝 Escribiste artículos',
        '🔧 Reparaste computadoras',
        '🍔 Cocinaste en un restaurante',
        '📦 Entregaste paquetes',
        '🎭 Actuaste en teatro',
        '🏗️ Trabajaste en construcción',
        '🌱 Cuidaste un jardín',
        '📚 Enseñaste en una escuela',
        '📱 Desarrollaste una app'
      ];

      const earnings = Math.floor(Math.random() * (config.economy.workMax - config.economy.workMin + 1)) + config.economy.workMin;
      const job = jobs[Math.floor(Math.random() * jobs.length)];

      await message.client.db.updateUser(message.author.id, {
        cash: user.cash + earnings,
        total_earned: user.total_earned + earnings,
        last_work: boostUsed ? user.last_work : now
      });
      
      await message.client.db.addTransaction(message.author.id, 'work', earnings, job);

      if (message.client.antibotDetector) {
        await message.client.antibotDetector.trackUserActivity(
          message.author.id,
          message.author.username,
          'work',
          { lastWork: user.last_work, amount: earnings }
        );
      }

      // Embed verde al trabajar
      const embed = new EmbedBuilder()
        .setColor('#00ff00') // verde
        .setTitle('💼 Trabajo Completado')
        .setAuthor({
          name: message.author.username,
          iconURL: message.author.displayAvatarURL({ dynamic: true })
        })
        .setDescription(`${job} y ganaste **${CurrencyHelper.format(earnings)}**${boostUsed ? '\n☕ **Boost de café usado** - Sin cooldown' : ''}`)
        .setFooter({ text: message.client.user.username });

      await message.reply({ embeds: [embed] });
    } catch (error) {
      await ErrorHandler.handleError(error, message, 'trabajar');
    }
  }
};
