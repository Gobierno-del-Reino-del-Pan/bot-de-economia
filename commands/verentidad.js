const { EmbedBuilder } = require('discord.js');
const CurrencyHelper = require('../utils/currencyHelper');
const ErrorHandler = require('../utils/errorHandler');

module.exports = {
  name: 'verentidad',
  aliases: ['ver-entidad', 'entity', 'entidad'],
  description: 'Ver información de entidades y empresas',

  async execute(message, args) {
    try {
      if (!args[0]) {
        return this.showEntitiesList(message);
      }

      const entidadId = args[0].toLowerCase();

      if (entidadId === 'gobierno') {
        return this.showGobierno(message);
      }

      // Buscar empresa por UUID o nombre
      const empresas = await message.client.db.getAllEmpresas();
      const empresa = empresas.find(e =>
        e.id === entidadId ||
        e.name.toLowerCase() === entidadId
      );

      if (empresa) {
        return this.showEmpresa(message, empresa);
      }

      return message.reply('❌ Entidad no encontrada. Usa `!verentidad` para ver las disponibles.');
    } catch (error) {
      await ErrorHandler.handleError(error, message, 'verentidad');
    }
  },

  async showEntitiesList(message) {
    const entidades = await message.client.db.getAllEntidades();
    const empresas = await message.client.db.getAllEmpresas();

    const embed = new EmbedBuilder()
      .setColor('#4169e1')
      .setTitle('🏛️ Entidades y Empresas del Reino')
      .setDescription('Selecciona una entidad para ver su información.')
      .setTimestamp();

    let entitiesInfo = '';

    for (const entidad of entidades) {
      entitiesInfo += `${entidad.emoji || '🏛️'} **${entidad.name}**\n`;
      entitiesInfo += `Comando: \`!verentidad ${entidad.id}\`\n`;
      entitiesInfo += `Balance: ${CurrencyHelper.format(entidad.balance)}\n\n`;
    }

    for (const empresa of empresas) {
      entitiesInfo += `${empresa.emoji || '🏢'} **${empresa.name}**\n`;
      entitiesInfo += `ID: \`${empresa.id}\`\n`;
      entitiesInfo += `Balance: ${CurrencyHelper.format(empresa.balance)}\n\n`;
    }

    embed.addFields({
      name: '📋 Disponibles',
      value: entitiesInfo || 'No hay entidades registradas.',
      inline: false
    });

    await message.reply({ embeds: [embed] });
  },

  async showGobierno(message) {
    const entidad = await message.client.db.getEntidad('gobierno');

    if (!entidad) {
      return message.reply('❌ Error: Gobierno del Reino no encontrado.');
    }

    const embed = new EmbedBuilder()
      .setColor('#8b5a2b')
      .setTitle(`${entidad.emoji || '🏛️'} ${entidad.name}`)
      .setDescription(entidad.description || 'Entidad gubernamental del Reino del Pan')
      .addFields(
        { name: '💰 Balance Actual', value: CurrencyHelper.format(entidad.balance), inline: true },
        { name: '📈 Total Recibido', value: CurrencyHelper.format(entidad.total_earned), inline: true },
        { name: '📉 Total Retirado', value: CurrencyHelper.format(entidad.total_withdrawn), inline: true }
      )
      .addFields({
        name: '💡 Comandos',
        value: '• `!dar gobierno <cantidad>` - Donar al gobierno',
        inline: false
      })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  },

  async showEmpresa(message, empresa) {
    const products = await message.client.db.getEmpresaProducts(empresa.id);
    const config = require('../config.json');

    const embed = new EmbedBuilder()
      .setColor('#1e3a8a')
      .setTitle(`${empresa.emoji || '🏢'} ${empresa.name}`)
      .setDescription(empresa.description || 'Sin descripcion')
      .addFields(
        { name: 'Balance', value: CurrencyHelper.format(empresa.balance), inline: true },
        { name: 'Propietario', value: `<@${empresa.owner_id}>`, inline: true }
      )
      .setTimestamp();

    if (products.length > 0) {
      const productsList = products.map(p =>
        `${p.emoji || '📦'} **${p.name}** (ID: \`${p.product_id}\`) - ${CurrencyHelper.format(p.price)} + IVA`
      ).join('\n');

      embed.addFields({
        name: `Productos (${products.length})`,
        value: productsList,
        inline: false
      });

      embed.addFields({
        name: 'Como Comprar',
        value: `Usa \`!entidad comprar ${empresa.name} <id>\` para comprar un producto.\n*IVA del ${config.iva}% se envia al Gobierno*`,
        inline: false
      });
    }

    await message.reply({ embeds: [embed] });
  }
};
