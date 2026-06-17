const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');

module.exports = {
  name: 'ayuda',
  aliases: ['help', 'comandos'],
  description: 'Muestra todos los comandos disponibles',
  
  async execute(message, args) {
    const embed = new EmbedBuilder()
      .setColor('#00bfff')
      .setTitle('Comandos de ReinoDelPan Bot')
      .setDescription(`Todos los comandos usan el prefix \`${config.prefix}\``)
      .addFields(
        {
          name: '💰 Economía',
          value: `\`${config.prefix}balance\` - Ver tu dinero (efectivo y banco)
\`${config.prefix}trabajar\` - Trabajar para ganar dinero
\`${config.prefix}slut\` - Trabajar como prostituta (riesgoso)
\`${config.prefix}crime\` - Cometer crímenes (muy riesgoso)
\`${config.prefix}recolectar\` - Recolectar dinero por roles
\`${config.prefix}perfil\` - Ver perfil económico completo
\`${config.prefix}ranking\` - Ver top 10 usuarios más ricos
\`${config.prefix}topcash\` - Ver top 10 usuarios con más efectivo`,
          inline: false
        },
        {
          name: '🏦 Banco',
          value: `\`${config.prefix}depositar <cantidad>\` - Depositar dinero al banco
\`${config.prefix}retirar <cantidad>\` - Retirar dinero del banco
\`${config.prefix}dar <@usuario> <cantidad>\` - Enviar dinero a otro usuario
\`${config.prefix}robar <@usuario>\` - Intentar robar dinero
**Opciones:** \`todo\`/\`all\`, \`half\`, o cantidad específica`,
          inline: false
        },
        {
          name: '🏦 Préstamos',
          value: `\`${config.prefix}prestamos\` - Ver préstamos disponibles y estado
\`${config.prefix}solicitar <id>\` - Solicitar un préstamo
\`${config.prefix}pagarprestamo\` - Pagar todos tus préstamos anticipadamente`,
          inline: false
        },
        {
          name: '🎰 Casino',
          value: `\`${config.prefix}ruleta <cantidad> <tipo>\` - Ruleta grupal
\`${config.prefix}tragaperras <cantidad>\` - Máquinas tragamonedas
\`${config.prefix}blackjack <cantidad>\` - Jugar blackjack
\`${config.prefix}dados <número> <cantidad>\` - Lanzar dados
\`${config.prefix}carrera <cantidad>\` - Carrera de caballos`,
          inline: false
        },
        {
          name: 'Tienda e Inventario',
          value: `\`${config.prefix}tienda\` - Ver tienda del reino
\`${config.prefix}tienda comprar <id>\` - Comprar un item (dinero al gobierno)
\`${config.prefix}inventario\` - Ver inventario
\`${config.prefix}usar <id>\` - Usar potenciadores o equipar roles`,
          inline: false
        },
        {
          name: 'Empresas y Entidades',
          value: `\`${config.prefix}verentidad [nombre]\` - Ver info de una entidad
\`${config.prefix}entidad comprar <empresa> <id>\` - Comprar de empresa (IVA incluido)
\`${config.prefix}crear entidad\` - Crear nueva entidad/empresa`,
          inline: false
        },
        {
          name: '🏦 Comandos Bancarios (Solo Banqueros)',
          value: `\`${config.prefix}bancoprestar <cantidad> <@usuario> <interés%> <días>\` - Otorgar préstamo manual
\`${config.prefix}bancostatus <@usuario>\` - Ver estado financiero de un usuario`,
          inline: false
        }
      );

    await message.reply({ embeds: [embed] });
  }
};
