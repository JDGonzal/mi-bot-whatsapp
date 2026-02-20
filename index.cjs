const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const Tesseract = require('tesseract.js');
const dotenv = require('dotenv');
dotenv.config();
const ADODB = require('node-adodb');
ADODB.debug = true;

// ==== Definición del servicio API con express =====
const app = express();
const port = process.env.PORT || 3000;
app.use(express.json());

// ===== Estado por usuario =====
const estados = new Map();

let isQRRecharged = false;
let client = null; // el cliente será creado por startClient(), no al cargar el módulo

// ==== Formato de mensajes en pantalla =====
function consoleLog(type, ...args) {
  const timestamp = new Date().toLocaleTimeString();
  const prefix =
    {
      info: 'ℹ️ ',
      warn: '⚠️ ',
      error: '❌',
      check: '✅',
      save: '💾',
      send: '➡️',
      recive: '⬅️ ',
      idea: '💡',
      find: '🔍',
      retry: '🔂',
      stopwatch: '⏱️ ',
      hourglass: '⏳',
      phone: '☎️ ',
      eyes: '👀',
      photo: '📷',
      end: '🔚',
      chart: '📊',
      qr: '🔳',
      access: '🅰️ ',
    }[type] || type;
  console.log(`${prefix} [${timestamp}]`, ...args);
}

// ====== Enviar Mensajes directos =====
async function enviarMensajeDirecto(numero, texto) {
  try {
    // Limpiamos el número por si acaso (quitar espacios o signos +)
    const numeroLimpio = numero.replace(/\D/g, '');
    const chatId = `${numeroLimpio}@c.us`;

    // Verificamos si el número está registrado en WhatsApp antes de enviar
    const esValido = await client.isRegisteredUser(chatId);

    if (esValido) {
      await client.sendMessage(chatId, texto);
      if (!numeroLimpio.includes('3173450213')) {
        consoleLog('send', `Mensaje enviado a ${numeroLimpio}`);
      }
    } else {
      consoleLog('idea', `Registra este número en WhatsApp: ${numeroLimpio}`);
    }
  } catch (err) {
    consoleLog('error', 'Error al enviar mensaje:', err);
  }
}

// ===== Configuración ADODB =====
const ADODB_DATA_SOURCE =
  process.env.ADODB_DATA_SOURCE || 'C:\\temp\\DINASTIA.accdb';
let connection = ADODB.open(
  `Provider=Microsoft.ACE.OLEDB.16.0;Data Source=${ADODB_DATA_SOURCE};Persist Security Info=False;`,
);

// ===== Función para crear la tabla "celulares" =====
async function crearTablaCelulares() {
  const createTableQuery = `
CREATE TABLE CELULARES (
    ID AUTOINCREMENT PRIMARY KEY,
    MESSAGE_FROM VARCHAR(32) NOT NULL,
    USER_NAME VARCHAR(64) NOT NULL,
    CELLPHONE DOUBLE UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP 
);`;

  await connection
    .query(createTableQuery)
    .then(() => consoleLog('check', 'Tabla "CELULARES" creada.'))
    .catch((err) => {
      msg = err?.process?.message ?? String(err);
      if (msg.toLowerCase().includes('already exists'))
        consoleLog('check', 'Tabla "CELULARES" Lista.');
      else if (msg.toLowerCase().includes('object is closed'))
        consoleLog('check', 'Tabla "CELULARES" creada.');
      else consoleLog('error', msg);
    });
  // Syntax error in CREATE TABLE statement.
  // Table 'CELULARES' already exists.
}

// ===== Función para crear la tabla "celulares" =====
async function crearTablaRegistros() {
  const createTableQuery = `
CREATE TABLE REGISTROS (
    IDUNIX VARCHAR(15) NOT NULL,
    CELLPHONE DOUBLE NOT NULL,
    BONO INT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP,
    CONSTRAINT PK_REGISTROS PRIMARY KEY (CELLPHONE, BONO)
);`;

  await connection
    .query(createTableQuery)
    .then(() => consoleLog('check', 'Tabla "REGISTROS" creada.'))
    .catch((err) => {
      msg = err?.process?.message ?? String(err);
      if (msg.toLowerCase().includes('already exists'))
        consoleLog('check', 'Tabla "REGISTROS" Lista.');
      else if (msg.toLowerCase().includes('object is closed'))
        consoleLog('check', 'Tabla "REGISTROS" creada.');
      else consoleLog('error', msg);
    });
  // Syntax error in CREATE TABLE statement.
  // Table 'CELULARES' already exists.
}

// ===== Prueba de conexión a la base de datos =====
async function probarConexionMSAccess() {
  const testQuery = 'SELECT 1 AS ok';
  try {
    const test = await connection.query(testQuery);
    consoleLog('check', 'Conexión exitosa a MSAccess:', test);
    const timestamp = new Date().toLocaleTimeString();
    let msg = `${timestamp}`;
    if (isQRRecharged) {
      msg = `QR Recargado - ${timestamp}`;
      isQRRecharged = false;
    }
    //! VARIABLES DE AMBIENTE
    //* consoleLog(process.env.SystemRoot) // =C:\WINDOWS
    await crearTablaCelulares();
    await crearTablaRegistros();
    await enviarMensajeDirecto('573173450213', msg);
    return true;
  } catch (err) {
    msg = err?.process?.message ?? String(err);
    consoleLog('access', 'Verificando conexión MSAccess, porque:\n', msg);
    await connection
      .query(testQuery)
      .then((data) => consoleLog('check', 'Conexión exitosa a MSAccess:', data))
      .catch((err) => consoleLog('error', err));
    process.exit(0);
  }
}

// Funciones en MSAccess
async function VerificarCelularEnBaseDeDatos(from) {
  const query1 = `SELECT COUNT(*) AS [Found] 
    FROM [CELULARES] 
    WHERE [MESSAGE_FROM] = '${from}';`;
  const query2 = `SELECT TOP 1 * 
    FROM [CELULARES] 
    WHERE [MESSAGE_FROM] = '${from}';`;
  const estado = estados.get(from);
  if ((await from) === 'status@broadcast') {
    estados.delete(from);
    return [{ CELLPHONE: 0, USER_NAME: 'Broadcast' }];
  }
  try {
    const result = await connection.query(query1);
    if (result[0]?.Found > 0) {
      const data = await connection.query(query2);
      return data;
    } else {
      if (await estado?.esperandoCelular) return;
      consoleLog(
        'find',
        'Número celular no hallado en la base de datos:',
        result,
      );
      return null;
    }
  } catch (err) {
    if (await estado?.esperandoCelular) return;
    consoleLog('error', 'Error verificando número en la base de datos:', err);
    return null;
  }
}

async function VerificarRegistrosEnBaseDeDatos(from) {
  const { cellphone, numeros, unixTimestamp } = estados.get(from);
  const query = `SELECT * 
    FROM [REGISTROS] 
    WHERE [CELLPHONE] = ${cellphone}
    AND ([BONO] IN (${numeros.join(',')})
    OR [IDUNIX] >= '${unixTimestamp}');`;

  const estado = estados.get(from);
  try {
    const data = await connection.query(query);

    if (!data[0]) {
      if (await estado?.esperandoConfirmacion) return;
      consoleLog('error', 'Números no encontrados en la base de datos:', data);
      return null;
    }
    return data;
  } catch (err) {
    if (await estado?.esperandoConfirmacion) return;
    consoleLog('error', 'Error verificando números en la base de datos:', err);
    return null;
  }
}

async function guardarCelularEnBaseDeDatos(from, nombreUsuario, celular) {
  const insertQuery = `
INSERT INTO [CELULARES] ([MESSAGE_FROM], [USER_NAME], [CELLPHONE])
    VALUES ('${from}', '${nombreUsuario}', ${celular});`;

  try {
    await connection.query(insertQuery);
    consoleLog('check', `Celular ${celular} guardado en la base de datos.`);
    return true;
  } catch (err) {
    if (await VerificarCelularEnBaseDeDatos(from)) {
      return true;
    } else {
      consoleLog(
        'error',
        `Error guardando celular en la base de datos: ${err}`,
      );
      return false;
    }
  }
}

async function guardarRegistrosEnBaseDeDatos(from) {
  let estado = estados.get(from);
  if (!estado || !estado.numeros || !estado.cellphone) {
    consoleLog('error', 'Estado incompleto para guardar registros:', {
      from,
      estado,
    });
    return false;
  }

  consoleLog('1️⃣ ', 'Números (inicio):', estado.numeros.join(', '));

  // Trabajamos sobre una copia para evitar problemas al modificar la lista mientras iteramos
  const snapshot = Array.isArray(estado.numeros) ? [...estado.numeros] : [];

  for (const num of snapshot) {
    const unixTimestamp = Math.floor(Date.now());
    const cleaned = (num || '').toString().trim();
    const insertQuery = `INSERT INTO [REGISTROS] ([IDUNIX],[CELLPHONE],[BONO]) VALUES ('${unixTimestamp}', ${estado.cellphone}, ${cleaned});`;

    consoleLog('2️⃣ ', 'sql:', insertQuery);

    try {
      const data = await connection.query(insertQuery);
      consoleLog('3️⃣ ', 'MSAccess OK:', data);
    } catch (err) {
      const msg = err?.process?.message ?? String(err);

      // Si es un duplicado, actualizamos el estado eliminando ese número y continuamos
      if (typeof msg === 'string' && msg.toLowerCase().includes('duplicate')) {
        // Re-lee el estado actual del Map por si cambió mientras iterábamos
        const current = estados.get(from) || estado;
        const updatedNumeros = (current.numeros || []).filter((n) => n !== num);
        estados.set(from, { ...current, numeros: updatedNumeros });
        consoleLog('4️⃣ ', 'Duplicado detectado, eliminado del estado:', num);
        consoleLog(
          '5️⃣ ',
          'Números actuales (post-eliminación):',
          updatedNumeros.join(', '),
        );
        // Actualiza variable local para reflejar el cambio en esta iteración
        estado = estados.get(from) || estado;
        continue;
      }
      if (!msg.toLowerCase().includes('object is closed')) {
        consoleLog('error', msg);
      }
    }
  }
  return true;
}

// ===== Eventos del cliente y lógica de reinicio resiliente =====
// Constantes de control
const READY_TIMEOUT_MS = Number(process.env.READY_TIMEOUT_MS) || 45_000; // tiempo máximo para esperar 'ready'
const RESTART_BASE_MS = Number(process.env.RESTART_BASE_MS) || 5_000; // backoff base
const RESTART_MAX_MS = Number(process.env.RESTART_MAX_MS) || 60_000;

let readyTimer = null;
let restartAttempts = 0;
let shuttingDownClient = false;

function createClientInstance() {
  try {
    return new Client({
      authStrategy: new LocalAuth(),
      puppeteer: {
        headless: true,
        executablePath:
          process.env.CHROME_PATH ||
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    });
  } catch (err) {
    consoleLog('error', 'Error creando instancia de Client:', err);
  }
}

function clearReadyTimer() {
  if (readyTimer) {
    clearTimeout(readyTimer);
    readyTimer = null;
  }
}

function scheduleRestart(reason) {
  try {
    if (shuttingDownClient) return;
    restartAttempts++;
    const delay = Math.min(
      RESTART_MAX_MS,
      RESTART_BASE_MS * 2 ** (restartAttempts - 1),
    );
    consoleLog(
      'retry',
      `Reiniciando cliente por: "${reason}". Intento ${restartAttempts} en ${delay}ms`,
    );
    setTimeout(() => startClient(), delay);
  } catch (err) {
    consoleLog('error', 'Error en scheduleRestart:', err);
  }
}

async function safeDestroyClient() {
  if (!client) return;
  try {
    shuttingDownClient = true;
    client.removeAllListeners();
    await client.destroy();
  } catch (err) {
    consoleLog('error', 'Error destroying client:', err);
  } finally {
    client = null;
    shuttingDownClient = false;
  }
}

// ===== Función OCR =====
async function leerNumeros(buffer) {
  const result = await Tesseract.recognize(buffer, 'eng', {
    tessedit_char_whitelist: '0123456789',
  });
  consoleLog('eyes', 'Leyendo imagen...');
  const texto = result.data.text;
  return texto.match(/\d+/g);
}

function attachClientHandlers(c) {
  // QR
  c.on('qr', (qr) => {
    console.clear();
    isQRRecharged = true;
    consoleLog('qr', 'Escanea este QR con tu WhatsApp:');
    qrcode.generate(qr, { small: true });
    const timestamp = new Date().toLocaleTimeString();
    consoleLog('hourglass', `[${timestamp}] QR generado, esperando escaneo...`);
  });

  // Ready
  c.on('ready', async () => {
    clearReadyTimer();
    restartAttempts = 0;
    consoleLog('check', 'Bot listo y conectado a WhatsApp.');
    try {
      await probarConexionMSAccess();
    } catch (err) {
      consoleLog('error', 'Error en probarConexionMSAccess:', err);
    }
  });

  // Auth failure
  c.on('auth_failure', (msg) => {
    try {
      clearReadyTimer();
      consoleLog('🔐', 'auth_failure:', msg);
      safeDestroyClient().then(() => scheduleRestart('auth_failure'));
    } catch (err) {
      consoleLog('error', 'Error en auth_failure handler:', err);
    }
  });

  // Disconnected
  c.on('disconnected', (reason) => {
    try {
      clearReadyTimer();
      consoleLog('📴', 'disconnected:', reason);
      safeDestroyClient().then(() => scheduleRestart('disconnected'));
    } catch (err) {
      consoleLog('error', 'Error en disconnected handler:', err);
    }
  });

  // Optional state change log
  c.on('change_state', (state) => {
    consoleLog('chart', 'Estado del cliente de WhatsApp:', state);
  });

  // Message handler (se mantiene la lógica original)
  c.on('message', async (msg) => {
    consoleLog(
      'recive',
      `Mensaje recibido de '${msg.from}': "${msg.body || msg.caption || '[media]'}" (hasMedia: ${msg.hasMedia})`,
    );
    const texto = msg.body;
    const numeros = texto.match(/\d+/g);
    const estado = estados.get(msg.from);
    const data = await VerificarCelularEnBaseDeDatos(msg.from);

    if (data) {
      if (
        numeros &&
        !estado?.esperandoCelular &&
        !estado?.esperandoConfirmacion &&
        !msg.from !== 'status@broadcast'
      ) {
        consoleLog(
          'phone',
          `Celular número: '${data[0]?.CELLPHONE}' de "${data[0]?.USER_NAME}"`,
        );
        estados.set(msg.from, {
          esperandoConfirmacion: true,
          numeros,
          texto,
          cellphone: data[0]?.CELLPHONE,
          username: data[0]?.USER_NAME || 'Desconocido',
          unixTimestamp: Math.floor(Date.now()),
        });
        consoleLog('#️⃣ ', `Números detectados: ${numeros.join(', ')}`);
        return msg.reply(
          `#️⃣  Números detectados: ${numeros.join(', ')}\n\n¿Están correctos? S/N`,
        );
      }
    }

    if (
      !estado?.esperandoCelular &&
      !estado?.esperandoConfirmacion &&
      msg.from !== 'status@broadcast'
    ) {
      // Verificamos primer si existe el número celular
      if (!data || data[0]?.Found === 0) {
        estados.set(msg.from, {
          esperandoCelular: true,
          cellphone: null,
          username: msg._data.notifyName || 'Desconocido',
        });
        return msg.reply(
          '¡Hola! \n🖐️No estás registrado.\nPor favor, envía tu número de celular para registrarte.',
        );
      }
    }

    if (msg.body.toLowerCase() === 'hola') {
      return msg.reply(
        '¡Hola! \n➡️Por favor digita los números de las boletas separados por comas o envía una imagen con los números visibles en forma horizontal.',
      );
    }
    // ===== Caso: esperando confirmación =====
    if (await estado?.esperandoConfirmacion) {
      const respuesta = msg.body.trim().toLowerCase();

      if (
        respuesta === 's' ||
        respuesta === 'si' ||
        respuesta === 'y' ||
        respuesta === 'yes'
      ) {
        if (await guardarRegistrosEnBaseDeDatos(msg.from)) {
          const data = await VerificarRegistrosEnBaseDeDatos(msg.from);
          const numerosGuardados = data.map((item) => item?.BONO);
          consoleLog(
            'save',
            `Confirmado. Guardado de '${estado.cellphone}' los números: ${numerosGuardados.join(', ')}`,
          );
          await msg.reply(
            `💾 Confirmado.\nGuardado de ${estado.cellphone} los números:\n* ${numerosGuardados.join('\n* ')}\nNúmero que no esté en esta lista es por ser duplicado o haberse guardado previamente.\n\n⚠️La validación final estará sujeta a revisiones manuales posteriores.`,
          );
          estados.delete(msg.from);
          return true;
        }
      }
      if (respuesta === 'n' || respuesta === 'no') {
        consoleLog(
          'warn',
          `Usuario '${estado.username}' indicó que los números no son correctos, estado reiniciado.`,
        );
        estados.delete(msg.from);
        return msg.reply(
          '💡 *Sugerencia*:\n1️⃣ Mejora la imagen y envía de nuevo.\n2️⃣ O digita la lista de números separados por comas.',
        );
      }

      return msg.reply('✏️ Responde S o N');
    }

    // ===== Caso: esperando celular =====
    if (await estado?.esperandoCelular) {
      const regexCelular = /^\d{10}$/; // Ajusta el rango según tus necesidades
      const celular = msg.body.trim().toLowerCase();

      if (
        regexCelular.test(celular) &&
        !isNaN(celular) &&
        celular.length === 10 &&
        celular[0] === '3'
      ) {
        estados.set(msg.from, {
          esperandoCelular: true,
          cellphone: celular,
          username: msg._data.notifyName || 'Desconocido',
        });
        const { cellphone, username } = estados.get(msg.from);
        if (await guardarCelularEnBaseDeDatos(msg.from, username, cellphone)) {
          consoleLog(
            'save',
            `Confirmado. Guardado de "${username}" con celular '${cellphone}'`,
          );
          estados.delete(msg.from);
        } else {
          return msg.reply(
            '❌ Error guardando el número en la base de datos. Intenta de nuevo más tarde.',
          );
        }
      } else {
        return msg.reply(
          '⚠️ Número de celular no válido. Por favor, envía un número de 10 dígitos, sin espacios, sin guiones. \nEjemplo: 3876543210',
        );
      }

      return msg.reply(
        '💾 Confirmado. Guardado. \n\n➡️ Ahora puedes enviar los números de las boletas o una imagen con los números visibles en forma horizontal.',
      );
    }

    // ===== Caso: mensaje con imagen =====
    if (msg.hasMedia && msg.from !== 'status@broadcast') {
      try {
        consoleLog('photo', 'Mensaje con imagen detectado, descargando media...');
        const media = await msg.downloadMedia();
        const buffer = Buffer.from(media.data, 'base64');

        const numeros = await leerNumeros(buffer);

        if (!numeros) {
          return msg.reply('🚨 No detecté números en la imagen');
        }

        estados.set(msg.from, {
          esperandoConfirmacion: true,
          numeros,
          buffer,
        });
        consoleLog('info', `Números detectados: ${numeros.join(', ')}`);
        return msg.reply(
          `ℹ️ Números detectados: ${numeros.join(', ')}\n\n❔¿Están correctos? S/N`,
        );
      } catch (err) {
        consoleLog('error', 'Error leyendo la imagen');
        consoleLog('error', err);
        msg.reply('❌ Error leyendo la imagen');
      }
    }
  });
}

function startClient() {
  try {
    if (client) {
      consoleLog('error', 'Cliente ya existe, ignorando start');
      return;
    }

    client = createClientInstance();
    attachClientHandlers(client);
  } catch (err) {
    consoleLog('error', 'Error en startClient:', err);
    return;
  }
  // Inicializa el cliente y establece un timer que reiniciará si no llega 'ready'
  try {
    client.initialize();
  } catch (err) {
    consoleLog('error', 'Error al inicializar client:', err);
    safeDestroyClient().then(() => scheduleRestart('initialize_error'));
    return;
  }
  try {
    clearReadyTimer();
    readyTimer = setTimeout(() => {
      if (!client) return;
      consoleLog(
        'stopwatch',
        `No llegó 'ready' en ${READY_TIMEOUT_MS}ms — reiniciando cliente.`,
      );
      safeDestroyClient().then(() => scheduleRestart('ready_timeout'));
    }, READY_TIMEOUT_MS);
  } catch (err) {
    consoleLog('error', 'Error en ready timeout setup:', err);
  }
}

// Si ya existe alguna implementación de handler de mensaje grande en el archivo, la renombramos
// Copia la gran función inline de `client.on('message', ...)` a `handleIncomingMessage` más abajo en el archivo.

startClient();

// Manejo de cierre del proceso
process.on('SIGINT', async () => {
  consoleLog('end', 'Deteniendo servidor...');
  connection = null; // Liberamos la conexión a la base de datos por seguridad
  await safeDestroyClient();
  process.exit(0);
});

// ==== Rutas de API Express
/**
 * *GET '/'
 *
 * @param {} none or empty
 * @returns {string} shows active server
 */
app.get('/', (req, res) => {
  res.send('Servidor de WhatsApp funcionando 🚀');
});

/**
 * *POST '/enviar-alerta'
 *
 * @param {string} numero - telephone number
 * @param {string} mensaje - Text to send
 * @returns {string} status - answer
 */
app.post('/enviar-alerta', async (req, res) => {
  const { numero, mensaje } = req.body;
  await enviarMensajeDirecto(numero, mensaje);
  res.json({ status: 'Procesado' });
});

// ==== Escucha de Server API de express ===
app.listen(port, () => {
  consoleLog('check', `Servidor Express corriendo en http://localhost:${port}`);
});
