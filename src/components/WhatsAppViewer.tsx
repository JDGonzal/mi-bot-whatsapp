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
