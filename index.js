const { Client, Collection, GatewayIntentBits, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');
const SupabaseDatabase = require('./database/supabase');
const GameManager = require('./utils/gameManager');
const RateLimiter = require('./utils/rateLimiter');
const ErrorHandler = require('./utils/errorHandler');
const LoanProcessor = require('./utils/loanProcessor');
const AntibotDetector = require('./utils/antibotDetector');
const LevelManager = require('./utils/levelManager');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions
  ]
});

client.commands = new Collection();
client.cooldowns = new Collection();
client.gameManager = new GameManager();
client.rateLimiter = new RateLimiter();
client.loanProcessor = new LoanProcessor(client);
client.antibotDetector = new AntibotDetector(client);
client.levelManager = new LevelManager(client);

// Función para desplegar comandos (integrada)
async function deployCommands() {
  const commands = [];
  const commandsPath = path.join(__dirname, 'commands');
  const adminCommandsPath = path.join(__dirname, 'admincommands');

  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

  let adminCommandFiles = [];
  try {
    adminCommandFiles = fs.readdirSync(adminCommandsPath).filter(file => file.endsWith('.js'));
  } catch {
    console.log('📁 Carpeta admincommands no encontrada, saltando...');
  }

  // Cargar comandos normales
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
      commands.push(command.data.toJSON());
    }
  }

  // Cargar comandos admin
  for (const file of adminCommandFiles) {
    const filePath = path.join(adminCommandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
      commands.push(command.data.toJSON());
    }
  }

  const rest = new REST().setToken(config.token);

  try {
    console.log(`🔄 Iniciando recarga de ${commands.length} comandos de aplicación.`);

    const data = await rest.put(
      Routes.applicationCommands(config.clientId),
      { body: commands },
    );

    console.log(`✅ Recargados exitosamente ${data.length} comandos de aplicación.`);
  } catch (error) {
    console.error('❌ Error desplegando comandos:', error);
  }
}

// Inicializar base de datos
const db = new SupabaseDatabase(config.supabase);

client.once('ready', async () => {
  console.log(`🤖 Bot iniciado como ${client.user.tag}!`);
  console.log(`🌐 Conectado a ${client.guilds.cache.size} servidor(es)`);

  // Ejecutar deploy-commands automáticamente
  await deployCommands();

  // Inicializar base de datos
  try {
    await db.init();
    console.log('✅ Supabase conectado!');
  } catch (error) {
    console.error('❌ Error conectando a Supabase:', error);
    process.exit(1);
  }

  client.db = db;
  client.config = config;

  // Limpiar cache y sesiones periódicamente
  setInterval(() => {
    client.db.clearExpiredCache();
    client.gameManager.cleanupExpiredSessions();
    client.rateLimiter.cleanup();
    client.levelManager.cleanup();
  }, 60000); // Cada minuto

  // Iniciar procesador de préstamos
  client.loanProcessor.startDailyProcessor();




  // Verificar configuración del sistema anti-bot
  if (config.antibot?.enabled) {
    console.log('🤖 Sistema anti-bot habilitado');
    if (!config.antibot.webhook) {
      console.warn('⚠️ Webhook anti-bot no configurado');
    }
  } else {
    console.log('⚪ Sistema anti-bot deshabilitado');
  }

  // Establecer estado del bot
  client.user.setActivity('!ayuda | Reino del Pan', { type: 3 }); // 3 = WATCHING
});

// Cargar comandos
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// Cargar comandos de administración
const adminCommandsPath = path.join(__dirname, 'admincommands');
let adminCommandFiles = [];
try {
  adminCommandFiles = fs.readdirSync(adminCommandsPath).filter(file => file.endsWith('.js'));
} catch (error) {
  console.log('📁 Carpeta admincommands no encontrada, saltando...');
}

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);

  if ('name' in command && 'execute' in command) {
    client.commands.set(command.name, command);
    if (command.aliases) {
      command.aliases.forEach(alias => {
        client.commands.set(alias, command);
      });
    }
    console.log(`✅ Comando cargado: ${command.name}`);
  }
}

// Cargar comandos de administración
for (const file of adminCommandFiles) {
  const filePath = path.join(adminCommandsPath, file);
  const command = require(filePath);

  if ('data' in command && 'execute' in command) {
    // Comando slash - registrar por nombre del data
    client.commands.set(command.data.name, command);
    console.log(`✅ Comando admin slash cargado: ${command.data.name}`);
  } else if ('name' in command && 'execute' in command) {
    // Comando normal
    client.commands.set(command.name, command);
    if (command.aliases) {
      command.aliases.forEach(alias => {
        client.commands.set(alias, command);
      });
    }
    console.log(`✅ Comando admin cargado: ${command.name}`);
  }
}

// Manejar interacciones (botones, selects, etc.)
client.on('interactionCreate', async interaction => {
  try {
    // Verificar si la interacción ya expiró
    if (Date.now() - interaction.createdTimestamp > 14 * 60 * 1000) {
      console.log('⚠️ Interacción expirada, ignorando...');
      return;
    }

    // Verificar si ya fue respondida
    if (interaction.replied || interaction.deferred) {
      console.log('⚠️ Interacción ya fue respondida, ignorando...');
      return;
    }

    // Manejar comandos slash
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);

      if (!command) {
        console.error(`❌ No se encontró el comando slash: ${interaction.commandName}`);
        return interaction.reply({
          content: '❌ Comando no encontrado.',
          ephemeral: true
        });
      }

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(`❌ Error ejecutando comando slash ${interaction.commandName}:`, error);

        const errorMessage = '❌ Hubo un error al ejecutar este comando.';

        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
          await interaction.reply({ content: errorMessage, ephemeral: true });
        }
      }
      return;
    }

    if (interaction.isButton()) {
      await handleButtonInteraction(interaction);
    } else if (interaction.isStringSelectMenu()) {
      await handleSelectMenuInteraction(interaction);
    }
  } catch (error) {
    console.error('❌ Error en interacción:', error);

    // Solo intentar responder si la interacción no ha sido manejada y no ha expirado
    try {
      if (!interaction.replied && !interaction.deferred &&
          Date.now() - interaction.createdTimestamp < 14 * 60 * 1000) {
        await interaction.reply({
          content: '❌ Error procesando la interacción.',
          flags: 64 // Ephemeral flag
        });
      }
    } catch (replyError) {
      console.error('❌ Error enviando respuesta de error:', replyError);
    }
  }
});

async function handleButtonInteraction(interaction) {
  try {
    if (interaction.customId.startsWith('bj_')) {
      const blackjackCommand = client.commands.get('blackjack');
      const action = interaction.customId.split('_')[1];
      await blackjackCommand.handleAction(interaction, action);
    } else {
      // Interacción no reconocida
      await interaction.reply({
        content: '❌ Interacción no reconocida.',
        flags: 64 // Ephemeral
      });
    }
  } catch (error) {
    console.error('❌ Error en handleButtonInteraction:', error);
    throw error;
  }
}

async function handleSelectMenuInteraction(interaction) {
  try {
    // Manejar selects de la tienda u otros menús
    if (interaction.customId === 'shop_category') {
      const shopCommand = client.commands.get('tienda');
      await shopCommand.handleCategorySelect(interaction);
    } else {
      await interaction.reply({
        content: '❌ Menú no reconocido.',
        flags: 64 // Ephemeral
      });
    }
  } catch (error) {
    console.error('❌ Error en handleSelectMenuInteraction:', error);
    throw error;
  }
}

client.on('messageCreate', async message => {
  // Ignorar bots y mensajes sin prefix
  if (!message.content.startsWith(config.prefix) || message.author.bot) return;

  // Rastrear actividad de mensajes para anti-bot (solo comandos)
  if (client.antibotDetector) {
    await client.antibotDetector.trackUserActivity(
      message.author.id,
      message.author.username,
      'message',
      { isCommand: true, channelId: message.channel.id }
    );
  }

  // Rate limiting global
  if (!client.rateLimiter.checkGlobalLimit('global', 100, 60000)) {
    return message.reply('⚠️ El bot está experimentando mucho tráfico. Intenta de nuevo en un momento.');
  }

  const args = message.content.slice(config.prefix.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();

  const command = client.commands.get(commandName);
  if (!command) return;

  // ===== SISTEMA DE PERMISOS DE CANALES =====

  // Verificar si es comando de administración
  const isAdminCommand = command.adminOnly === true;

  if (!isAdminCommand) {
    // Cargar configuración de canales permitidos
    const channelPermissions = loadChannelPermissions();

    // Comandos de casino
    const casinoCommands = [
      'ruleta', 'roulette', 'spin', 'blackjack', 'bj', '21',
      'tragaperras', 'slots', 'slot', 'tragamonedas',
      'dados', 'dice', 'roll',
      'carrera', 'horse-race', 'carrera-caballos', 'race'
    ];

    // Comandos que funcionan en cualquier canal (sin restricción)
    const freeCommands = [
      'nivel', 'level', 'lvl', 'rank', 'xp',
      'topnivel', 'leveltop', 'topxp', 'leaderboard', 'lb'
    ];

    if (freeCommands.includes(commandName)) {
      // Sin restricción de canal — saltar comprobación
    } else if (casinoCommands.includes(commandName)) {
      // Es comando de casino — verificar canal de casino
      if (!channelPermissions.casinoChannels || channelPermissions.casinoChannels.length === 0) {
        // Si no hay canales configurados, permitir todos
      } else if (!channelPermissions.casinoChannels.includes(message.channel.id)) {
        // Canal no permitido para casino
        const allowedChannel = channelPermissions.casinoChannels[0];
        const { EmbedBuilder } = require('discord.js');
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('🚫 Canal No Permitido')
          .setDescription('Lo sentimos, este canal no es apto para las apuestas.')
          .addFields({
            name: '🎰 Canal de Casino',
            value: `Por favor, vaya a <#${allowedChannel}> para apostar.`,
            inline: false
          })
          .setTimestamp();

        return message.reply({ embeds: [embed] });
      }
    } else {
      // Es comando normal — verificar canal de trabajo
      if (!channelPermissions.workChannels || channelPermissions.workChannels.length === 0) {
        // Si no hay canales configurados, NO permitir ninguno
        return;
      } else if (!channelPermissions.workChannels.includes(message.channel.id)) {
        // Canal no permitido para comandos normales — ignorar completamente
        return;
      }
    }
  }

  // ===== FIN SISTEMA DE PERMISOS =====

  // Rate limiting por usuario
  if (!client.rateLimiter.checkUserLimit(message.author.id, command.name, 10, 60000)) {
    return message.reply('⚠️ Estás usando comandos muy rápido. Espera un momento antes de continuar.');
  }

  // Sistema de cooldowns
  const { cooldowns } = client;
  if (!cooldowns.has(command.name)) {
    cooldowns.set(command.name, new Collection());
  }

  const now = Date.now();
  const timestamps = cooldowns.get(command.name);
  const cooldownAmount = (command.cooldown || 3) * 1000;

  if (timestamps.has(message.author.id)) {
    const expirationTime = timestamps.get(message.author.id) + cooldownAmount;

    if (now < expirationTime) {
      const timeLeft = expirationTime - now;
      return ErrorHandler.handleCooldownError(timeLeft, command.name, message);
    }
  }

  timestamps.set(message.author.id, now);
  setTimeout(() => timestamps.delete(message.author.id), cooldownAmount);

  try {
    await command.execute(message, args);
  } catch (error) {
    await ErrorHandler.handleError(error, message, `comando ${command.name}`);
  }
});

// Función para cargar permisos de canales
function loadChannelPermissions() {
  try {
    const filePath = path.join(__dirname, 'data/permitchannels.json');

    if (!fs.existsSync(filePath)) {
      return { workChannels: [], casinoChannels: [] };
    }

    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error cargando permisos de canales:', error);
    return { workChannels: [], casinoChannels: [] };
  }
}

// Rastrear actividad de voz para anti-bot
client.on('voiceStateUpdate', async (oldState, newState) => {
  if (!client.antibotDetector || !client.antibotDetector.enabled) return;

  // Ignorar bots pero procesar TODOS los usuarios humanos
  if (newState.member?.user?.bot) return;

  try {
    const userId = newState.member?.user?.id;
    const username = newState.member?.user?.username;

    if (!userId || !username) return;

    // Usuario se conectó a un canal de voz
    if (!oldState.channel && newState.channel) {
      console.log(`🎤 VOZ DETECTADA: ${username} (${userId}) se conectó al canal de voz ${newState.channel.name} en servidor ${newState.guild.name}`);

      // Marcar inmediatamente como verificado humano
      await client.antibotDetector.verifyUserAsHuman(userId, 'voice_connection');

      // Rastrear conexión
      await client.antibotDetector.trackUserActivity(
        userId,
        username,
        'voice',
        { type: 'join', channelId: newState.channelId, guildId: newState.guild.id, guildName: newState.guild.name }
      );

      // Iniciar seguimiento de tiempo
      if (!client.voiceTracker) client.voiceTracker = new Map();
      client.voiceTracker.set(userId, Date.now());

      console.log(`✅ ${username} VERIFICADO COMO HUMANO por actividad de voz`);
    }
    // Usuario se desconectó de un canal de voz
    else if (oldState.channel && !newState.channel) {
      console.log(`🎤 VOZ DETECTADA: ${username} (${userId}) se desconectó del canal de voz ${oldState.channel.name} en servidor ${oldState.guild.name}`);

      if (client.voiceTracker && client.voiceTracker.has(userId)) {
        const startTime = client.voiceTracker.get(userId);
        const minutes = Math.floor((Date.now() - startTime) / 60000);

        if (minutes > 0) {
          await client.antibotDetector.trackUserActivity(
            userId,
            username,
            'voice',
            { type: 'leave', minutes: minutes, guildId: oldState.guild.id, guildName: oldState.guild.name }
          );

          console.log(`🎤 ${username} desconectado de voz - ${minutes} minutos registrados en ${oldState.guild.name}`);
        }

        client.voiceTracker.delete(userId);
      }
    }
    // Usuario cambió de canal de voz (permaneció conectado)
    else if (oldState.channel && newState.channel && oldState.channelId !== newState.channelId) {
      console.log(`🎤 VOZ DETECTADA: ${username} (${userId}) cambió de ${oldState.channel.name} a ${newState.channel.name} en servidor ${newState.guild.name}`);

      if (client.voiceTracker && client.voiceTracker.has(userId)) {
        const startTime = client.voiceTracker.get(userId);
        const minutes = Math.floor((Date.now() - startTime) / 60000);

        if (minutes > 0) {
          await client.antibotDetector.trackUserActivity(
            userId,
            username,
            'voice',
            { type: 'channel_switch', minutes: minutes, oldChannelId: oldState.channelId, newChannelId: newState.channelId, guildId: newState.guild.id, guildName: newState.guild.name }
          );
        }

        // Reiniciar el contador para el nuevo canal
        client.voiceTracker.set(userId, Date.now());
        console.log(`🎤 ${username} cambió de canal de voz - ${minutes} minutos registrados en canal anterior en ${newState.guild.name}`);
      }
    }
  } catch (error) {
    console.error('❌ Error rastreando actividad de voz:', error);
  }
});

// Rastrear mensajes normales (no comandos) para detectar actividad social
client.on('messageCreate', async message => {
  // Solo procesar mensajes que NO sean comandos y NO sean de bots
  if (message.content.startsWith(config.prefix) || message.author.bot) return;

  // Rastrear actividad social
  if (client.antibotDetector) {
    await client.antibotDetector.trackUserActivity(
      message.author.id,
      message.author.username,
      'message',
      { isCommand: false, channelId: message.channel.id }
    );
  }

  // Sistema de niveles — dar XP por mensaje
  if (client.levelManager) {
    await client.levelManager.handleMessage(message);
  }
});

// Manejar cuando un usuario sale del servidor
client.on('guildMemberRemove', async member => {
  try {
    // Verificar si el usuario existe en la base de datos
    const { data, error } = await client.db.supabase
      .from('users_economy')
      .select('id')
      .eq('id', member.user.id)
      .single();

    if (!error && data) {
      // Eliminar usuario de la base de datos
      await client.db.supabase.from('users_economy').delete().eq('id', member.user.id);
      await client.db.supabase.from('antibots').delete().eq('user_id', member.user.id);
      console.log(`🗑️ Usuario ${member.user.username} eliminado de la base de datos (salió del servidor)`);
    }
  } catch (error) {
    console.error('❌ Error eliminando usuario que salió del servidor:', error);
  }
});

// Manejo de errores no capturados
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🔄 Cerrando bot...');
  if (client.db) {
    await client.db.close();
  }
  client.destroy();
  process.exit(0);
});

client.login(config.token);