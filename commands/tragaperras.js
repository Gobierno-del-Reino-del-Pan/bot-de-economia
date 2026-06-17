const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'tragaperras',
  description: 'Juega a la tragaperras',
  async execute(message, args) {
    const db = message.client.db;
    const config = message.client.config;
    const currency = config.currency.emoji;
    const minBet = config.casino.minBet;
    const maxBet = config.casino.maxBet;

    // ── Parsear apuesta ──────────────────────────────────────────────────────
    if (!args[0]) {
      const embed = new EmbedBuilder()
        .setTitle('🎰 TRAGAPERRAS')
        .setColor(0x2B2D31)
        .setDescription(
          `**Uso:** \`!tragaperras <cantidad>\`\n\n` +
          `Apuesta mínima: **${minBet}** ${currency}\n` +
          `Apuesta máxima: **${maxBet}** ${currency}\n\n` +
          `También puedes usar \`todo\` / \`all\` o \`mitad\` / \`half\``
        )
        .setFooter({ text: '¡Suerte!' });
      return message.reply({ embeds: [embed] });
    }

    const user = await db.getUser(message.author.id, message.author.username);

    let bet;
    const arg = args[0].toLowerCase();

    if (arg === 'todo' || arg === 'all') {
      bet = user.cash;
    } else if (arg === 'mitad' || arg === 'half') {
      bet = Math.floor(user.cash / 2);
    } else {
      bet = parseInt(arg);
    }

    if (!bet || isNaN(bet) || bet <= 0) {
      return message.reply({ embeds: [errorEmbed('❌ Indica una apuesta válida.')] });
    }
    if (bet < minBet) {
      return message.reply({ embeds: [errorEmbed(`❌ La apuesta mínima es **${minBet}** ${currency}.`)] });
    }
    if (bet > maxBet) {
      return message.reply({ embeds: [errorEmbed(`❌ La apuesta máxima es **${maxBet}** ${currency}.`)] });
    }
    if (user.cash < bet) {
      return message.reply({ embeds: [errorEmbed(`❌ No tienes suficiente efectivo.\nTienes: **${user.cash}** ${currency} | Apuesta: **${bet}** ${currency}`)] });
    }

    // ── Verificar boost de protección contra pérdidas ────────────────────────
    const hasProtection = await db.hasActiveBoost(message.author.id, 'loss_protection');

    // ── Símbolos y pesos reales ─────────────────────────────────────────────
    const SYMBOLS = [
      { emoji: '🍒', name: 'cereza',    weight: 30 },
      { emoji: '🍋', name: 'limón',     weight: 25 },
      { emoji: '🍊', name: 'naranja',   weight: 20 },
      { emoji: '🍇', name: 'uvas',      weight: 15 },
      { emoji: '⭐', name: 'estrella',  weight: 7  },
      { emoji: '💎', name: 'diamante',  weight: 3  },
    ];
    const SYMBOLS_LIST = SYMBOLS.map(s => s.emoji);

    const PAYOUTS = {
      triple: {
        '🍒': { mult: 2,   label: '¡Tres cerezas!'    },
        '🍋': { mult: 2.5, label: '¡Tres limones!'    },
        '🍊': { mult: 3,   label: '¡Tres naranjas!'   },
        '🍇': { mult: 4,   label: '¡Tres uvas!'       },
        '⭐': { mult: 7,   label: '¡TRES ESTRELLAS!'  },
        '💎': { mult: 15,  label: '💎 ¡¡JACKPOT!! 💎' },
      },
      double: 1.5,
    };

    // Función de giro real (con pesos)
    function spinReel() {
      const totalWeight = SYMBOLS.reduce((sum, s) => sum + s.weight, 0);
      let rand = Math.random() * totalWeight;
      for (const symbol of SYMBOLS) {
        rand -= symbol.weight;
        if (rand <= 0) return symbol.emoji;
      }
      return SYMBOLS[0].emoji;
    }

    // ── ANIMACIÓN DE GIRO (sin textos molestos) ────────────────────────────
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Enviar embed inicial
    const initialEmbed = new EmbedBuilder()
      .setTitle('🎰 TRAGAPERRAS')
      .setColor(0xF1C40F)
      .setDescription('🔄 **G I R A N D O** 🔄\n\n` ❓ ❓ ❓ `')
      .setFooter({ text: '🎰' });

    const sentMsg = await message.reply({ embeds: [initialEmbed] });

    const randomSymbol = () => SYMBOLS_LIST[Math.floor(Math.random() * SYMBOLS_LIST.length)];
    const ANIMATION_FRAMES = 10;      // más frames = más fluido
    const FRAME_DELAY = 150;          // 150ms entre frames

    for (let i = 0; i < ANIMATION_FRAMES; i++) {
      const animSymbols = [randomSymbol(), randomSymbol(), randomSymbol()];
      const animEmbed = new EmbedBuilder()
        .setTitle('🎰 TRAGAPERRAS')
        .setColor(0xF1C40F)
        .setDescription(`\` ${animSymbols[0]}  ${animSymbols[1]}  ${animSymbols[2]} \``)
        .setFooter({ text: '🎰' });
      await sentMsg.edit({ embeds: [animEmbed] });
      await wait(FRAME_DELAY);
    }

    // ── RESULTADO REAL (después de la animación) ───────────────────────────
    const r1 = spinReel();
    const r2 = spinReel();
    const r3 = spinReel();

    let multiplier = 0;
    let resultLabel = '';
    let isWin = false;

    if (r1 === r2 && r2 === r3) {
      const payout = PAYOUTS.triple[r1];
      multiplier = payout.mult;
      resultLabel = payout.label;
      isWin = true;
    } else if (r1 === r2 || r2 === r3 || r1 === r3) {
      multiplier = PAYOUTS.double;
      resultLabel = '¡Dos iguales!';
      isWin = true;
    } else {
      resultLabel = 'Sin suerte esta vez...';
    }

    let newCash;
    let deltaText;
    let protectionUsed = false;

    if (isWin) {
      const gross = Math.floor(bet * multiplier);
      const profit = gross - bet;
      newCash = user.cash - bet + gross;
      deltaText = `+${profit} ${currency}`;

      await db.updateUser(message.author.id, {
        cash: newCash,
        total_earned: user.total_earned + gross,
      });
    } else {
      if (hasProtection) {
        protectionUsed = true;
        await db.consumeBoost(message.author.id, 'loss_protection');
        newCash = user.cash;
        deltaText = `±0 ${currency} *(protección activada)*`;
      } else {
        newCash = user.cash - bet;
        deltaText = `-${bet} ${currency}`;

        await db.updateUser(message.author.id, {
          cash: newCash,
          total_spent: user.total_spent + bet,
        });
      }
    }

    // ── EMBED FINAL ───────────────────────────────────────────────────────
    const color = isWin ? 0x2ECC71 : (protectionUsed ? 0xF39C12 : 0xE74C3C);
    const title = isWin ? '🎉 ¡GANASTE! 🎉' : (protectionUsed ? '🛡️ PERDIDA PROTEGIDA' : '😞 PERDISTE');

    const finalEmbed = new EmbedBuilder()
      .setTitle(title)
      .setColor(color)
      .setDescription(
        `┌───────────────┐\n` +
        `│   ${r1}   ${r2}   ${r3}   │\n` +
        `└───────────────┘\n\n` +
        `**${resultLabel}**\n` +
        (isWin ? `Multiplicador: **x${multiplier}**\n` : '') +
        (protectionUsed ? `🛡️ *"Mejor Prevenir que Curar" absorbió la pérdida.*\n` : '') +
        `\n**Resultado:** ${deltaText}\n` +
        `**Saldo:** ${newCash} ${currency}`
      )
      .setFooter({ text: `Apuesta: ${bet} ${currency}` });

    await sentMsg.edit({ embeds: [finalEmbed] });
  },
};

function errorEmbed(description) {
  return new EmbedBuilder()
    .setColor(0xE74C3C)
    .setDescription(description);
}