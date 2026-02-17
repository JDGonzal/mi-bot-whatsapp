const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const Tesseract = require('tesseract.js');
const dotenv = require('dotenv');
dotenv.config();
const ADODB = require('node-adodb');
ADODB.debug = true;

// ===== Estado por usuario =====
const estados = new Map();

// ===== Cliente WhatsApp =====
const client = new Client({
  authStrategy: new LocalAuth(), // Guarda la sesión para no escanear QR siempre
  puppeteer: {
    headless: true, // Cambia a false si quieres ver el navegador abrirse
    //args: ['--no-sandbox'], // tengo un error asi que lo cambio
    // Reemplaza esta ruta por la de tu Chrome si es distinta
    executablePath:
      process.env.CHROME_PATH ||
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

// ===== Configuración ADODB =====
const connection = ADODB.open(
  `Provider=Microsoft.ACE.OLEDB.16.0;Data Source=${process.env.ADODB_DATA_SOURCE};Persist Security Info=False;`,
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
    .then(() => console.log('✅ Tabla "CELULARES" creada.'))
    .catch((err) => {
      msg = err?.process?.message ?? String(err);
      if (msg.toLowerCase().includes('already exists'))
        console.error('✅ Tabla "CELULARES" Lista.');
      else if (msg.toLowerCase().includes('object is closed'))
        console.log('✅ Tabla "CELULARES" creada.');
      else console.error(`❌ ${msg}`);
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
    .then(() => console.log('✅ Tabla "REGISTROS" creada.'))
    .catch((err) => {
      msg = err?.process?.message ?? String(err);
      if (msg.toLowerCase().includes('already exists'))
        console.error('✅ Tabla "REGISTROS" Lista.');
      else if (msg.toLowerCase().includes('object is closed'))
        console.log('✅ Tabla "REGISTROS" creada.');
      else console.error(`❌ ${msg}`);
    });
  // Syntax error in CREATE TABLE statement.
  // Table 'CELULARES' already exists.
}

// ===== Prueba de conexión a la base de datos =====
async function probarConexionMSAccess() {
  const testQuery = 'SELECT 1 AS ok';
  try {
    const test = await connection.query(testQuery);
    console.log('✅ Conexión exitosa a MSAccess:', test);
    await crearTablaCelulares();
    await crearTablaRegistros();
    return true;
  } catch (err) {
    console.error('❌ Error de conexión:');
    await connection
      .query(testQuery)
      .then((data) => console.log('✅ MSAccess OK:', data))
      .catch((err) => console.error(err));
    return false;
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
      console.log('❌ Número no encontrado en la base de datos:', result);
      return null;
    }
  } catch (err) {
    if (await estado?.esperandoCelular) return;
    console.error('❌ Error verificando número en la base de datos:', err);
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
      console.log('❌ Números no encontrados en la base de datos:', data);
      return null;
    }
    return data;
  } catch (err) {
    if (await estado?.esperandoConfirmacion) return;
    console.error('❌ Error verificando números en la base de datos:', err);
    return null;
  }
}

async function guardarCelularEnBaseDeDatos(from, nombreUsuario, celular) {
  const insertQuery = `
INSERT INTO [CELULARES] ([MESSAGE_FROM], [USER_NAME], [CELLPHONE])
    VALUES ('${from}', '${nombreUsuario}', ${celular});`;

  try {
    await connection.query(insertQuery);
    console.log(`✅ Celular ${celular} guardado en la base de datos.`);
    return true;
  } catch (err) {
    if (await VerificarCelularEnBaseDeDatos(from)) {
      return true;
    } else {
      console.error(`❌ Error guardando celular en la base de datos: ${err}`);
      return false;
    }
  }
}

async function guardarRegistrosEnBaseDeDatos(from) {
  let estado = estados.get(from);
  if (!estado || !estado.numeros || !estado.cellphone) {
    console.error('Estado incompleto para guardar registros:', {
      from,
      estado,
    });
    return false;
  }

  console.log('numeros (inicio):', estado.numeros.join(', '));

  // Trabajamos sobre una copia para evitar problemas al modificar la lista mientras iteramos
  const snapshot = Array.isArray(estado.numeros) ? [...estado.numeros] : [];

  for (const num of snapshot) {
    const unixTimestamp = Math.floor(Date.now());
    const cleaned = (num || '').toString().trim();
    const insertQuery = `INSERT INTO [REGISTROS] ([IDUNIX],[CELLPHONE],[BONO]) VALUES ('${unixTimestamp}', ${estado.cellphone}, ${cleaned});`;

    console.log('sql:', insertQuery);

    try {
      const data = await connection.query(insertQuery);
      console.log('✅ MSAccess OK:', data);
    } catch (err) {
      const msg = err?.process?.message ?? String(err);

      // Si es un duplicado, actualizamos el estado eliminando ese número y continuamos
      if (typeof msg === 'string' && msg.toLowerCase().includes('duplicate')) {
        // Re-lee el estado actual del Map por si cambió mientras iterábamos
        const current = estados.get(from) || estado;
        const updatedNumeros = (current.numeros || []).filter((n) => n !== num);
        estados.set(from, { ...current, numeros: updatedNumeros });
        console.log('Duplicado detectado, eliminado del estado:', num);
        console.log(
          'Números actuales (post-eliminación):',
          updatedNumeros.join(', '),
        );
        // Actualiza variable local para reflejar el cambio en esta iteración
        estado = estados.get(from) || estado;
        continue;
      }
      if (!msg.toLowerCase().includes('object is closed')) {
        console.error(msg);
      }
    }
  }
  return true;
}

// ===== Eventos del cliente =====
client.on('qr', (qr) => {
  console.clear();
  console.log('Escanea este QR con tu WhatsApp:');
  qrcode.generate(qr, { small: true });
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[${timestamp}] QR generado, esperando escaneo...`);
});

client.on('ready', async () => {
  console.log('✅ Bot listo y conectado a WhatsApp.');
  probarConexionMSAccess();
});

// ===== Función OCR =====
async function leerNumeros(buffer) {
  const result = await Tesseract.recognize(buffer, 'eng', {
    tessedit_char_whitelist: '0123456789',
  });

  const texto = result.data.text;
  return texto.match(/\d+/g);
}

// ===== Listener principal =====
client.on('message', async (msg) => {
  console.log(`Mensaje recibido de ${msg.from}: ${msg.body}`);
  const texto = msg.body;
  const numeros = texto.match(/\d+/g);
  const estado = estados.get(msg.from);
  const data = await VerificarCelularEnBaseDeDatos(msg.from);

  if (data) {
    if (
      numeros &&
      !(await estado?.esperandoCelular) &&
      !(await estado?.esperandoConfirmacion) &&
      !(msg.from === 'status@broadcast')
    ) {
      estados.set(msg.from, {
        esperandoConfirmacion: true,
        numeros,
        texto,
        cellphone: data[0]?.CELLPHONE,
        unixTimestamp: Math.floor(Date.now()),
      });
      console.log(`Números detectados: ${numeros.join(', ')}`);
      return msg.reply(
        `Números detectados: ${numeros.join(', ')}\n\n¿Están correctos? S/N`,
      );
    }
  }

  if (
    !(await estado?.esperandoCelular) &&
    !(await estado?.esperandoConfirmacion) &&
    !(msg.from === 'status@broadcast')
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
    if (data) {
      console.log(
        `✅ Celular número: ${data[0]?.CELLPHONE} de ${data[0]?.USER_NAME}`,
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
        console.log(
          `✅ Confirmado. Guardado de ${estado.cellphone} los números: ${numerosGuardados.join(', ')}`,
        );
        await msg.reply(
          `✅ Confirmado.\nGuardado de ${estado.cellphone} los números:\n* ${numerosGuardados.join('\n* ')}\nNúmero que no esté en esta lista es por ser duplicado o haberse guardado previamente.\n\n⚠️La validación final esta sujeta revisiones manuales posteriores.`,
        );
        estados.delete(msg.from);
        return true;
      }
    }
    if (respuesta === 'n' || respuesta === 'no') {
      return msg.reply(
        '*Sugerencia*:\n1️⃣ Mejora la imagen y envía de nuevo.\n2️⃣ O digita la lista de números separados por comas.',
      );
    }

    return msg.reply('Responde S o N');
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
        console.log(
          `✅ Confirmado. Guardado de ${username} con celular ${cellphone}`,
        );
        estados.delete(msg.from);
      } else {
        return msg.reply(
          '❌ Error guardando el número en la base de datos. Intenta de nuevo más tarde.',
        );
      }
    } else {
      return msg.reply(
        'Número de celular no válido. Por favor, envía un número de 10 dígitos, sin espacios, sin guiones. \nEjemplo: 3876543210',
      );
    }

    return msg.reply(
      '✅ Confirmado. Guardado. \n\n➡️ Ahora puedes enviar los números de las boletas o una imagen con los números visibles en forma horizontal.',
    );
  }

  // ===== Caso: mensaje con imagen =====
  if (msg.hasMedia && !msg.from === 'status@broadcast') {
    try {
      const media = await msg.downloadMedia();
      const buffer = Buffer.from(media.data, 'base64');

      const numeros = await leerNumeros(buffer);

      if (!numeros) {
        return msg.reply('No detecté números en la imagen');
      }

      estados.set(msg.from, {
        esperandoConfirmacion: true,
        numeros,
        buffer,
      });
      console.log(`Números detectados: ${numeros.join(', ')}`);
      return msg.reply(
        `Números detectados: ${numeros.join(', ')}\n\n❔¿Están correctos? S/N`,
      );
    } catch (err) {
      console.log('Error leyendo la imagen');
      console.error(err);
      msg.reply('Error leyendo la imagen');
    }
  }
});

client.initialize();
