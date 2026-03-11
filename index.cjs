const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const Tesseract = require('tesseract.js');
const dotenv = require('dotenv');
dotenv.config();
const ADODB = require('node-adodb');
ADODB.debug = true;
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

// === Owner Phone Number: 3173450213 ===
const country = (19 * 3).toString();
const ownerPhone =
  (35 * 9 + 2).toString() + (23 * 150).toString() + (71 * 3).toString();
// ==== Definición del servicio API con express =====
const app = express();
app.use(express.json());

// ==== Variables globales y estructuras de datos =====
const PORT = process.env.PORT || 3000;
const ADODB_DATA_SOURCE =
  process.env.ADODB_DATA_SOURCE || 'C:\\temp\\DINASTIA.accdb';
const CHROME_PATH = process.env.CHROME_PATH;
const READY_TIMEOUT_MS = Number(process.env.READY_TIMEOUT_MS) || 45_000; // tiempo máximo para esperar 'ready'
const RESTART_BASE_MS = Number(process.env.RESTART_BASE_MS) || 5_000; // backoff base
const RESTART_MAX_MS = Number(process.env.RESTART_MAX_MS) || 60_000;
const REGISTRY_VALUE = process.env.REGISTRY_VALUE;
const REGISTRY_ALL = process.env.REGISTRY_ALL;
// ===== Estado por usuario =====
/**
 * @typedef {Object} UserState
 * @property {string} cellphone
 * @property {string} username
 * @property {Array<string|number>} numeros
 * @property {number} unixTimestamp
 * @property {boolean} [esperandoCelular]
 * @property {boolean} [esperandoConfirmacion]
 * @property {* } [buffer]
 * @property {string} [texto]
 */

/** @type {Map<string, UserState>} */
const statesMemory = new Map();

let isQRRecharged = false;
let client = null; // el cliente será creado por startClient(), no al cargar el módulo

// Crear archivo de log al iniciar: YYYYMMddHHmmss.log en la carpeta del script
function nowFilenameTs(now = new Date()) {
  const unixTimestamp = Math.floor(now);
  const pad = (n) => String(n).padStart(2, '0');
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `z${timestamp}`;
}
const logFileName = `${nowFilenameTs()}.log`;
const logFilePath = path.join(__dirname, logFileName);
try {
  // crea el archivo vacío (si ya existe, se sobrescribe con contenido vacío)
  fs.writeFileSync(logFilePath, '', { flag: 'w' });
} catch (e) {
  console.error('No se pudo crear archivo de log:', e);
}

// ==== Formato de mensajes en pantalla =====
function consoleLog(type, ...args) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const prefix =
    {
      i_: 'ℹ️',
      w_: '⚠️',
      e_: '❌',
      k_: '✅',
      s_: '💾',
      u_: '🔼',
      d_: '🔽',
      b_: '💡',
      f_: '🔍',
      r_: '🔂',
      w_: '⏱️',
      g_: '⏳',
      p_: '☎️',
      y_: '👀',
      t_: '📷',
      n_: '🔚',
      c_: '📊',
      q_: '🔳',
      a_: '🅰️',
      m_: '#️⃣',
      h_: '❤️',
    }[type] || type;
  console.log(`${prefix} [${timestamp}]`, ...args);
  // También guardar una línea en el archivo de log creado al iniciar
  try {
    const serialize = args
      .map((a) => {
        if (typeof a === 'string') return a;
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      })
      .join(' ');
    const line = `${prefix} [${timestamp}] ${serialize}\n`;
    fs.appendFile(logFilePath, line, (err) => {
      if (err) {
        // no interrumpe la ejecución por fallo de escritura
        console.error('Error escribiendo log en archivo:', err);
      }
    });
  } catch (e) {
    // ignore
  }
}

// == Leer Registros del regedit
async function readRegistry(value = REGISTRY_VALUE, rootkey = REGISTRY_ALL) {
  // Si no viene rootkey o value, no hay nada que leer
  if (!rootkey || !value) {
    consoleLog('w_', 'Faltan parámetros de ruta o valor del registro');
    return null;
  }

  // Descomponer la ruta en segmentos
  const allPath = rootkey.match(/[^\\/]+/g) || [];
  const regPath = allPath.join('\\');

  return new Promise((resolve) => {
    const args = ['query', regPath, '/v', value];
    execFile('reg', args, (err, stdout, stderr) => {
      if (err) {
        consoleLog('e_', 'Error leyendo el registro:', {
          message: err.message,
          code: err && err.code,
          stderr,
        });
        return resolve(null);
      }

      const parsedNumbers = stdout.match(/0x[0-9A-Fa-f]+|\d+/g) || [];
      const stdoutArray = String(stdout).trim().split(/\s+/);
      const result = { stdout: stdoutArray, parsed: parsedNumbers };
      resolve(result);
    });
  });
}

async function writeRegistry(
  data,
  value = REGISTRY_VALUE,
  rootkey = REGISTRY_ALL,
) {
  if (!rootkey || !value) {
    consoleLog('w_', 'Faltan parámetros de ruta o valor del registro');
    return null;
  }
  const allPath = rootkey.match(/[^\\/]+/g) || [];
  const regPath = allPath.join('\\');

  return new Promise((resolve) => {
    const args = [
      'add',
      regPath,
      '/v',
      value,
      '/t',
      'REG_SZ',
      '/d',
      data,
      '/f',
    ];
    execFile('reg', args, (err, stdout, stderr) => {
      if (err) {
        consoleLog('e_', 'Error escribiendo el registro:', {
          message: err.message,
          code: err && err.code,
          stderr,
        });
        return resolve(false);
      }

      resolve(true);
    });
  });
}

// ====== Enviar Mensajes directos =====
async function sendDirectMsg(numero, texto) {
  try {
    // Limpiamos el número por si acaso (quitar espacios o signos +)
    const numeroLimpio = numero.replace(/\D/g, '');
    const chatId = `${numeroLimpio}@c.us`;

    // Verificamos si el número está registrado en WhatsApp antes de enviar
    const esValido = await client.isRegisteredUser(chatId);

    if (esValido) {
      await client.sendMessage(chatId, texto);
      if (!numeroLimpio.includes(ownerPhone)) {
        consoleLog('u_', `Mensaje enviado a ${numeroLimpio}`);
      }
      if (
        texto.toLowerCase().includes('heart') ||
        texto.toLowerCase().includes('beat')
      ) {
        consoleLog('h_', `${texto} a ${numeroLimpio}`);
      }
    } else {
      consoleLog('b_', `Registra este número en WhatsApp: ${numeroLimpio}`);
    }
  } catch (err) {
    consoleLog('e_', 'Error al enviar mensaje:', err);
  }
}

// ===== Configuración ADODB =====
let connection = ADODB.open(
  `Provider=Microsoft.ACE.OLEDB.16.0;Data Source=${ADODB_DATA_SOURCE};Persist Security Info=False;`,
);

// ===== Función para crear la tabla "celulares" =====
async function createCelTable() {
  const createTableQuery = process.env.CREATE_TABLE_CELULARES;

  await connection
    .query(createTableQuery)
    .then(() => consoleLog('k_', 'Tabla "CELULARES" creada.'))
    .catch((err) => {
      msg = err?.process?.message ?? String(err);
      if (msg.toLowerCase().includes('already exists'))
        consoleLog('k_', 'Tabla "CELULARES" Lista.');
      else if (msg.toLowerCase().includes('object is closed'))
        consoleLog('k_', 'Tabla "CELULARES" creada.');
      else consoleLog('e_', msg);
    });
  // Syntax error in CREATE TABLE statement.
  // Table 'CELULARES' already exists.
}

// ===== Función para crear la tabla "celulares" =====
async function createRegTable() {
  const createTableQuery = process.env.CREATE_TABLE_REGISTROS;

  await connection
    .query(createTableQuery)
    .then(() => consoleLog('k_', 'Tabla "REGISTROS" creada.'))
    .catch((err) => {
      msg = err?.process?.message ?? String(err);
      if (msg.toLowerCase().includes('already exists'))
        consoleLog('k_', 'Tabla "REGISTROS" Lista.');
      else if (msg.toLowerCase().includes('object is closed'))
        consoleLog('k_', 'Tabla "REGISTROS" creada.');
      else consoleLog('e_', msg);
    });
  // Syntax error in CREATE TABLE statement.
  // Table 'CELULARES' already exists.
}

// ===== Prueba de conexión a la base de datos =====
async function testDBConnection() {
  const testQuery = 'SELECT 1 AS ok';
  try {
    const test = await connection.query(testQuery);
    consoleLog('k_', 'Conexión exitosa a MSAccess:', test);
    const timestamp = new Date().toLocaleTimeString();
    let msg = `${timestamp}`;
    if (isQRRecharged) {
      msg = `QR Recargado - ${timestamp}`;
      isQRRecharged = false;
    }
    //! VARIABLES DE AMBIENTE
    //* consoleLog(process.env.SystemRoot) // =C:\WINDOWS
    await createCelTable();
    await createRegTable();
    await sendDirectMsg(country + ownerPhone, msg);
    return true;
  } catch (err) {
    msg = err?.process?.message ?? String(err);
    consoleLog('a_', 'Verificando conexión MSAccess, porque:\n', msg);
    await connection
      .query(testQuery)
      .then((data) => consoleLog('k_', 'Conexión exitosa a MSAccess:', data))
      .catch((err) => consoleLog('e_', err));
    process.exit(0);
  }
}

// Funciones en MSAccess
async function checkCelInDB(from) {
  const query1 = `SELECT COUNT(*) AS [Found] 
    FROM [CELULARES] 
    WHERE [MESSAGE_FROM] = '${from}';`;
  const query2 = `SELECT TOP 1 * 
    FROM [CELULARES] 
    WHERE [MESSAGE_FROM] = '${from}';`;
  const userStatus = statesMemory.get(from);
  if ((await from) === 'status@broadcast') {
    statesMemory.delete(from);
    return [{ CELLPHONE: 0, USER_NAME: 'Broadcast' }];
  }
  try {
    const result = await connection.query(query1);
    if (result[0]?.Found > 0) {
      const data = await connection.query(query2);
      return data;
    } else {
      if (await userStatus?.esperandoCelular) return;
      consoleLog(
        'f_',
        'Número celular no hallado en la base de datos:',
        result,
      );
      return null;
    }
  } catch (err) {
    if (await userStatus?.esperandoCelular) return;
    consoleLog('e_', 'Error verificando número en la base de datos:', err);
    return null;
  }
}

async function checkRegInDB(from) {
  const { cellphone, numeros, unixTimestamp } = statesMemory.get(from);
  const query = `SELECT * 
    FROM [REGISTROS] 
    WHERE [CELLPHONE] = ${cellphone}
    AND ([BONO] IN (${numeros.join(',')})
    OR [IDUNIX] >= '${unixTimestamp}');`;

  const userStatus = statesMemory.get(from);
  try {
    const data = await connection.query(query);

    if (!data[0]) {
      if (await userStatus?.esperandoConfirmacion) return;
      consoleLog('e_', 'Números no encontrados en la base de datos:', data);
      return null;
    }
    return data;
  } catch (err) {
    if (await userStatus?.esperandoConfirmacion) return;
    consoleLog('e_', 'Error verificando números en la base de datos:', err);
    return null;
  }
}

async function saveCelInDB(from, nombreUsuario, celular) {
  const insertQuery = `
INSERT INTO [CELULARES] ([MESSAGE_FROM], [USER_NAME], [CELLPHONE])
    VALUES ('${from}', '${nombreUsuario}', ${celular});`;

  try {
    await connection.query(insertQuery);
    consoleLog('k_', `Celular ${celular} guardado en la base de datos.`);
    return true;
  } catch (err) {
    if (await checkCelInDB(from)) {
      return true;
    } else {
      consoleLog('e_', `Error guardando celular en la base de datos: ${err}`);
      return false;
    }
  }
}

// Guardar REGISTROS en DB
async function saveRegInDB(from) {
  let userStatus = statesMemory.get(from);
  if (!userStatus || !userStatus.numeros || !userStatus.cellphone) {
    consoleLog('e_', 'Estado incompleto para guardar registros:', {
      from,
      userStatus,
    });
    return false;
  }

  consoleLog('1️⃣ ', 'Números (inicio):', userStatus.numeros.join(', '));

  // Trabajamos sobre una copia para evitar problemas al modificar la lista mientras iteramos
  const snapshot = Array.isArray(userStatus.numeros)
    ? [...userStatus.numeros]
    : [];

  for (const num of snapshot) {
    const unixTimestamp = Math.floor(Date.now());
    const cleaned = (num || '').toString().trim();
    const insertQuery = `INSERT INTO [REGISTROS] ([IDUNIX],[CELLPHONE],[BONO]) VALUES ('${unixTimestamp}', ${userStatus.cellphone}, ${cleaned});`;

    consoleLog('2️⃣ ', 'sql:', insertQuery);

    try {
      await connection.query(insertQuery);
    } catch (err) {
      const msg = err?.process?.message ?? String(err);

      // Si es un duplicado, actualizamos el userStatus eliminando ese número y continuamos
      if (typeof msg === 'string' && msg.toLowerCase().includes('duplicate')) {
        // Re-lee el userStatus actual del Map por si cambió mientras iterábamos
        const current = statesMemory.get(from) || userStatus;
        const updatedNumeros = (current.numeros || []).filter((n) => n !== num);
        statesMemory.set(from, { ...current, numeros: updatedNumeros });
        consoleLog(
          '3️⃣ ',
          'Duplicado detectado, eliminado del userStatus:',
          num,
        );
        consoleLog(
          '4️⃣ ',
          'Números actuales (post-eliminación):',
          updatedNumeros.join(', '),
        );
        // Actualiza variable local para reflejar el cambio en esta iteración
        userStatus = statesMemory.get(from) || userStatus;
        continue;
      }
      if (!msg.toLowerCase().includes('object is closed')) {
        consoleLog('e_', msg);
      }
    }
  }
  return true;
}

// ===== Eventos del cliente y lógica de reinicio resiliente =====

let readyTimer = null;
let restartAttempts = 0;
let shuttingDownClient = false;

function createClientInstance(idSuffix) {
  try {
    // Si se proporciona idSuffix, se usará para crear un perfil de sesión separado, útil para múltiples instancias en la misma máquina
    const authOptions = idSuffix
      ? new LocalAuth({ clientId: `session_${idSuffix}` })
      : new LocalAuth();
    return new Client({
      authStrategy: authOptions,
      puppeteer: {
        headless: true,
        executablePath:
          CHROME_PATH ||
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    });
  } catch (err) {
    consoleLog('e_', 'Error creando instancia de Client:', err);
    throw err;
  }
}

function clearReadyTimer() {
  if (readyTimer) {
    consoleLog('i_', 'Limpiando timer de ready');
    clearTimeout(readyTimer);
    readyTimer = null;
  }
}

function scheduleRestart(reason) {
  try {
    consoleLog('r_', `scheduleRestart llamado por: "${reason}"`);
    if (shuttingDownClient) return;
    restartAttempts++;
    const delay = Math.min(
      RESTART_MAX_MS,
      RESTART_BASE_MS * 2 ** (restartAttempts - 1),
    );
    consoleLog(
      'r_',
      `Reiniciando cliente por: "${reason}". Intento ${restartAttempts} en ${delay}ms`,
    );
    setTimeout(() => startClient(), delay);
  } catch (err) {
    consoleLog('e_', 'Error en scheduleRestart:', err);
  }
}

async function safeDestroyClient() {
  if (!client) return;
  try {
    shuttingDownClient = true;
    client.removeAllListeners();
    await client.destroy();
  } catch (err) {
    consoleLog('e_', 'Error destroying client:', err);
  } finally {
    client = null;
    shuttingDownClient = false;
  }
}

// ===== Función OCR =====
async function readOCRNumbers(buffer) {
  const result = await Tesseract.recognize(buffer, 'eng', {
    tessedit_char_whitelist: '0123456789',
  });
  consoleLog('y_', 'Leyendo imagen...');
  const texto = result.data.text;
  return texto.match(/\d+/g);
}

function attachClientHandlers(c) {
  // QR
  c.on('q_', (qr) => {
    console.clear();
    isQRRecharged = true;
    consoleLog('q_', 'Escanea este QR con tu WhatsApp:');
    qrcode.generate(qr, { small: true });
    const timestamp = new Date().toLocaleTimeString();
    consoleLog('g_', `[${timestamp}] QR generado, esperando escaneo...`);
  });

  // Ready
  c.on('ready', async () => {
    clearReadyTimer();
    restartAttempts = 0;
    consoleLog('k_', 'Bot listo y conectado a WhatsApp.');
    try {
      await testDBConnection();
    } catch (err) {
      consoleLog('e_', 'Error en testDBConnection:', err);
    }
  });

  // Auth failure
  c.on('auth_failure', (msg) => {
    try {
      clearReadyTimer();
      consoleLog('🔐', 'auth_failure:', msg);
      safeDestroyClient().then(() => scheduleRestart('auth_failure'));
    } catch (err) {
      consoleLog('e_', 'Error en auth_failure handler:', err);
    }
  });

  // Disconnected
  c.on('disconnected', (reason) => {
    try {
      clearReadyTimer();
      consoleLog('📴', 'disconnected:', reason);
      safeDestroyClient().then(() => scheduleRestart('disconnected'));
    } catch (err) {
      consoleLog('e_', 'Error en disconnected handler:', err);
    }
  });

  // Optional state change log
  c.on('change_state', (state) => {
    consoleLog('c_', 'Estado del cliente de WhatsApp:', state);
  });

  // Message handler (se mantiene la lógica original)
  c.on('message', async (msg) => {
    consoleLog(
      'd_',
      `{"origen":"${msg?.author || msg.from}", "contenido":"${msg.body || msg.caption || '[media]'}", "hasMedia":${msg.hasMedia} ${msg.type ? `, "tipo":"${msg.type}"` : ''}}`,
    );

    if (msg.from === 'status@broadcast') return;
    const texto = msg.body;
    const numeros = texto.match(/\d+/g);
    const userStatus = statesMemory.get(msg.from);
    const data = await checkCelInDB(msg.from);
    const isValidMedia =
      msg.hasMedia && msg?.type === 'image' && msg.from !== 'status@broadcast';

    if (data) {
      if (
        (numeros || isValidMedia) &&
        !(await userStatus?.esperandoCelular) &&
        !(await userStatus?.esperandoConfirmacion)
      ) {
        consoleLog(
          'p_',
          `Celular número: '${data[0]?.CELLPHONE}' de "${data[0]?.USER_NAME}"`,
        );
        statesMemory.set(msg.from, {
          esperandoConfirmacion: true,
          numeros,
          texto,
          cellphone: data[0]?.CELLPHONE,
          username: data[0]?.USER_NAME || 'Desconocido',
          unixTimestamp: Math.floor(Date.now()),
        });
        if (numeros) {
          consoleLog('m_', `Números detectados: ${numeros.join(', ')}`);
          return msg.reply(
            `#️⃣  Números detectados: ${numeros.join(', ')}\n\n¿Están correctos? S/N`,
          );
        }
      }
    }

    if (
      !(await userStatus?.esperandoCelular) &&
      !(await userStatus?.esperandoConfirmacion)
    ) {
      // Verificamos primer si existe el número celular
      if (!data || data[0]?.Found === 0) {
        statesMemory.set(msg.from, {
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
    if (await userStatus?.esperandoConfirmacion) {
      const respuesta = msg.body.trim().toLowerCase();

      if (
        respuesta === 's' ||
        respuesta === 'si' ||
        respuesta === 'y' ||
        respuesta === 'yes'
      ) {
        if (await saveRegInDB(msg.from)) {
          const data = await checkRegInDB(msg.from);
          let numerosGuardados = [];
          if (data && data.length > 0) {
            numerosGuardados = data.map((item) => item?.BONO);
          }
          consoleLog(
            's_',
            `Confirmado. Guardado de '${userStatus.cellphone}' los números: ${numerosGuardados.join(', ')}`,
          );
          await msg.reply(
            `💾 Confirmado.\nGuardado de ${userStatus.cellphone} los números:\n* ${numerosGuardados.join('\n* ')}\nNúmero que no esté en esta lista es por ser duplicado o haberse guardado previamente.\n\n⚠️La validación final estará sujeta a revisiones manuales posteriores.`,
          );
          statesMemory.delete(msg.from);
          return true;
        } else {
          consoleLog(
            'e_',
            'Error guardando números en la base de datos para:',
            {
              from: msg.from,
              username: userStatus.username,
            },
          );
          await msg.reply(
            '❌ Error guardando los números en la base de datos. Intenta de nuevo más tarde.',
          );
          statesMemory.delete(msg.from);
          return false;
        }
      }
      if (respuesta === 'n' || respuesta === 'no') {
        consoleLog(
          'w_',
          `Usuario '${userStatus.username}' indicó que los números no son correctos, userStatus reiniciado.`,
        );
        statesMemory.delete(msg.from);
        return msg.reply(
          '💡 *Sugerencia*:\n1️⃣ Mejora la imagen y envía de nuevo.\n2️⃣ O digita la lista de números separados por comas.',
        );
      }

      return msg.reply('✏️ Responde S o N');
    }

    // ===== Caso: esperando celular =====
    if (await userStatus?.esperandoCelular) {
      const regexCelular = /^\d{10}$/; // Ajusta el rango según tus necesidades
      const celular = msg.body.trim().toLowerCase();

      if (
        regexCelular.test(celular) &&
        !isNaN(celular) &&
        celular.length === 10 &&
        celular[0] === '3'
      ) {
        statesMemory.set(msg.from, {
          esperandoCelular: true,
          cellphone: celular,
          username: msg._data.notifyName || 'Desconocido',
        });
        const { cellphone, username } = statesMemory.get(msg.from);
        if (await saveCelInDB(msg.from, username, cellphone)) {
          consoleLog(
            's_',
            `Confirmado. Guardado de "${username}" con celular '${cellphone}'`,
          );
          statesMemory.delete(msg.from);
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
    if (isValidMedia) {
      try {
        consoleLog('t_', 'Mensaje con imagen detectado, descargando media...');
        const media = await msg.downloadMedia();
        const buffer = Buffer.from(media.data, 'base64');

        const numeros = await readOCRNumbers(buffer);

        if (!numeros) {
          consoleLog('w_', 'No detecté números en la imagen');
          return msg.reply('🚨 No detecté números en la imagen');
        }
        const current = statesMemory.get(msg.from) || userStatus;
        statesMemory.set(msg.from, {
          ...current,
          esperandoConfirmacion: true,
          numeros,
          buffer,
        });
        consoleLog('m_', `Números detectados: ${numeros.join(', ')}`);
        return msg.reply(
          `#️⃣  Números detectados: ${numeros.join(', ')}\n\n¿Están correctos? S/N`,
        );
      } catch (err) {
        consoleLog('e_', 'Error leyendo la imagen');
        consoleLog('e_', err);
        msg.reply('❌ Error leyendo la imagen');
      }
    }
  });
}

function startClient() {
  try {
    if (client) {
      consoleLog('e_', 'Cliente ya existe, ignorando start');
      return;
    }

    client = createClientInstance();
    attachClientHandlers(client);
  } catch (err) {
    consoleLog('e_', 'Error en startClient:', err);
    return;
  }
  // Inicializa el cliente y establece un timer que reiniciará si no llega 'ready'
  try {
    client.initialize();
  } catch (err) {
    consoleLog('e_', 'Error al inicializar client:', err);
    safeDestroyClient().then(() => scheduleRestart('initialize_error'));
    return;
  }
  try {
    clearReadyTimer();
    readyTimer = setTimeout(() => {
      if (!client) return;
      consoleLog(
        'w_',
        `No llegó 'ready' en ${READY_TIMEOUT_MS}ms — reiniciando cliente.`,
      );
      safeDestroyClient().then(() => scheduleRestart('ready_timeout'));
    }, READY_TIMEOUT_MS);
  } catch (err) {
    consoleLog('e_', 'Error en ready timeout setup:', err);
  }
}

// Si ya existe alguna implementación de handler de mensaje grande en el archivo, la renombramos
// Copia la gran función inline de `client.on('message', ...)` a `handleIncomingMessage` más abajo en el archivo.

startClient();

// Manejo de cierre del proceso
process.on('SIGINT', async () => {
  consoleLog('n_', 'Deteniendo servidor...');
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
  await sendDirectMsg(numero, mensaje);
  res.json({ status: 'Procesado' });
});

/**
 * *GET '/leer-registro'
 *
 * @param {string} numero - telephone number
 * @param {string} mensaje - Text to send
 * @returns {string} status - answer
 */
app.get('/leer-registro', async (req, res) => {
  // const { numero, mensaje } = req.body;
  const registryValue = await readRegistry('PID');
  consoleLog('i_', 'Valor del registro leído:', registryValue?.parsed);
  res.json({ status: 'Leído' });
});

/**
 * *POST '/escribir-registro'
 *
 * @param {string} data - Data to write
 * @param {string} value - Value to write
 * @param {string} rootkey - Root key for the registry
 * @returns {string} status - answer
 */
app.post('/escribir-registro', async (req, res) => {
  const { data, value, rootkey } = req.body;
  const isOk = await writeRegistry(data, value, rootkey);
  if (isOk) {
    res.json({ status: 'Escrito' });
  } else {
    res.json({ status: 'Error al escribir' });
  }
});

// ==== Escucha de Server API de express ===
app.listen(PORT, () => {
  consoleLog('k_', `Servidor Express corriendo en http://localhost:${PORT}`);
});
