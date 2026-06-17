const { SlashCommandBuilder, EmbedBuilder, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reload')
    .setDescription('Recarga todos los comandos sin reiniciar el bot (Solo administradores)'),
  adminOnly: true,

  async execute(interaction) {
    if (!this.hasAdminPermission(interaction.member)) {
      return interaction.reply({ content: '❌ No tienes permisos para usar este comando.', ephemeral: true });
    }

    // Defer para tener más tiempo
    await interaction.deferReply();

    try {
      const startTime = Date.now();

      const commandsPath = path.join(__dirname, '../commands');
      const adminCommandsPath = path.join(__dirname, '../admincommands');

      // Verificar que las carpetas existan
      const commandFiles = fs.existsSync(commandsPath) ? 
        fs.readdirSync(commandsPath).filter(f => f.endsWith('.js')) : [];
      const adminCommandFiles = fs.existsSync(adminCommandsPath) ? 
        fs.readdirSync(adminCommandsPath).filter(f => f.endsWith('.js')) : [];

      // Limpiar cache de módulos
      const allFiles = [
        ...commandFiles.map(f => path.join(commandsPath, f)),
        ...adminCommandFiles.map(f => path.join(adminCommandsPath, f))
      ];

      allFiles.forEach(filePath => {
        if (fs.existsSync(filePath)) {
          delete require.cache[require.resolve(filePath)];
        }
      });

      // Limpiar comandos existentes
      interaction.client.commands.clear();

      let loadedCommands = 0;
      let loadedAdminCommands = 0;
      const failedCommands = [];

      // Recargar comandos normales
      for (const file of commandFiles) {
        try {
          const filePath = path.join(commandsPath, file);
          if (fs.existsSync(filePath)) {
            const command = require(filePath);
            if (command.name && command.execute) {
              interaction.client.commands.set(command.name, command);
              if (command.aliases) {
                command.aliases.forEach(alias => interaction.client.commands.set(alias, command));
              }
              loadedCommands++;
            }
          }
        } catch (error) {
          console.error(`Error cargando comando ${file}:`, error);
          failedCommands.push(`commands/${file}: ${error.message}`);
        }
      }

      // Recargar comandos admin
      for (const file of adminCommandFiles) {
        try {
          const filePath = path.join(adminCommandsPath, file);
          if (fs.existsSync(filePath)) {
            const command = require(filePath);
            if (command.data && command.execute) {
              // Para comandos slash, usar el nombre del data
              interaction.client.commands.set(command.name, command);
              interaction.client.commands.set(command.data.name, command);
              if (command.aliases) {
                command.aliases.forEach(alias => interaction.client.commands.set(alias, command));
              }
              loadedAdminCommands++;
            } else if (command.name && command.execute) {
              // Para comandos normales
              interaction.client.commands.set(command.name, command);
              if (command.aliases) {
                command.aliases.forEach(alias => interaction.client.commands.set(alias, command));
              }
              loadedAdminCommands++;
            }
          }
        } catch (error) {
          console.error(`Error cargando comando admin ${file}:`, error);
          failedCommands.push(`admincommands/${file}: ${error.message}`);
        }
      }

      // Recargar comando temporal
      try {
        const tempPath = path.join(__dirname, '../t.js');
        if (fs.existsSync(tempPath)) {
          delete require.cache[require.resolve(tempPath)];
          const tempCommand = require(tempPath);
          ['crea', 'borrar', 'desequipar', 'poner'].forEach(alias => {
            interaction.client.commands.set(alias, tempCommand);
          });
        }
      } catch (error) {
        console.error('Error cargando comandos temporales:', error);
        failedCommands.push(`t.js: ${error.message}`);
      }

      // Preparar comandos slash (solo los que tienen data)
      const slashCommands = [];
      
      // Recopilar comandos slash de ambas carpetas
      for (const file of commandFiles) {
        try {
          const filePath = path.join(commandsPath, file);
          if (fs.existsSync(filePath)) {
            const command = require(filePath);
            if (command.data && command.execute) {
              slashCommands.push(command.data.toJSON());
            }
          }
        } catch (error) {
          // Ignorar errores de comandos slash si no tienen data
        }
      }

      for (const file of adminCommandFiles) {
        try {
          const filePath = path.join(adminCommandsPath, file);
          if (fs.existsSync(filePath)) {
            const command = require(filePath);
            if (command.data && command.execute) {
              slashCommands.push(command.data.toJSON());
            }
          }
        } catch (error) {
          // Ignorar errores de comandos slash si no tienen data
        }
      }

      // Actualizar comandos slash si hay alguno
      if (slashCommands.length > 0) {
        try {
          const rest = new REST().setToken(config.token);
          await rest.put(Routes.applicationCommands(config.clientId), { body: slashCommands });
        } catch (error) {
          console.error('Error actualizando comandos slash:', error);
          failedCommands.push(`Slash commands: ${error.message}`);
        }
      }

      const reloadTime = Date.now() - startTime;

      const embed = new EmbedBuilder()
        .setColor(failedCommands.length > 0 ? '#ffaa00' : '#00ff00')
        .setTitle('🔄 Comandos Recargados')
        .setDescription('Proceso de recarga completado.')
        .addFields(
          { name: '⚙️ Comandos Normales', value: `${loadedCommands} cargados`, inline: true },
          { name: '🛡️ Comandos Admin (Slash)', value: `${loadedAdminCommands} cargados`, inline: true },
          { name: '⏱️ Tiempo', value: `${reloadTime}ms`, inline: true },
          { name: '⚡ Temporales', value: 'crea, borrar, desequipar, poner', inline: false },
          { name: '🔗 Slash Commands', value: `${slashCommands.length} comandos slash actualizados`, inline: false }
        )
        .setFooter({ text: `Recargado por ${interaction.user.username}` })
        .setTimestamp();

      if (failedCommands.length > 0) {
        embed.addFields({
          name: '⚠️ Errores Encontrados',
          value: failedCommands.slice(0, 5).join('\n').substring(0, 1024),
          inline: false
        });
      }

      await interaction.editReply({ embeds: [embed] });
      console.log(`✅ Comandos recargados por ${interaction.user.username} en ${reloadTime}ms`);
      
      if (failedCommands.length > 0) {
        console.log('⚠️ Errores durante la recarga:', failedCommands);
      }

    } catch (error) {
      console.error('❌ Error crítico recargando comandos:', error);
      
      const embed = new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('❌ Error al Recargar')
        .setDescription('Ocurrió un error crítico al recargar los comandos.')
        .addFields({ 
          name: 'Error', 
          value: error.message ? error.message.substring(0, 1024) : 'Error desconocido',
          inline: false 
        })
        .setTimestamp();
        
      await interaction.editReply({ embeds: [embed] });
    }
  },

  hasAdminPermission(member) {
    return member.permissions.has('Administrator');
  }
};