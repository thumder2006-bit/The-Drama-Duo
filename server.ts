import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  app.use(express.json());

  app.get('/api/health', (_, res) => {
    res.json({ status: 'ok' });
  });

  const rooms = new Map<string, Set<string>>();

  io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    socket.on('join-room', (roomId: string, userId: string) => {
      (socket as any).currentRoom = roomId;
      (socket as any).currentUserId = userId;

      socket.join(roomId);
      socket.join(userId);

      if (!rooms.has(roomId)) {
        rooms.set(roomId, new Set());
      }
      rooms.get(roomId)?.add(userId);

      socket.to(roomId).emit('user-connected', userId);
    });

    socket.on('leave-room', () => {
      const roomId = (socket as any).currentRoom;
      const userId = (socket as any).currentUserId;
      if (roomId && userId) {
        socket.leave(roomId);
        rooms.get(roomId)?.delete(userId);
        socket.to(roomId).emit('user-disconnected', userId);
      }
    });

    socket.on('disconnect', () => {
      const roomId = (socket as any).currentRoom;
      const userId = (socket as any).currentUserId;
      if (roomId && userId) {
        rooms.get(roomId)?.delete(userId);
        socket.to(roomId).emit('user-disconnected', userId);
      }
    });

    socket.on('webrtc-offer', ({ target, caller, sdp }) => {
      socket.to(target).emit('webrtc-offer', { caller, sdp });
    });

    socket.on('webrtc-answer', ({ target, caller, sdp }) => {
      socket.to(target).emit('webrtc-answer', { caller, sdp });
    });

    socket.on('webrtc-ice-candidate', ({ target, caller, candidate }) => {
      socket.to(target).emit('webrtc-ice-candidate', { caller, candidate });
    });

    socket.on('send-message', (roomId: string, message: any) => {
      io.to(roomId).emit('receive-message', message);
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist/index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
