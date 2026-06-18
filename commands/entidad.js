const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const CurrencyHelper = require('../utils/currencyHelper');
const ErrorHandler = require('../utils/errorHandler');

module.exports = {
  name: 'entidad',
  aliases: ['empresa'],
  description: 'Gestiona empresas: lista, detalle, tienda y compras',

  async execute(message, args) {
    try {
      if (!args[0]) {
        return this.showEntityList(message);
      }

      const firstArg = args[0].toLowerCase();

      if (firstArg === 'comprar') {
        return this.buyFromEntity(message, args.slice(1));
      }

      if (args[1] && args[1].toLowerCase().trim() === 'tienda') {
        return this.showEntityShop(message, args[0]);
      }

      return this.showEntityInfo(message, firstArg);
    } catch (error) {
      await ErrorHandler.handleError(error, message, 'entidad');
    }
  },

  // ─── LISTA ──────────────────────────────────────────────────────────
  async showEntityList(message) {
    const empresas = await message.client.db.getAllEmpresas();
    const entidades = await message.client.db.getAllEntidades();

    const embed = new EmbedBuilder()
      .setColor('#4169e1')
      .setTitle('🏛️ Entidades y Empresas del Reino')
      .setDescription('Selecciona una para ver su información detallada.')
      .setFooter({ text: 'Usa !entidad <nombre> para ver detalles y !tienda <nombre> para ver la tienda.' })
      .setTimestamp();

    let list = '';

    if (empresas.length > 0) {
      list += '**🏢 Empresas**\n';
      for (const emp of empresas) {
        list += `${emp.emoji || '🏢'} **${emp.name}** — Balance: ${CurrencyHelper.format(emp.balance)}\n`;
        list += `└ Para ver detalles: \`!entidad ${emp.name}\`\n`;
        list += `└ Para ver tienda: \`!tienda ${emp.name}\`\n\n`;
      }
    }

    if (entidades.length > 0) {
      list += '**🏛️ Entidades Públicas**\n';
      for (const ent of entidades) {
        list += `${ent.emoji || '🏛️'} **${ent.name}** — Balance: ${CurrencyHelper.format(ent.balance)}\n`;
        list += `└ Para ver detalles: \`!entidad ${ent.id}\`\n\n`;
      }
    }

    if (!list) list = 'No hay empresas ni entidades registradas.';

    embed.addFields({ name: '📋 Disponibles', value: list, inline: false });
    await message.reply({ embeds: [embed] });
  },

  // ─── DETALLE ──────────────────────────────────────────────────────
  async showEntityInfo(message, entityName) {
    try {
      const empresas = await message.client.db.getAllEmpresas();
      const empresa = empresas.find(e =>
        e.id === entityName ||
        e.name.toLowerCase() === entityName ||
        e.name.toLowerCase().includes(entityName)
      );

      if (empresa) {
        const products = await message.client.db.getEmpresaProducts(empresa.id);
        const embed = new EmbedBuilder()
          .setColor('#3498db')
          .setTitle(`${empresa.emoji || '🏢'} ${empresa.name}`)
          .setDescription(empresa.description || 'Empresa del Reino del Pan')
          .addFields(
            { name: '💰 Balance', value: CurrencyHelper.format(empresa.balance), inline: true },
            { name: '👤 Propietario', value: `<@${empresa.owner_id}>`, inline: true },
            { name: '📦 Productos', value: `${products.length} producto(s)`, inline: true }
          )
          .addFields({
            name: '🛒 Comandos útiles',
            value: `• Para donar a esta empresa: \`!dar ${empresa.name.toLowerCase()} <cantidad>\`\n• Para ver la tienda: \`!tienda ${empresa.name.toLowerCase()}\``,
            inline: false
          })
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

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
        .setTitle('❌ Entidad No Encontrada')
        .setDescription(`No existe ninguna entidad o empresa llamada **${entityName}**.`)
        .addFields({
          name: '💡 Ver lista',
          value: 'Usa `!entidad` para ver todas las disponibles.',
          inline: false
        })
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    } catch (error) {
      await ErrorHandler.handleError(error, message, 'entidad info');
    }
  },

  // ─── TIENDA ──────────────────────────────────────────────────────
  async showEntityShop(message, entityName) {
    try {
      const empresas = await message.client.db.getAllEmpresas();
      const empresa = empresas.find(e =>
        e.id === entityName ||
        e.name.toLowerCase() === entityName.toLowerCase() ||
        e.name.toLowerCase().includes(entityName.toLowerCase())
      );

      if (!empresa) {
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('🏢 Empresa No Encontrada')
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
      const embed = new EmbedBuilder()
        .setColor('#f1c40f')
        .setTitle(`🛒 Tienda de ${empresa.name}`)
        .setDescription(empresa.description || 'Productos disponibles para comprar.')
        .setTimestamp();

      if (products.length === 0) {
        embed.addFields({
          name: '📦 Sin Productos',
          value: 'Esta empresa aún no ha agregado productos a su tienda.',
          inline: false
        });
      } else {
        const productList = products.map(p => {
          const stockDisplay = p.stock !== null ? `${p.stock} unidades` : '∞ (ilimitado)';
          return `**${p.emoji || '📦'} ${p.name}**\n` +
                 `└ ID: \`${p.product_id}\` · Precio: ${CurrencyHelper.format(p.price)} · Stock: ${stockDisplay}\n` +
                 (p.description ? `└ *${p.description}*\n` : '');
        }).join('\n');

        embed.addFields({
          name: `📋 Productos (${products.length})`,
          value: productList,
          inline: false
        });
      }

      embed.addFields({
        name: '💡 Cómo comprar',
        value: `Usa \`!entidad comprar ${empresa.name.toLowerCase()} <ID> [cantidad]\``,
        inline: false
      });

      await message.reply({ embeds: [embed] });
    } catch (error) {
      await ErrorHandler.handleError(error, message, 'entidad tienda');
    }
  },

  // ─── COMPRAR (con IVA redondeado al alza y mensajes simplificados) ──
  async buyFromEntity(message, args) {
    try {
      if (!args[0] || !args[1]) {
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('❌ Argumentos Faltantes')
          .setDescription('Debes especificar la empresa y el ID del producto, y opcionalmente la cantidad.')
          .addFields({
            name: 'Uso correcto',
            value: '`!entidad comprar <empresa> <id> [cantidad]`',
            inline: false
          })
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      const empresaName = args[0].toLowerCase();
      const productId = args[1].toLowerCase();
      let quantity = 1;
      if (args[2]) {
        const parsed = parseInt(args[2]);
        if (isNaN(parsed) || parsed < 1) {
          const embed = new EmbedBuilder()
            .setColor('#ff6b6b')
            .setTitle('❌ Cantidad Inválida')
            .setDescription('La cantidad debe ser un número entero positivo.')
            .setTimestamp();
          return message.reply({ embeds: [embed] });
        }
        quantity = parsed;
      }

      const empresas = await message.client.db.getAllEmpresas();
      const empresa = empresas.find(e =>
        e.id === empresaName ||
        e.name.toLowerCase() === empresaName ||
        e.name.toLowerCase().includes(empresaName)
      );

      if (!empresa) {
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('🏢 Empresa No Encontrada')
          .setDescription('No encontré ninguna empresa con ese nombre.')
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

      // ── Obtener todos los productos y buscar por ID (case-insensitive) ──
      const allProducts = await message.client.db.getEmpresaProducts(empresa.id);
      const product = allProducts.find(p => p.product_id.toLowerCase() === productId);

      if (!product) {
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('📦 Producto No Encontrado')
          .setDescription(`No encontré el producto **${args[1]}** en **${empresa.name}**.`)
          .addFields({
            name: 'Productos disponibles',
            value: allProducts.length > 0
              ? allProducts.map(p => `• ${p.emoji || '📦'} **${p.name}** (ID: \`${p.product_id}\`) - ${CurrencyHelper.format(p.price)} (Stock: ${p.stock ?? '∞'})`).join('\n')
              : 'Esta empresa no tiene productos.',
            inline: false
          })
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      // ── Stock ──
      if (product.stock !== null && product.stock !== undefined && product.stock < quantity) {
        const embed = new EmbedBuilder()
          .setColor('#ff6b6b')
          .setTitle('⚠️ Stock Insuficiente')
          .setDescription(`No hay suficiente stock de **${product.name}**.`)
          .addFields(
            { name: 'Solicitado', value: `${quantity}`, inline: true },
            { name: 'Disponible', value: `${product.stock}`, inline: true }
          )
          .setTimestamp();
        return message.reply({ embeds: [embed] });
      }

      const user = await message.client.db.getUser(message.author.id, message.author.username);

      // ── Cálculo con IVA redondeado al alza ──
      const basePrice = product.price;
      const ivaRate = config.iva || 33;
      const ivaUnitario = Math.ceil(basePrice * (ivaRate / 100)); // Siempre hacia arriba
      const unitTotal = basePrice + ivaUnitario;
      const finalPrice = unitTotal * quantity;
      const totalIVA = ivaUnitario * quantity;
      const totalEmpresa = basePrice * quantity;

      if (user.cash < finalPrice) {
        return ErrorHandler.handleInsufficientFundsError(
          message,
          CurrencyHelper.format(finalPrice),
          CurrencyHelper.format(user.cash)
        );
      }

      // ── Procesar pago ──
      await message.client.db.updateUser(message.author.id, {
        cash: user.cash - finalPrice,
        total_spent: user.total_spent + finalPrice
      });

      if (totalIVA > 0) {
        await message.client.db.addToGobierno(totalIVA);
        console.log(`[ENTIDAD] +${totalIVA} IVA al gobierno`);
      }

      await message.client.db.updateEmpresa(empresa.id, {
        balance: (empresa.balance || 0) + totalEmpresa
      });
      console.log(`[ENTIDAD] Enviando ${totalEmpresa} a empresa ${empresa.name}. Nuevo balance: ${(empresa.balance || 0) + totalEmpresa}`);

      // ── Actualizar stock ──
      if (product.stock !== null) {
        const newStock = product.stock - quantity;
        await message.client.db.updateProductStock(empresa.id, product.product_id, newStock);
      }

      // ── Inventario ──
      const existingIndex = user.inventory.findIndex(
        item => item.empresa_id === empresa.id && item.id === product.product_id
      );
      let updatedInventory = [...user.inventory];
      if (existingIndex !== -1) {
        updatedInventory[existingIndex].quantity += quantity;
      } else {
        const inventoryItem = {
          inventory_id: this.generateInventoryId(),
          id: product.product_id,
          empresa_id: empresa.id,
          empresa_name: empresa.name,
          name: product.name,
          type: 'entidad_item',
          quantity: quantity,
          price_paid: unitTotal,
          purchased_at: new Date().toISOString()
        };
        updatedInventory.push(inventoryItem);
      }
      await message.client.db.updateUser(message.author.id, { inventory: updatedInventory });

      // ── Embed de confirmación (sin emojis en los nombres de campos) ──
      const embed = new EmbedBuilder()
        .setColor('#27ae60')
        .setTitle('✅ Compra Exitosa')
        .setDescription(`Has comprado **${quantity}** x **${product.name}** de **${empresa.name}**.`)
        .addFields(
          { name: 'Producto', value: `${product.emoji || '📦'} ${product.name}`, inline: true },
          { name: 'Cantidad', value: `${quantity}`, inline: true },
          { name: 'Empresa', value: `${empresa.emoji || '🏢'} ${empresa.name}`, inline: true },
          { name: 'Precio base (c/u)', value: CurrencyHelper.format(basePrice), inline: true },
          { name: 'IVA', value: CurrencyHelper.format(ivaUnitario), inline: true },
          { name: 'Total pagado', value: CurrencyHelper.format(finalPrice), inline: true }
        )
        .setFooter({ text: `💰 Balance restante: ${CurrencyHelper.format(user.cash - finalPrice)}` })
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch (error) {
      await ErrorHandler.handleError(error, message, 'compra entidad');
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