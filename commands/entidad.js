const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const CurrencyHelper = require('../utils/currencyHelper');
const ErrorHandler = require('../utils/errorHandler');

module.exports = {
  name: 'entidad',
  aliases: ['empresa'],
  description: 'Comprar productos de empresas con IVA',

  async execute(message, args) {
    try {
      if (!args[0]) {
        return this.showHelp(message);
      }

      const subcommand = args[0].toLowerCase();

      if (subcommand === 'comprar') {
        return this.buyFromEntity(message, args.slice(1));
      }

      // !entidad <nombre> tienda
      if (args[1] && args[1].toLowerCase() === 'tienda') {
        return this.showEntityShop(message, subcommand);
      }

      // !entidad <nombre> → mostrar info de la entidad/empresa
      return this.showEntityInfo(message, subcommand);
    } catch (error) {
      await ErrorHandler.handleError(error, message, 'entidad');
    }
  },

  async showHelp(message) {
    const embed = new EmbedBuilder()
      .setColor('#4169e1')
      .setTitle('Sistema de Entidades')
      .setDescription('Compra productos directamente de las empresas del Reino.')
      .addFields({
        name: 'Como usar',
        value: '`!entidad comprar <empresa> <id>` - Comprar un producto de una empresa',
        inline: false
      })
      .addFields({
        name: 'Nota sobre IVA',
        value: `Las compras en empresas aplican un IVA del **${config.iva}%** que se envia al Gobierno del Reino. El resto del dinero va a la empresa.`,
        inline: false
      })
      .addFields({
        name: 'Ejemplo',
        value: '`!entidad comprar miempresa prod01`',
        inline: false
      })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  },

  async buyFromEntity(message, args) {
    try {
      if (!args[0] || !args[1]) {
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('Argumentos Faltantes')
          .setDescription('Debes especificar la empresa y el ID del producto.')
          .addFields({
            name: 'Uso correcto',
            value: '`!entidad comprar <empresa> <id>`',
            inline: false
          })
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      const empresaName = args[0].toLowerCase();
      const productId = args[1].toLowerCase();

      // Buscar la empresa por nombre o ID
      const empresas = await message.client.db.getAllEmpresas();
      const empresa = empresas.find(e =>
        e.id === empresaName ||
        e.name.toLowerCase() === empresaName ||
        e.name.toLowerCase().includes(empresaName)
      );

      if (!empresa) {
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('Empresa No Encontrada')
          .setDescription('No encontre ninguna empresa con ese nombre.')
          .addFields({
            name: 'Empresas disponibles',
            value: empresas.length > 0
              ? empresas.map(e => `• ${e.name} (ID: \`${e.id}\`)`).join('\n')
              : 'No hay empresas registradas.',
            inline: false
          })
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      // Buscar el producto en la empresa
      const products = await message.client.db.getEmpresaProducts(empresa.id);
      const product = products.find(p =>
        p.product_id === productId ||
        p.id === productId
      );

      if (!product) {
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('Producto No Encontrado')
          .setDescription(`No encontre el producto **${productId}** en **${empresa.name}**.`)
          .addFields({
            name: 'Productos disponibles',
            value: products.length > 0
              ? products.map(p => `• ${p.emoji || '📦'} **${p.name}** (ID: \`${p.product_id}\`) - ${CurrencyHelper.format(p.price)}`).join('\n')
              : 'Esta empresa no tiene productos.',
            inline: false
          })
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      const user = await message.client.db.getUser(message.author.id, message.author.username);

      // Calcular precio con IVA
      const basePrice = product.price;
      const ivaRate = config.iva || 33;
      const ivaAmount = Math.floor(basePrice * (ivaRate / 100));
      const finalPrice = basePrice + ivaAmount;

      if (user.cash < finalPrice) {
        return ErrorHandler.handleInsufficientFundsError(
          message,
          CurrencyHelper.format(finalPrice),
          CurrencyHelper.format(user.cash)
        );
      }

      // Procesar la compra
      // 1. Descontar dinero al usuario
      await message.client.db.updateUser(message.author.id, {
        cash: user.cash - finalPrice,
        total_spent: user.total_spent + finalPrice
      });

      // 2. Enviar IVA al gobierno
      if (ivaAmount > 0) {
        await message.client.db.addToGobierno(ivaAmount);
        console.log(`[ENTIDAD] +${ivaAmount} IVA al gobierno`);
      }

      // 3. Enviar resto a la empresa
      console.log(`[ENTIDAD] Enviando ${basePrice} a empresa ${empresa.name}. Balance actual: ${empresa.balance}`);
      await message.client.db.updateEmpresa(empresa.id, {
        balance: empresa.balance + basePrice
      });
      console.log(`[ENTIDAD] Nuevo balance empresa: ${empresa.balance + basePrice}`);

      // 4. Agregar item al inventario del usuario
      const inventoryItem = {
        inventory_id: this.generateInventoryId(),
        id: product.product_id,
        empresa_id: empresa.id,
        empresa_name: empresa.name,
        name: product.name,
        type: 'entidad_item',
        quantity: 1,
        price_paid: finalPrice,
        purchased_at: new Date().toISOString()
      };

      const updatedInventory = [...user.inventory, inventoryItem];
      await message.client.db.updateUser(message.author.id, {
        inventory: updatedInventory
      });

      // Embed de confirmacion
      const embed = new EmbedBuilder()
        .setColor('#27ae60')
        .setTitle('Compra Exitosa')
        .setDescription(`Has comprado **${product.name}** de **${empresa.name}**.`)
        .addFields(
          { name: 'Producto', value: `${product.emoji || '📦'} ${product.name}`, inline: true },
          { name: 'Empresa', value: `${empresa.emoji || '🏢'} ${empresa.name}`, inline: true },
          { name: 'ID Inventario', value: `\`${inventoryItem.inventory_id}\``, inline: true },
          { name: 'Precio Base', value: CurrencyHelper.format(basePrice), inline: true },
          { name: `IVA (${ivaRate}%)`, value: CurrencyHelper.format(ivaAmount), inline: true },
          { name: 'Total Pagado', value: CurrencyHelper.format(finalPrice), inline: true }
        )
        .addFields({
          name: 'Desglose',
          value: `• ${CurrencyHelper.format(ivaAmount)} enviados al **Gobierno del Reino** (IVA)\n• ${CurrencyHelper.format(basePrice)} enviados a **${empresa.name}**`,
          inline: false
        })
        .setFooter({ text: `Balance restante: ${CurrencyHelper.format(user.cash - finalPrice)}` })
        .setTimestamp();

      await message.reply({ embeds: [embed] });

    } catch (error) {
      await ErrorHandler.handleError(error, message, 'compra entidad');
    }
  },

  async showEntityShop(message, entityName) {
    try {
      const empresas = await message.client.db.getAllEmpresas();
      const empresa = empresas.find(e =>
        e.id === entityName ||
        e.name.toLowerCase() === entityName ||
        e.name.toLowerCase().includes(entityName)
      );

      if (!empresa) {
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('Entidad No Encontrada')
          .setDescription(`No existe ninguna empresa llamada **${entityName}**.`)
          .addFields({
            name: 'Empresas disponibles',
            value: empresas.length > 0
              ? empresas.map(e => `• ${e.emoji || '🏢'} **${e.name}**`).join('\n')
              : 'No hay empresas registradas.',
            inline: false
          })
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      const products = await message.client.db.getEmpresaProducts(empresa.id);
      const ivaRate = config.iva || 33;

      const embed = new EmbedBuilder()
        .setColor('#4169e1')
        .setTitle(`${empresa.emoji || '🏢'} Tienda de ${empresa.name}`)
        .setDescription(empresa.description || 'Productos de esta empresa.')
        .setTimestamp();

      if (products.length === 0) {
        embed.addFields({ name: 'Sin productos', value: 'Esta empresa no tiene productos disponibles.', inline: false });
      } else {
        const productList = products.map(p =>
          `**ID:** \`${p.product_id}\` | ${p.emoji || '📦'} **${p.name}** | ${CurrencyHelper.format(p.price)} + IVA ${ivaRate}% = ${CurrencyHelper.format(p.price + Math.floor(p.price * ivaRate / 100))}\n*${p.description || ''}*`
        ).join('\n\n');

        embed.addFields({ name: '🛍️ Productos', value: productList, inline: false });
      }

      embed.addFields({
        name: '💡 Cómo Comprar',
        value: `Usa \`!entidad comprar ${empresa.name.toLowerCase()} <id>\``,
        inline: false
      });

      await message.reply({ embeds: [embed] });
    } catch (error) {
      await ErrorHandler.handleError(error, message, 'entidad tienda');
    }
  },

  async showEntityInfo(message, entityName) {
    try {
      // Buscar primero en empresas
      const empresas = await message.client.db.getAllEmpresas();
      const empresa = empresas.find(e =>
        e.id === entityName ||
        e.name.toLowerCase() === entityName ||
        e.name.toLowerCase().includes(entityName)
      );

      if (empresa) {
        const products = await message.client.db.getEmpresaProducts(empresa.id);
        const embed = new EmbedBuilder()
          .setColor('#4169e1')
          .setTitle(`${empresa.emoji || '🏢'} ${empresa.name}`)
          .setDescription(empresa.description || 'Empresa del Reino del Pan')
          .addFields(
            { name: '💰 Balance', value: CurrencyHelper.format(empresa.balance), inline: true },
            { name: '📦 Productos', value: `${products.length} producto(s)`, inline: true }
          )
          .addFields({
            name: '🛍️ Ver tienda',
            value: `Usa \`!entidad ${empresa.name.toLowerCase()} tienda\``,
            inline: false
          })
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      // Si no es empresa, buscar en entidades
      const entidad = await message.client.db.getEntidad(entityName);
      if (entidad) {
        const embed = new EmbedBuilder()
          .setColor('#1a3a6b')
          .setTitle(`${entidad.emoji || '🏛️'} ${entidad.name}`)
          .setDescription(entidad.description || '')
          .addFields(
            { name: '💰 Balance', value: CurrencyHelper.format(entidad.balance), inline: true },
            { name: '📈 Total Recaudado', value: CurrencyHelper.format(entidad.total_earned), inline: true },
            { name: '📉 Total Retirado', value: CurrencyHelper.format(entidad.total_withdrawn), inline: true }
          )
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      const embed = new EmbedBuilder()
        .setColor('#ff6b6b')
        .setTitle('Entidad No Encontrada')
        .setDescription(`No existe ninguna entidad o empresa llamada **${entityName}**.`)
        .setTimestamp();
      return message.reply({ embeds: [embed] });

    } catch (error) {
      await ErrorHandler.handleError(error, message, 'entidad info');
    }
  },

  generateInventoryId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < 3; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
};
