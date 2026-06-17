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
          name: 'рҹ’° EconomГӯa',
          value: `\`${config.prefix}balance\` - Ver tu dinero (efectivo y banco)
\`${config.prefix}trabajar\` - Trabajar para ganar dinero
\`${config.prefix}slut\` - Trabajar como prostituta (riesgoso)
\`${config.prefix}crime\` - Cometer crГӯmenes (muy riesgoso)
\`${config.prefix}recolectar\` - Recolectar dinero por roles
\`${config.prefix}perfil\` - Ver perfil econГіmico completo
\`${config.prefix}ranking\` - Ver top 10 usuarios mГЎs ricos
\`${config.prefix}topcash\` - Ver top 10 usuarios con mГЎs efectivo`,
          inline: false
        },
        {
          name: 'рҹҸҰ Banco',
          value: `\`${config.prefix}depositar <cantidad>\` - Depositar dinero al banco
\`${config.prefix}retirar <cantidad>\` - Retirar dinero del banco
\`${config.prefix}dar <@usuario> <cantidad>\` - Enviar dinero a otro usuario
\`${config.prefix}robar <@usuario>\` - Intentar robar dinero
**Opciones:** \`todo\`/\`all\`, \`half\`, o cantidad especГӯfica`,
          inline: false
        },
        {
          name: 'рҹҸҰ PrГ©stamos',
          value: `\`${config.prefix}prestamos\` - Ver prГ©stamos disponibles y estado
\`${config.prefix}solicitar <id>\` - Solicitar un prГ©stamo
\`${config.prefix}pagarprestamo\` - Pagar todos tus prГ©stamos anticipadamente`,
          inline: false
        },
        {
          name: 'рҹҺ° Casino',
          value: `\`${config.prefix}ruleta <cantidad> <tipo>\` - Ruleta grupal
\`${config.prefix}tragaperras <cantidad>\` - MГЎquinas tragamonedas
\`${config.prefix}blackjack <cantidad>\` - Jugar blackjack
\`${config.prefix}dados <nГәmero> <cantidad>\` - Lanzar dados
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
          name: 'рҹҸӣпёҸ Gobierno',
          value: `\`${config.prefix}gobierno\` - Ver el estado financiero del Gobierno del Reino
\`${config.prefix}gobierno dar <cantidad|all|todo>\` - Donar dinero en efectivo al gobierno`,
          inline: false
        },
        {
          name: 'рҹҹў Empresas y Entidades',
          value: `\`${config.prefix}entidad <empresa> tienda\` - Ver tienda de una empresa
\`${config.prefix}entidad comprar <empresa> <id>\` - Comprar de empresa (IVA va al Gobierno)
\`${config.prefix}verentidad [nombre]\` - Ver info de una entidad
\`${config.prefix}crear entidad\` - Crear nueva entidad/empresa`,
          inline: false
        },
        {
          name: 'рҹҸҰ Comandos Bancarios (Solo Banqueros)',
          value: `\`${config.prefix}bancoprestar <cantidad> <@usuario> <interГ©s%> <dГӯas>\` - Otorgar prГ©stamo manual
\`${config.prefix}bancostatus <@usuario>\` - Ver estado financiero de un usuario`,
          inline: false
        }
      );

    await message.reply({ embeds: [embed] });
  }
};