# mi-bot-whatsapp

## Recomendación Inicial

1. Si es para aprender o un proyecto personal pequeño: Prueba la librería whatsapp-web.js. Es compatible con Node.js/Express y es la forma más rápida de "atrapar" mensajes mediante eventos.

2. Si es para algo profesional o empresarial: Usa la API oficial de WhatsApp Business. Es la única forma legal, segura y estable de recibir mensajes en tu propia aplicación de Next.js o React mediante Webhooks.

### Paso 1: Requisitos previos

Necesitas tener instalado Node.js en tu computadora. Crea una carpeta para tu proyecto y ejecuta lo siguiente en tu terminal para iniciar el proyecto e instalar las librerías necesarias:

```bash
mkdir mi-bot-whatsapp
cd mi-bot-whatsapp
npm init -y
pnpm add whatsapp-web.js qrcode-terminal express -E
```

* ``whatsapp-web.js``: El motor que interactúa con WhatsApp.

* ``qrcode-terminal``: Para mostrar el código QR en la terminal y loguearte.

* ``express``: Para que tu servidor pueda exponer una API o mantenerse activo.

### Paso 2: El código del servidor (**`index.js`**)

Crea un archivo llamado index.js y pega el siguiente código:

```js
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');

const app = express();
const port = 3000;

// 1. Configuración del cliente de WhatsApp
const client = new Client({
    authStrategy: new LocalAuth(), // Guarda la sesión para no escanear QR siempre
    puppeteer: {
        headless: true, // Cambia a false si quieres ver el navegador abrirse
        args: ['--no-sandbox']
    }
});

// 2. Generación del código QR para el login
client.on('qr', (qr) => {
    console.log('ESCANEA ESTE QR CON TU WHATSAPP:');
    qrcode.generate(qr, { small: true });
});

// 3. Confirmación de conexión
client.on('ready', () => {
    console.log('¡Conexión exitosa! El cliente está listo.');
});

// 4. "ATRAPAR" LOS MENSAJES (El evento principal)
client.on('message', async (msg) => {
    console.log(`Mensaje recibido de ${msg.from}: ${msg.body}`);

    // Ejemplo: Responder automáticamente si dicen "Hola"
    if (msg.body.toLowerCase() === 'hola') {
        msg.reply('¡Hola! Soy un bot conectado desde Express. 🤖');
    }
    
    // Aquí podrías enviar el mensaje a una base de datos o a tu app de React vía WebSockets
});

// 5. Iniciar cliente y servidor Express
client.initialize();

app.get('/', (req, res) => {
    res.send('Servidor de WhatsApp funcionando 🚀');
});

app.listen(port, () => {
    console.log(`Servidor Express corriendo en http://localhost:${port}`);
});
```

### Paso 3: Cómo ponerlo en marcha

1. En la terminal, ejecuta: <br/> `node index.js`

---
>[!WARNING]
>
> Ejecuto el comando pero obtengo un error:
>```bash
>Servidor Express corriendo en http://localhost:3000
>.\node_modules\.pnpm\puppeteer-core@24.36.1\node_modules\puppeteer-core\lib\cjs\puppeteer\node\BrowserLauncher.js:333
>                    throw new Error(`Could not find Chrome (ver. ${this.puppeteer.browserVersion}). This can occur if either\n` +
>                          ^
>
>Error: Could not find Chrome (ver. 144.0.7559.96). This can occur if either
> 1. you did not perform an installation before running the script (e.g. `npx puppeteer browsers install chrome`) or
> 2. your cache path is incorrectly configured (which is: C:\Users\pizah\.cache\puppeteer).
>For (2), check out our guide on configuring puppeteer at https://pptr.dev/guides/configuration.
>```
>
> Ese es un error muy común. Lo que sucede es que la librería whatsapp-web.js depende de Puppeteer, el cual necesita descargar una versión específica de Chromium (el motor de Chrome) para funcionar. Por alguna razón, la instalación automática falló o no se ejecutó.
>
>Para solucionarlo, sigue estos pasos en tu terminal (dentro de la carpeta de tu proyecto):
>
>### 1. Forzar la instalación del navegador
>
>Ejecuta el comando que el mismo error te sugiere. Esto descargará el binario necesario en la carpeta de caché que mencionas:
>
>```bash
>npx puppeteer browsers install chrome
>```
>
>### 2. Si el error persiste (Solución manual)
>
>Si el paso anterior no funciona o prefieres usar el Chrome que ya tienes instalado en tu Windows para ahorrar espacio, puedes modificar tu código en index.js para decirle a la librería dónde está tu Chrome real.
>
>Modifica la sección del cliente así:
>```JavaScript
>const client = new Client({
>    authStrategy: new LocalAuth(),
>    puppeteer: {
>        headless: true,
>        // Reemplaza esta ruta por la de tu Chrome si es distinta
>        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 
>        args: ['--no-sandbox', '--disable-setuid-sandbox']
>    }
>});
>```
>**Nota**: Asegúrate de usar doble barra diagonal \\ en la ruta si estás en Windows.
>
>### 3. Limpieza (Si nada de lo anterior funciona)
>
>A veces la carpeta node_modules se corrompe durante la instalación de Puppeteer. Si sigues con problemas, intenta esto:
>
>Borra la carpeta node_modules y el archivo package-lock.json.
>
>Ejecuta:<br/> `pnpm install`
>
>Vuelve a ejecutar:<br/> `node index.js`
---

2. Aparecerá un código **QR gigante** en la terminal.
3. Abre WhatsApp en tu celular -> **Dispositivos vinculados** -> **Vincular un dispositivo** <br/> y escanea el código de la terminal.
4. Una vez vinculado, verás en la consola el mensaje: ¡Conexión exitosa!.



### ¿Qué pasa después? (Cómo conectar con React/Next.js)

El código de arriba solo imprime los mensajes en la consola del servidor. Si quieres que esos mensajes aparezcan en tu aplicación de **React** o **Next.js** en tiempo real, tienes dos caminos:

* **WebSockets (Socket.io)**: Es la mejor forma. Cuando el `client.on('message')` detecta un mensaje, el servidor lo "emite" por un socket y tu app de React lo "escucha" y lo muestra en pantalla inmediatamente.

* **Base de Datos**: Guardas el mensaje en MongoDB o PostgreSQL y haces que tu app de React consulte esos datos.


### Notas de seguridad y estabilidad

* **LocalAuth**: Gracias a `new LocalAuth()`, se creará una carpeta llamada `.wwebjs_auth`. No la borres, ya que contiene tu sesión para que no tengas que escanear el QR cada vez que reinicies el servidor.

* **Baneos**: No uses este script para enviar spam (mensajes masivos a personas que no te tienen en sus contactos). WhatsApp es muy estricto y podría bloquear tu número.

¿Te gustaría que te mostrara cómo añadir **Socket.io** al ejemplo anterior para enviar el mensaje directamente a tu frontend?

---

## Socket.io

¡Excelente! Al integrar **Socket.io**, crearemos un puente en tiempo real. Cuando `whatsapp-web.js` detecte un mensaje en tu servidor de Node.js, lo "gritará" inmediatamente hacia tu aplicación de React/Next.js sin que tengas que refrescar la página.

Aquí tienes la configuración necesaria:

### 1. Instalación de Socket.io

Primero, instala la librería en tu servidor:
```Bash
pnpm add socket.io -E
```

>[!WARNING]
>
> Instala pero con algunas advertencias:
>```dos
>WARN  5 deprecated subdependencies found: fluent-ffmpeg@2.1.3, fstream@1.0.12, glob@7.2.3, inflight@1.0.6, rimraf@2.7.1
>```
>```dos
>╭ Warning ───────────────────────────────────────────────────────────────────────────────────╮
>│                                                                                            │
>│   Ignored build scripts: puppeteer.                                                        │
>│   Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.   │
>│                                                                                            │
>╰────────────────────────────────────────────────────────────────────────────────────────────╯
>

### 2. Servidor Express actualizado (index.js)

Vamos a envolver el servidor de Express con Socket.io para permitir la comunicación bidireccional:

```JavaScript
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
  console.log(msg);

  // Ejemplo: Responder automáticamente si dicen "Hola"
  if (msg.body.toLowerCase() === 'hola') {
    msg.reply('¡Hola! Soy un bot conectado desde Express. 🤖');
  }

  // Aquí podrías enviar el mensaje a una base de datos o a tu app de React vía WebSockets
  // Enviamos el objeto del mensaje completo a React
  io.emit('new-message', {
    from: msg.from,
    body: msg.body,
    timestamp: new Date().toLocaleTimeString(),
  });
});

// 6. Iniciar cliente y servidor Express
client.initialize();

app.get('/', (req, res) => {
  res.send('Servidor de WhatsApp funcionando 🚀');
});

app.listen(port, () => {
  console.log(`Servidor Express corriendo en http://localhost:${port}`);
});
```

### 3. Creación del Frontend con **Vite**.

1. Estando en la raíz de nuestro proyecto ejecutamos este comando
usando `VITE`:
```bash
pnpm create vite@latest . --template react-ts
```
2. Esto es el resultado del proceso:
```dos
◇  Current directory is not empty. Please choose how to proceed:
│  Ignore files and continue
│
◇  Use rolldown-vite (Experimental)?:
│  No
│
◇  Install with pnpm and start now?
│  Yes
│
◇  Scaffolding project in E:\tutorials\nodejs\mi-bot-whatsapp...
│
◇  Installing dependencies with pnpm...
```
3. Crea varios archivos y cambia a **`package.json`**, le completo lo antes borrando dejando este de esta manera:
```json
{
  "name": "mi-bot-whatsapp",
  "private": true,
  "version": "1.0.0",
  "description": "Necesitas tener instalado Node.js en tu computadora. Crea una carpeta para tu proyecto y ejecuta lo siguiente en tu terminal para iniciar el proyecto e instalar las librerías necesarias:",
  "main": "index.cjs",
  "type": "module",
  "scripts": {
    "start": "node --watch index.cjs",
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/JDGonzal/mi-bot-whatsapp.git"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "bugs": {
    "url": "https://github.com/JDGonzal/mi-bot-whatsapp/issues"
  },
  "homepage": "https://github.com/JDGonzal/mi-bot-whatsapp#readme",
  "dependencies": {
    "express": "5.2.1",
    "qrcode-terminal": "0.12.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "socket.io": "4.8.3",
    "whatsapp-web.js": "1.34.6"
  },
  "devDependencies": {
    "@eslint/js": "^9.39.1",
    "@types/node": "^24.10.1",
    "@types/react": "^19.2.5",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^5.1.1",
    "eslint": "^9.39.1",
    "eslint-plugin-react-hooks": "^7.0.1",
    "eslint-plugin-react-refresh": "^0.4.24",
    "globals": "^16.5.0",
    "typescript": "~5.9.3",
    "typescript-eslint": "^8.46.4",
    "vite": "^7.2.4"
  }
}
```
4. Borro la carpeta **"node_modules"**, y ejecuto en la `TERMINAL` este comando: <br/>`pnpm i`.
5. Renombro el archivo **`index.js`** por **`index.cjs`**.
6. En una `TERMINAL` ejecuto este comando: <br/>`pnpm start` <br/> Esto pone a correr el _backend_, en este caso el **express** en la ruta: <br/> `http://localhost:3000`
7. En otra `TERMINAL` pongo este comando: <br/> `pnpm dev` <br/> Así se ejecuta el _frontend_ , con **vite** y **react**, en esta _url_: <br/> `http://localhost:5173/`.
8. Corrijo el **`.gitignore`**:
```yml
# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*`
# Diagnostic reports (https://nodejs.org/api/report.html)
report.[0-9]*.[0-9]*.[0-9]*.[0-9]*.json

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Directory for instrumented libs generated by jscoverage/JSCover
lib-cov

# Coverage directory used by tools like istanbul
coverage
*.lcov

# nyc test coverage
.nyc_output

# Grunt intermediate storage (https://gruntjs.com/creating-plugins#storing-task-files)
.grunt

# Bower dependency directory (https://bower.io/)
bower_components

# node-waf configuration
.lock-wscript

# Compiled binary addons (https://nodejs.org/api/addons.html)
build/Release

# Dependency directories
node_modules/
jspm_packages/

# Snowpack dependency directory (https://snowpack.dev/)
web_modules/

# TypeScript cache
*.tsbuildinfo

# Optional npm cache directory
.npm

# Optional eslint cache
.eslintcache

# Optional stylelint cache
.stylelintcache

# Optional REPL history
.node_repl_history

# Output of 'npm pack'
*.tgz

# Yarn Integrity file
.yarn-integrity

# dotenv environment variable files
.env
.env.*
!.env.example

# parcel-bundler cache (https://parceljs.org/)
.cache
.parcel-cache

# Next.js build output
.next
out

# Nuxt.js build / generate output
.nuxt
dist

# Gatsby files
.cache/
# Comment in the public line in if your project uses Gatsby and not Next.js
# https://nextjs.org/blog/next-9-1#public-directory-support
# public

# vuepress build output
.vuepress/dist

# vuepress v2.x temp and cache directory
.temp
.cache

# Sveltekit cache directory
.svelte-kit/

# vitepress build output
**/.vitepress/dist

# vitepress cache directory
**/.vitepress/cache

# Docusaurus cache and generated files
.docusaurus

# Serverless directories
.serverless/

# FuseBox cache
.fusebox/

# DynamoDB Local files
.dynamodb/

# Firebase cache directory
.firebase/

# TernJS port file
.tern-port

# Stores VSCode versions used for testing VSCode extensions
.vscode-test

# yarn v3
.pnp.*
.yarn/*
!.yarn/patches
!.yarn/plugins
!.yarn/releases
!.yarn/sdks
!.yarn/versions

lerna-debug.log*

node_modules
dist
dist-ssr
*.local

# Editor directories and files
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

#Authorization WhatsApp
.wwebjs_auth/
.wwebjs_cache
```

### 4. Código básico para tu Frontend con `socket.io-client` (React/Next.js)

1. Para recibir esos mensajes en tu interfaz, necesitarás instalar socket.io-client en tu proyecto de frontend:
```Bash
pnpm add socket.io-client -E
```
2. Creamos el componente **`src\components\WhatsAppViewer.tsx`**:

```JavaScript
import { useEffect, useState } from 'react';
import io from 'socket.io-client';

interface Message {
  from: string;
  body: string;
  timestamp: string;
}

export default function WhatsAppViewer() {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    // Create the socket inside the effect so listeners are attached after component mounts
    const socket = io('http://localhost:3000', { transports: ['websocket'] });

    socket.on('connect', () => {
      console.log('Socket connected:', socket.id);
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connect error:', err);
    });

    // Log incoming events to help debugging and normalize payload to our Message shape
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socket.on('new-message', (data: any) => {
      console.log('Received new-message:', data);

      const message: Message = {
        from: (data?.from) ?? (data?.notifyName) ?? (data?._data?.notifyName) ?? 'unknown',
        body: data?.body ?? '',
        timestamp:
          typeof data?.timestamp === 'number'
            ? new Date(data.timestamp * 1000).toLocaleString()
            : data?.timestamp ?? (data?.t ? new Date(data.t * 1000).toLocaleString() : new Date().toLocaleString()),
      };

      setMessages((prev) => [...prev, message]);
    });

    return () => {
      // Remove listeners and disconnect to avoid leaking sockets / duplicate listeners
      socket.off('new-message');
      socket.off('connect');
      socket.off('connect_error');
      socket.disconnect();
    };
  }, []);

  return (
    <div>
      <h1>Mensajes de WhatsApp en vivo</h1>
      <ul>
        {messages.map((m, i) => (
          <li key={i}>
            <strong>{m.from}:</strong> {m.body} <small>{m.timestamp}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### ¿Qué logramos con esto?

1.Tu servidor Node.js actúa como el "cerebro" que lee WhatsApp.
2. **Socket.io** actúa como el "cable" que conecta el cerebro con tu interfaz visual.
3. Cada vez que llega un mensaje (como los que se ven en tu [WhatsApp](https://web.whatsapp.com/)), este aparecerá automáticamente en tu lista de React.

---

## Leer los mensajer recibidos y generados

Sí, es totalmente posible. Con la librería **`whatsapp-web.js`**, puedes capturar no solo los mensajes que recibes de otros, sino también los mensajes que tú mismo envías desde cualquier otro dispositivo vinculado (como tu celular o la aplicación de escritorio).

Para lograr esto, solo necesitas añadir un evento adicional a tu archivo **`index.cjs`**. Actualmente estás usando client.on('message', ...), que solo se activa con mensajes entrantes. El evento que necesitas para los mensajes que tú envías es `message_create`.

### 1. Actualización en tu **`index.cjs`** (Servidor)

Añade este bloque de código debajo de tu actual `client.on('message', ...)`:

```JavaScript
// Este evento detecta TODOS los mensajes: los que recibes y los que ENVÍAS
client.on('message_create', async (msg) => {
    // msg.fromMe es true si el mensaje lo enviaste tú desde cualquier dispositivo
    if (msg.fromMe) {
        console.log(`Mensaje enviado por mí desde otro dispositivo: ${msg.body}`);

        // Enviamos el mensaje al frontend vía Socket.io
        io.emit('new-message', {
            from: 'Yo', // O puedes usar msg.to para saber a quién se lo enviaste
            body: msg.body,
            timestamp: new Date().toLocaleTimeString(),
            isMine: true // Útil para darle un estilo diferente en React
        });
    }
});
```

### 2. ¿Por qué funciona así?

* **`message` vs `message_create`**: El evento `message` se dispara únicamente cuando entra algo nuevo a tu bandeja de entrada de otra persona. El evento `message_create` se dispara cada vez que se crea un mensaje en el ecosistema de tu cuenta, sin importar el origen.

* **Sincronización**: Como WhatsApp Web mantiene sincronizados todos los chats, cuando escribes algo en tu teléfono, el "navegador invisible" que corre en tu servidor de Express detecta esa actualización casi instantáneamente y dispara el evento.

### 3. Ajuste sugerido en el Frontend (React)

Si decides enviar la propiedad `isMine: true` como puse en el ejemplo, podrías mejorar tu componente para que los mensajes se vean distintos (como en WhatsApp real):

```JavaScript
// En tu mapeo de mensajes en React
{messages.map((m, i) => (
  <li key={i} style={{ textAlign: m.isMine ? 'right' : 'left', color: m.isMine ? 'blue' : 'black' }}>
    <strong>{m.from}:</strong> {m.body}
  </li>
))}
```
Con este cambio, tu aplicación de Node/React será un reflejo fiel de todo lo que pase en tu cuenta, permitiéndote "atrapar" tanto lo que te dicen como lo que tú respondes desde el móvil.
