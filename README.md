# ReinoDelPan Economy Bot

Un bot de economía.

## Instalación

### Prerrequisitos
- **Node.js**

### Pasos de Instalación

1. **Instala las dependencias**
   ```bash
   npm install
   ```

2. **Configura el bot**
   ```bash
   # Renombra el archivo de configuración
   cp example.config.json config.json
   ```

3. **Configura la base de datos**

   **Configura Supabase:**

   1. Ve a [Supabase](https://supabase.com) y crea un nuevo proyecto
   2. En el dashboard, ve a Settings > API para obtener tu URL y claves
   3. Actualiza tu `config.json` con los datos de Supabase:
   ```json
   {
     "supabase": {
       "url": "https://tu-proyecto.supabase.co",
       "anonKey": "tu_anon_key_aqui"
     }
   }
   ```
   4. Crea un archivo `.env` con:
   ```env
   VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
   VITE_SUPABASE_ANON_KEY=tu_anon_key_aqui
   SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key_aqui
   ```

   5. **Ejecuta las siguientes migraciones SQL en Supabase:**

   Ve a SQL Editor en tu dashboard de Supabase y ejecuta:

   ```sql
   -- Tabla de economía de usuarios
   CREATE TABLE users_economy (
     id TEXT PRIMARY KEY,
     username TEXT,
     cash BIGINT DEFAULT 0,
     bank BIGINT DEFAULT 0,
     last_work BIGINT DEFAULT 0,
     last_rob BIGINT DEFAULT 0,
     last_slut BIGINT DEFAULT 0,
     last_crime BIGINT DEFAULT 0,
     total_earned BIGINT DEFAULT 0,
     total_spent BIGINT DEFAULT 0,
     collect_cooldowns JSONB DEFAULT '{}',
     inventory JSONB DEFAULT '[]',
     active_boosts JSONB DEFAULT '[]',
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW()
   );

   -- Tabla de préstamos
   CREATE TABLE prestamos (
     id SERIAL PRIMARY KEY,
     lender_id TEXT NOT NULL,
     borrower_id TEXT NOT NULL,
     loan_name TEXT NOT NULL,
     amount BIGINT NOT NULL,
     interest_rate DECIMAL(5,2) NOT NULL,
     daily_payment BIGINT NOT NULL,
     total_amount BIGINT NOT NULL,
     total_days INTEGER NOT NULL,
     start_date DATE NOT NULL,
     end_date DATE NOT NULL,
     status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'defaulted')),
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW()
   );

   -- Tabla del sistema anti-bot
   CREATE TABLE antibots (
     id SERIAL PRIMARY KEY,
     user_id TEXT UNIQUE NOT NULL,
     username TEXT NOT NULL,
     discord_account_created TIMESTAMPTZ,
     total_works INTEGER DEFAULT 0,
     work_intervals JSONB DEFAULT '[]',
     perfect_timing_count INTEGER DEFAULT 0,
     near_perfect_timing_count INTEGER DEFAULT 0,
     work_variance_score DECIMAL(5,2) DEFAULT 50.00,
     consistent_timing_streaks INTEGER DEFAULT 0,
     total_transfers INTEGER DEFAULT 0,
     transfer_recipients JSONB DEFAULT '[]',
     same_recipient_ratio DECIMAL(5,2) DEFAULT 0.00,
     total_deposits INTEGER DEFAULT 0,
     immediate_deposits_after_work INTEGER DEFAULT 0,
     deposit_all_pattern_count INTEGER DEFAULT 0,
     deposit_timing_variance DECIMAL(5,2) DEFAULT 50.00,
     robotic_deposit_score DECIMAL(5,2) DEFAULT 0.00,
     total_messages INTEGER DEFAULT 0,
     command_only_ratio DECIMAL(5,2) DEFAULT 0.00,
     social_interaction_score DECIMAL(5,2) DEFAULT 0.00,
     unique_channels_count INTEGER DEFAULT 0,
     voice_connections_count INTEGER DEFAULT 0,
     voice_activity_minutes DECIMAL(8,2) DEFAULT 0.00,
     last_voice_activity TIMESTAMPTZ,
     has_voice_activity BOOLEAN DEFAULT FALSE,
     voice_verification_score DECIMAL(5,2) DEFAULT 0.00,
     human_activity_markers JSONB DEFAULT '[]',
     suspicious_patterns JSONB DEFAULT '[]',
     suspicion_score DECIMAL(5,2) DEFAULT 0.00,
     confidence_level DECIMAL(5,2) DEFAULT 50.00,
     risk_level TEXT DEFAULT 'low' CHECK (risk_level IN ('safe', 'low', 'medium', 'high', 'critical')),
     is_verified_human BOOLEAN DEFAULT FALSE,
     verification_method TEXT,
     is_flagged BOOLEAN DEFAULT FALSE,
     alert_sent BOOLEAN DEFAULT FALSE,
     manual_review_requested BOOLEAN DEFAULT FALSE,
     first_activity TIMESTAMPTZ DEFAULT NOW(),
     last_activity TIMESTAMPTZ DEFAULT NOW()
   );

   -- Tabla del sistema de niveles
   CREATE TABLE user_levels (
     user_id TEXT PRIMARY KEY,
     username TEXT NOT NULL DEFAULT 'Usuario',
     xp BIGINT NOT NULL DEFAULT 0,
     level INTEGER NOT NULL DEFAULT 0,
     total_xp BIGINT NOT NULL DEFAULT 0,
     messages INTEGER NOT NULL DEFAULT 0,
     last_xp_gain BIGINT NOT NULL DEFAULT 0,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );

   -- Índices para mejor rendimiento
   CREATE INDEX idx_antibots_user_id ON antibots(user_id);
   CREATE INDEX idx_antibots_suspicion_score ON antibots(suspicion_score);
   CREATE INDEX idx_antibots_risk_level ON antibots(risk_level);
   CREATE INDEX idx_antibots_last_activity ON antibots(last_activity);
   CREATE INDEX idx_users_economy_cash ON users_economy(cash);
   CREATE INDEX idx_users_economy_total ON users_economy((cash + bank));
   CREATE INDEX idx_prestamos_borrower ON prestamos(borrower_id);
   CREATE INDEX idx_prestamos_status ON prestamos(status);
   CREATE INDEX idx_user_levels_total_xp ON user_levels(total_xp DESC);
   CREATE INDEX idx_user_levels_level ON user_levels(level DESC);

   -- Trigger para updated_at automático en user_levels
   CREATE OR REPLACE FUNCTION update_updated_at_column()
   RETURNS TRIGGER AS $$
   BEGIN
     NEW.updated_at = NOW();
     RETURN NEW;
   END;
   $$ LANGUAGE plpgsql;

   CREATE TRIGGER update_user_levels_updated_at
     BEFORE UPDATE ON user_levels
     FOR EACH ROW
     EXECUTE FUNCTION update_updated_at_column();

   -- Habilitar RLS (Row Level Security)
   ALTER TABLE users_economy ENABLE ROW LEVEL SECURITY;
   ALTER TABLE prestamos ENABLE ROW LEVEL SECURITY;
   ALTER TABLE antibots ENABLE ROW LEVEL SECURITY;
   ALTER TABLE user_levels ENABLE ROW LEVEL SECURITY;

   -- Políticas RLS (permitir todo para el service role)
   CREATE POLICY "Enable all operations for service role" ON users_economy
     FOR ALL USING (true);

   CREATE POLICY "Enable all operations for service role" ON prestamos
     FOR ALL USING (true);

   CREATE POLICY "Enable all operations for service role" ON antibots
     FOR ALL USING (true);

   CREATE POLICY "Enable all operations for service role" ON user_levels
     FOR ALL USING (true);

   -- Tabla de entidades (Gobierno del Reino)
   CREATE TABLE entidades (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     description TEXT,
     emoji TEXT DEFAULT '🏛️',
     balance BIGINT DEFAULT 0,
     total_earned BIGINT DEFAULT 0,
     total_withdrawn BIGINT DEFAULT 0,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
     is_public BOOLEAN DEFAULT true
   );

   -- Insertar Gobierno del Reino por defecto
   INSERT INTO entidades (id, name, description, emoji, balance, total_earned, is_public)
   VALUES ('gobierno', 'Gobierno del Reino', 'Entidad gubernamental del Reino del Pan', '🏛️', 0, 0, true);

   -- Habilitar RLS
   ALTER TABLE entidades ENABLE ROW LEVEL SECURITY;

   -- Políticas RLS
   CREATE POLICY "select_entidades" ON entidades FOR SELECT
     TO authenticated, anon USING (true);

   CREATE POLICY "insert_entidades" ON entidades FOR INSERT
     TO authenticated WITH CHECK (true);

   CREATE POLICY "update_entidades" ON entidades FOR UPDATE
     TO authenticated USING (true) WITH CHECK (true);

   -- Tabla de empresas (creadas por usuarios)
   CREATE TABLE empresas (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     owner_id TEXT NOT NULL,
     name TEXT NOT NULL,
     description TEXT,
     balance BIGINT DEFAULT 0,
     emoji TEXT DEFAULT '🏢',
     created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
     UNIQUE(owner_id, name)
   );

   -- Habilitar RLS
   ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;

   -- Políticas RLS
   CREATE POLICY "select_empresas" ON empresas FOR SELECT
     TO authenticated, anon USING (true);

   CREATE POLICY "insert_empresas" ON empresas FOR INSERT
     TO authenticated WITH CHECK (true);

   CREATE POLICY "update_empresas" ON empresas FOR UPDATE
     TO authenticated USING (true) WITH CHECK (true);

   CREATE POLICY "delete_empresas" ON empresas FOR DELETE
     TO authenticated USING (true);

   -- Tabla de productos/tienda de cada empresa
   CREATE TABLE entidad_shop (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
     product_id TEXT NOT NULL,
     name TEXT NOT NULL,
     description TEXT,
     price BIGINT NOT NULL DEFAULT 0,
     emoji TEXT DEFAULT '📦',
     category TEXT DEFAULT 'general',
     stackable BOOLEAN DEFAULT true,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
     UNIQUE(empresa_id, product_id)
   );

   -- Habilitar RLS
   ALTER TABLE entidad_shop ENABLE ROW LEVEL SECURITY;

   -- Políticas RLS
   CREATE POLICY "select_entidad_shop" ON entidad_shop FOR SELECT
     TO authenticated, anon USING (true);

   CREATE POLICY "insert_entidad_shop" ON entidad_shop FOR INSERT
     TO authenticated WITH CHECK (true);

   CREATE POLICY "update_entidad_shop" ON entidad_shop FOR UPDATE
     TO authenticated USING (true) WITH CHECK (true);

   CREATE POLICY "delete_entidad_shop" ON entidad_shop FOR DELETE
     TO authenticated USING (true);
   ```

4. **Inicia el bot**
   ```bash
   node .
   ```

## Estructura de Archivos

```
ReinoDelPan/
├── index.js                    # Entrada principal del bot
├── config.json                 # Configuración general
├── commands/                   # Comandos de usuario
│   ├── trabajar.js
│   ├── balance.js
│   ├── depositar.js
│   ├── retirar.js
│   ├── dar.js
│   ├── robar.js
│   ├── perfil.js
│   ├── ranking.js
│   ├── recolectar.js
│   ├── prestamos.js
│   ├── solicitar.js
│   ├── tienda.js
│   ├── inventario.js
│   ├── usar.js
│   ├── pancor.js
│   ├── verentidad.js
│   ├── ruleta.js
│   ├── blackjack.js
│   ├── tragaperras.js
│   ├── dados.js
│   ├── carrera.js
│   ├── ayuda.js
│   ├── nivel.js                # ← Sistema de niveles
│   └── topnivel.js             # ← Ranking de niveles
├── admincommands/              # Comandos de administración
│   ├── dar-dinero.js
│   ├── quitar-dinero.js
│   ├── permitwork.js
│   ├── denegarwork.js
│   ├── permitcasino.js
│   ├── denegarcasino.js
│   ├── advertencias.js
│   └── reload.js
├── database/
│   └── supabase.js             # Capa de base de datos
├── utils/
│   ├── antibotDetector.js
│   ├── currencyHelper.js
│   ├── errorHandler.js
│   ├── gameManager.js
│   ├── loanProcessor.js
│   ├── rateLimiter.js
│   └── levelManager.js         # ← Lógica XP y niveles
└── data/
    ├── shop.json
    ├── collect.json
    ├── prestamos.json
    ├── empresas.json
    ├── roulette_sessions.json
    └── levelrol.json            # ← Roles por nivel
```

## Sistema Anti-Bot

El bot incluye un sistema anti-bot que detecta comportamientos automatizados.

### Configuración Anti-Bot

En `config.json`:
```json
{
  "antibot": {
    "enabled": true,
    "webhook": "URL_DEL_WEBHOOK_DISCORD",
    "thresholds": {
      "alertScore": 75.0,
      "criticalScore": 90.0,
      "minAccountAge": 21,
      "maxPerfectTimingRatio": 85.0,
      "maxNearPerfectRatio": 95.0,
      "minWorkVariance": 15.0,
      "maxDepositAllRatio": 90.0,
      "maxRoboticDepositScore": 85.0,
      "maxCommandOnlyRatio": 98.0,
      "minSocialScore": 5.0,
      "maxConsistentStreaks": 15,
      "minBehavioralVariance": 20.0
    },
    "features": {
      "voiceVerification": true,
      "advancedPatternDetection": true,
      "depositPatternAnalysis": true,
      "socialBehaviorTracking": true,
      "autobanDisabled": true
    }
  }
}
```

### Características del Sistema

- **Detección Inteligente**: Analiza patrones de trabajo, depósitos, transferencias y actividad social
- **Verificación por Voz**: Los usuarios que se conectan a canales de voz son marcados como humanos
- **Puntuación Dinámica**: Sistema de puntuación de 0-100 basado en múltiples factores
- **Solo Alertas**: No banea automáticamente, solo envía alertas para revisión manual
- **Análisis Detallado**: Rastrea timing perfecto, varianza, patrones robóticos y más

## Sistema de Niveles

El bot incluye un sistema de XP que premia la actividad en el servidor.

### Cómo funciona

- Cada mensaje enviado fuera de comandos otorga entre **15 y 35 XP** de forma aleatoria
- Hay un **cooldown de 60 segundos** entre ganancias de XP para evitar spam
- La fórmula de XP necesaria para subir de nivel escala progresivamente: `100 × N^1.6`
- Al subir de nivel se anuncia en el canal y se asignan roles automáticamente

### Fórmula de progresión

| Nivel | XP para ese nivel | XP total acumulada |
|------:|-------------------:|--------------------:|
| 1     | 100                 | 100                  |
| 5     | 342                 | 1.105                |
| 10    | 794                 | 3.660                |
| 20    | 1.741               | 13.565               |
| 50    | 5.743               | 73.588                |
| 100   | 15.849              | 277.350               |

### Configurar Roles por Nivel

Edita `data/levelrol.json`:

```json
{
  "roles": [
    { "level": 5,  "roleId": "ID_DEL_ROL", "name": "Novato" },
    { "level": 10, "roleId": "ID_DEL_ROL", "name": "Aprendiz" },
    { "level": 20, "roleId": "ID_DEL_ROL", "name": "Veterano" },
    { "level": 30, "roleId": "ID_DEL_ROL", "name": "Experto" },
    { "level": 50, "roleId": "ID_DEL_ROL", "name": "Élite" },
    { "level": 75, "roleId": "ID_DEL_ROL", "name": "Leyenda" },
    { "level": 100, "roleId": "ID_DEL_ROL", "name": "Rey del Pan" }
  ]
}
```

## Configuración

Edita el archivo `config.json` con tus configuraciones:

```json
{
  "token": "TU_TOKEN_DEL_BOT",
  "prefix": "!",
  "supabase": {
    "url": "https://tu-proyecto.supabase.co",
    "anonKey": "tu_anon_key_aqui"
  },
  "currency": {
    "emoji": "<:paneda:1411495854661042237>"
  },
  "casino": {
    "minBet": 10,
    "maxBet": 10000
  }
}
```

## Comandos

### Economía Básica
- **`!balance [@usuario]`** - Ver dinero actual (efectivo y banco)
- **`!trabajar`** - Trabajar para ganar dinero *(cooldown: 1 hora)*
- **`!recolectar`** - Recolectar dinero por roles *(cooldown variable)*
- **`!perfil [@usuario]`** - Ver perfil económico completo
- **`!ranking`** - Ver top 10 usuarios más ricos

### Gestión Bancaria
- **`!depositar <cantidad>`** - Depositar dinero al banco
- **`!retirar <cantidad>`** - Retirar dinero del banco
- **`!dar <@usuario> <cantidad>`** - Enviar dinero a otro usuario
- **`!robar <@usuario>`** - Intentar robar dinero a otro usuario

### Préstamos
- **`!prestamos`** - Ver todos los préstamos disponibles y tu estado actual
- **`!solicitar <id>`** - Solicitar un préstamo específico

### Niveles
- **`!nivel [@usuario]`** - Ver tu nivel actual o el de otro usuario
- **`!topnivel`** - Ver el top 10 de usuarios con más nivel

## Casino

### Juegos Disponibles
- **Ruleta** - `!ruleta <cantidad> <tipo>` - Ruleta grupal en tiempo real
- **Blackjack** - `!blackjack <cantidad>` - Juego de blackjack completo
- **Tragaperras** - `!tragaperras <cantidad>` - Máquinas tragamonedas
- **Dados** - `!dados <número> <cantidad>` - Lanzar dados (1-6)
- **Carrera** - `!carrera <cantidad>` - Carrera de caballos

## Tienda e Inventario

### Comandos de Tienda
- **`!tienda`** - Ver todos los items disponibles
- **`!tienda comprar <id>`** - Comprar un item específico
- **`!inventario [@usuario]`** - Ver inventario de items
- **`!usar <inventory_id>`** - Equipar roles o activar potenciadores

## Empresas y Entidades

### Pancor.co
- **`!pancor`** - Ver todas las empresas de Pancor.co
- **`!pancor <empresa>`** - Ver tienda de una empresa específica
- **`!pancor comprar <id>`** - Comprar producto empresarial

### Entidades
- **`!verentidad`** - Ver entidades disponibles
- **`!verentidad <nombre>`** - Ver información detallada de una entidad
- **`!dar pancor.co <cantidad>`** - Donar a Pancor.co
- **`!dar gobierno <cantidad>`** - Donar al gobierno
- **`!entidadretirar <cantidad>`** - Retirar fondos de entidad (Solo fundadores)

## Comandos Bancarios (Solo Banqueros)

- **`!bancoprestar <cantidad> <@usuario> <interés%> <días>`** - Otorgar préstamo manual
- **`!bancostatus <@usuario>`** - Ver estado financiero de un usuario para evaluación

## Comandos de Administración

### Gestión de Economía
- **`!dar-dinero <@usuario> <cantidad>`** - Otorgar dinero a un usuario
- **`!quitar-dinero <@usuario> <cantidad>`** - Quitar dinero a un usuario
- **`!reload`** - Recarga los comandos sin tener que reiniciar el bot

### Gestión de Canales
- **`!permitwork <#canal>`** - Permitir comandos de trabajo en un canal
- **`!denegarwork <#canal>`** - Denegar comandos de trabajo en un canal
- **`!permitcasino <#canal>`** - Permitir comandos de casino en un canal
- **`!denegarcasino <#canal>`** - Denegar comandos de casino en un canal

### Sistema Anti-Bot
- **`!advertencias`** - Ver usuarios con comportamiento sospechoso
- **`!advertencias <id>`** - Ver análisis detallado de un usuario específico

## Ayuda

- **`!ayuda`** - Lista completa de comandos disponibles

---

# Información Adicional

## Opciones de Cantidad
En los comandos que requieren cantidad puedes usar:
- **Números específicos**: `1000`, `500`, `250`
- **Todo el efectivo**: `todo`, `all`
- **Mitad del efectivo**: `mitad`, `half`

## Tipos de Apuestas en Ruleta

### Apuestas Simples (Pago x2)
- **Color**: `rojo`, `red`, `negro`, `black` - Colores de los números
- **Paridad**: `par`, `even`, `impar`, `odd` - Números pares o impares
- **Rango**: `alto`, `high` (19-36), `bajo`, `low` (1-18) - Rangos de números

### Apuestas Directas (Pago x36)
- **Números específicos**: `0` a `36`

## Tipos de Items
- **Alimentos**: Items consumibles del reino
- **Roles**: Roles equipables con privilegios especiales
- **Potenciadores**: Boosts temporales con efectos únicos
- **Caballos**: Caballos para competir en carreras

## Rareza de Items
- **Common** *(Gris)* - Probabilidad alta
- **Uncommon** *(Verde)* - Probabilidad media-alta
- **Rare** *(Azul)* - Probabilidad media
- **Epic** *(Púrpura)* - Probabilidad baja
- **Legendary** *(Dorado)* - Probabilidad muy baja
- **Mythic** *(Rojo)* - Probabilidad extremadamente baja

### Configuración de Roles Admin

En `config.json`, configura los roles que pueden usar comandos de administración:
```json
{
  "staffRoles": [
    "ID_ROL_STAFF_1",
    "ID_ROL_STAFF_2"
  ],
  "bankerRoles": [
    "ID_ROL_BANQUERO_1",
    "ID_ROL_BANQUERO_2"
  ]
}
```

### Configuración de Canales Permitidos

El bot incluye un sistema de permisos de canales. Edita `data/permitchannels.json`:

```json
{
  "workChannels": [
    "ID_CANAL_TRABAJO_1",
    "ID_CANAL_TRABAJO_2"
  ],
  "casinoChannels": [
    "ID_CANAL_CASINO_1",
    "ID_CANAL_CASINO_2"
  ]
}
```

- **workChannels**: Canales donde funcionan comandos como `!trabajar`, `!recolectar`, etc.
- **casinoChannels**: Canales donde funcionan comandos de casino como `!ruleta`, `!blackjack`, etc.

## Personalización

### Configurar Roles de Recolección

Edita `data/collect.json`:

```json
{
  "categories": {
    "trabajadores": {
      "name": "Trabajadores",
      "cooldown": 28800000,
      "amount": 1000,
      "emoji": "👷",
      "roles": ["ID_DEL_ROL_1", "ID_DEL_ROL_2"]
    },
    "moderadores": {
      "name": "Moderadores",
      "cooldown": 21600000,
      "amount": 2000,
      "emoji": "🛡️",
      "roles": ["ID_DEL_ROL_MOD"]
    }
  }
}
```

### Configurar Empresas

Edita `data/empresas.json` para agregar nuevas empresas a Pancor.co:

```json
{
  "pancor": {
    "name": "Pancor.co",
    "empresas": {
      "nueva_empresa": {
        "name": "Nueva Empresa",
        "description": "Descripción de la empresa",
        "emoji": "🏪",
        "type": "tienda",
        "tienda": [
          {
            "id": "prod001",
            "name": "Producto Nuevo",
            "description": "Descripción del producto",
            "price": 1000,
            "emoji": "📦",
            "category": "categoria",
            "stackable": true
          }
        ]
      }
    }
  }
}
```

### Configurar Items de Tienda

Edita `data/shop.json`:

```json
{
  "items": [
    {
      "id": "nuevo_item",
      "name": "Nombre del Item",
      "description": "Descripción detallada del item",
      "price": 1000,
      "type": "food|role|boost|horse",
      "emoji": "🎯",
      "rarity": "common|uncommon|rare|epic|legendary|mythic",
      "role_id": "ID_DEL_ROL"
    }
  ]
}
```

### Configurar Préstamos

Edita `data/prestamos.json` para agregar nuevos tipos de préstamos:

```json
{
  "loans": [
    {
      "id": "5",
      "name": "Préstamo Personalizado",
      "description": "Descripción del préstamo",
      "amount": 25000,
      "days": 45,
      "emoji": "💎",
      "requirements": {
        "minTotalEarned": 75000,
        "maxDebtRatio": 1.3
      }
    }
  ]
}
```

### Configurar Moneda Personalizada

En `config.json`:
```json
{
  "currency": {
    "emoji": "<:paneda:1411495854661042237>",
    "name": "Panedas"
  }
}
```

### Límites del Casino

En `config.json`:
```json
{
  "casino": {
    "minBet": 10,
    "maxBet": 10000,
    "rouletteTimeout": 30000
  },
  "economy": {
    "workMin": 100,
    "workMax": 500,
    "workCooldown": 3600000,
    "robCooldown": 7200000,
    "robChance": 30
  }
}
```

## Nuevas Funcionalidades

### Sistema de Niveles y XP
- Gana XP por escribir en cualquier canal del servidor
- Sube de nivel con una curva de progresión que escala
- Desbloquea roles automáticamente al alcanzar ciertos niveles
- Ranking global con `!topnivel`

### Sistema de Entidades Corporativas
- **Pancor.co**: Corporación con múltiples empresas
- **Gobierno**: Entidad gubernamental que recibe IVA
- Donaciones y retiros de fondos
- Seguimiento financiero completo

### Sistema de Préstamos Avanzado
- Préstamos automáticos del banco
- Préstamos manuales entre usuarios (banqueros)
- Pagos diarios automáticos
- Sistema de cualificación crediticia

### Sistema Anti-Bot Inteligente
- Detección de patrones automatizados
- Verificación por actividad de voz
- Análisis de comportamiento social
- Solo alertas (sin auto-ban)

### Gestión de Canales
- Canales específicos para trabajo
- Canales específicos para casino
- Control granular de permisos

### Potenciadores y Protecciones
- **Adicto al Café**: Trabajar sin cooldown
- **Mejor Prevenir que Curar**: Protección contra pérdidas
- **Loco de la Recolección**: Cooldowns reducidos
- Seguros de casino de Pancor.co

**Estado del proyecto:** En desarrollo

---

## Créditos

**Desarrollado por:** Rexy