const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'ayuda-ruleta',
  aliases: ['help-roulette', 'roulette-help', 'ruleta-help'],
  description: 'Muestra la ayuda completa de la ruleta',
  cooldown: 3,

  async execute(message) {
    const embed = new EmbedBuilder()
      .setColor('#9b59b6') // morado elegante
      .setTitle('🎰 Guía de la Ruleta')
      .setDescription('Apuesta y prueba tu suerte en la ruleta del Reino del Pan.\n\n**Uso:** `!ruleta <cantidad> <tipo>`\n\n**La ruleta tiene números del 0 al 36. El 0 es verde, los demás son rojos o negros.**')
      .addFields(
        {
          name: '💵 Opciones de cantidad',
          value: [
            '`todo` / `all` → Apostar todo tu dinero',
            '`half` / `mitad` → Apostar la mitad',
            '`<número>` → Cantidad específica'
          ].join('\n'),
          inline: false
        },
        {
          name: '🔴⚫ Apuestas de Color (Pago x2)',
          value: [
            '🔴 **Rojo:** `rojo` / `red`',
            '⚫ **Negro:** `negro` / `black`'
          ].join('\n'),
          inline: true
        },
        {
          name: '🔢 Apuestas de Paridad (Pago x2)',
          value: [
            '**Par:** `par` / `even`',
            '**Impar:** `impar` / `odd`'
          ].join('\n'),
          inline: true
        },
        {
          name: '📊 Apuestas de Mitades (Pago x2)',
          value: [
            '**1-18:** `1-18` / `low` / `bajo`',
            '**19-36:** `19-36` / `high` / `alto`'
          ].join('\n'),
          inline: true
        },
        {
          name: '🥇 Apuestas de Docenas (Pago x3)',
          value: [
            '**1ra Docena (1-12):**',
            '`1docena` / `1ra` / `1era` / `primera` / `1-12` / `first` / `1st`',
            '',
            '**2da Docena (13-24):**',
            '`2docena` / `2da` / `2nda` / `segunda` / `13-24` / `second` / `2nd`',
            '',
            '**3ra Docena (25-36):**',
            '`3docena` / `3ra` / `3era` / `tercera` / `25-36` / `third` / `3rd`'
          ].join('\n'),
          inline: false
        },
        {
          name: '🏛️ Apuestas de Columnas (Pago x3)',
          value: [
            '**1ra Columna:** `1columna` / `columna1` / `col1`',
            '**2da Columna:** `2columna` / `columna2` / `col2`',
            '**3ra Columna:** `3columna` / `columna3` / `col3`',
            '',
            '*Las columnas son verticales en la mesa de ruleta*'
          ].join('\n'),
          inline: false
        },
        {
          name: '🎯 Apuestas Directas (Pago x36)',
          value: [
            '**Números específicos:** `0` hasta `36`',
            '• `0` = Verde (la casa)',
            '• `1` a `36` = Rojos y negros',
            '',
            '*¡La apuesta más arriesgada pero con mayor pago!*'
          ].join('\n'),
          inline: false
        },
        {
          name: '📌 Ejemplos de Uso',
          value: [
            '`!ruleta todo rojo` → Apostar todo al rojo',
            '`!ruleta 500 2nd` → Apostar 500 a la 2da docena',
            '`!ruleta half 17` → Apostar la mitad al número 17',
            '`!ruleta 1000 par` → Apostar 1000 a números pares',
            '`!ruleta 250 1-18` → Apostar 250 a números bajos'
          ].join('\n'),
          inline: false
        }
      )
      .setFooter({ text: message.client.user.username })
      .setTimestamp();

    await message.channel.send({ embeds: [embed] });
  }
};
