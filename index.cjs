const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const http = require('http'); // Necesario para Socket.io
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const port = 3000;

const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173', // La URL de tu app de React/Next.js
    methods: ['GET', 'POST'],
  },
});

// 1. Configuración del cliente de WhatsApp
const client = new Client({
  authStrategy: new LocalAuth(), // Guarda la sesión para no escanear QR siempre
  puppeteer: {
    headless: true, // Cambia a false si quieres ver el navegador abrirse
    //args: ['--no-sandbox'], // tengo un error asi que lo camcio
    // Reemplaza esta ruta por la de tu Chrome si es distinta
    executablePath:
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

// 2. Evento de conexión de Socket.io
io.on('connection', (socket) => {
  console.log('Un cliente (React) se ha conectado');
});

// 3. Generación del código QR para el login
client.on('qr', (qr) => {
  console.log('ESCANEA ESTE QR CON TU WHATSAPP:');
  qrcode.generate(qr, { small: true });
  // Opcional: Enviar el QR al frontend si quieres mostrarlo en la web
  io.emit('qr-code', qr);
});

// 4. Confirmación de conexión
client.on('ready', () => {
  console.log('¡Conexión exitosa! El cliente está listo.');
  io.emit('status', 'Conectado');
});

// 5. "ATRAPAR" LOS MENSAJES (El evento principal)
client.on('message', async (msg) => {
  console.log(`Mensaje recibido de ${msg.from}: ${msg.body}`);
  // console.log(msg);

  // Ejemplo: Responder automáticamente si dicen "Hola"
  if (msg.body.toLowerCase() === 'hola') {
    msg.reply('¡Hola! Soy un bot conectado desde Express. 🤖');
  }

  // Aquí podrías enviar el mensaje a una base de datos o a tu app de React vía WebSockets
  // Enviamos el objeto del mensaje completo a React
  io.emit('new-message', {
    to: msg.to,
    from: msg.from,
    body: msg.body,
    timestamp: new Date().toLocaleTimeString(),
  });
});

// 6. Este evento detecta TODOS los mensajes: los que recibes y los que ENVÍAS
client.on('message_create', async (msg) => {
    // msg.fromMe es true si el mensaje lo enviaste tú desde cualquier dispositivo
    if (msg.fromMe) {
        console.log(`Mensaje enviado de ${msg.from}: ${msg.body}`);

        // Enviamos el mensaje al frontend vía Socket.io
        io.emit('new-message', {
            from: msg.from, // O puedes usar msg.to para saber a quién se lo enviaste
            to: msg.to,
            body: msg.body,
            timestamp: new Date().toLocaleTimeString(),
            isMine: true // Útil para darle un estilo diferente en React
        });
    }
});

// 7. Iniciar cliente y servidor Express
client.initialize();

app.get('/', (req, res) => {
  res.send('Servidor de WhatsApp funcionando 🚀');
});

// Use the http server that Socket.IO is attached to
server.listen(port, () => {
  console.log(`Servidor Express y Socket.IO corriendo en http://localhost:${port}`);
});
