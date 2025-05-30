const express = require('express');
const socketIo = require('socket.io');
const http = require('http');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());
require('dotenv').config();

// Serve web client if needed
app.use(express.static('public'));

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Data structures
const users = {};
const rooms = {};
const waitingUsers = [];

// Interest matching algorithm
const findMatchingPartner = (currentUserInterests, potentialPartners) => {
  // First try to find partners with at least 2 common interests
  for (let i = 0; i < potentialPartners.length; i++) {
    const commonInterests = potentialPartners[i].interests.filter(interest =>
      currentUserInterests.includes(interest)
    );
    if (commonInterests.length >= 2) {
      return { partner: potentialPartners[i], commonInterests };
    }
  }

  // Fallback to any common interest
  for (let i = 0; i < potentialPartners.length; i++) {
    const commonInterests = potentialPartners[i].interests.filter(interest =>
      currentUserInterests.includes(interest)
    );
    if (commonInterests.length > 0) {
      return { partner: potentialPartners[i], commonInterests };
    }
  }

  // Fallback to random if no interests match
  return { partner: potentialPartners[0], commonInterests: [] };
};

// REST API Endpoints
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    users: Object.keys(users).length,
    rooms: Object.keys(rooms).length,
    waitingUsers: waitingUsers.length
  });
});

app.post('/api/end-call', (req, res) => {
  const { roomId, userId } = req.body;

  // Input validation
  if (!roomId || !userId) {
    return res.status(400).json({ error: 'Missing roomId or userId' });
  }

  if (rooms[roomId] && rooms[roomId].includes(userId)) {
    const partnerId = rooms[roomId].find(id => id !== userId);
    if (partnerId && users[partnerId]) {
      io.to(users[partnerId].socketId).emit('partner_left');
    }
    delete rooms[roomId];
    return res.json({ success: true });
  }
  res.status(404).json({ error: 'Room not found' });
});

// Socket.io Events
io.on('connection', (socket) => {
  console.log(`New connection: ${socket.id}`);

  const userId = uuidv4();

  // Heartbeat to detect dead connections
  let heartbeatInterval = setInterval(() => {
    socket.emit('ping');
  }, 20000);

  socket.on('pong', () => {
    // Connection is alive
  });

  socket.on('disconnect', () => {
    clearInterval(heartbeatInterval);
    handleDisconnect(userId);
  });

  socket.on('join_random', (userInterests) => {
    if (!Array.isArray(userInterests)) {
      userInterests = [];
    }

    users[userId] = { socketId: socket.id, interests: userInterests };
    socket.emit('your_id', userId);
    handleJoinRandom(userId, userInterests);
  });

  // WebRTC events
  socket.on('webrtc_offer', (roomId, offer) => {
    if (!roomId || !offer) return;
    forwardWebRTCEvent('offer', roomId, userId, offer);
  });

  socket.on('webrtc_answer', (roomId, answer) => {
    if (!roomId || !answer) return;
    forwardWebRTCEvent('answer', roomId, userId, answer);
  });

  socket.on('webrtc_ice', (roomId, candidate) => {
    if (!roomId || !candidate) return;
    forwardWebRTCEvent('ice', roomId, userId, candidate);
  });

  // Chat events
  socket.on('chat_message', (roomId, message) => {
    if (!roomId || typeof message !== 'string') return;
    const partnerId = getPartnerId(roomId, userId);
    if (partnerId && users[partnerId]) {
      io.to(users[partnerId].socketId).emit('chat_message', message);
    }
  });

  socket.on('typing', (roomId, isTyping) => {
    if (!roomId || typeof isTyping !== 'boolean') return;
    const partnerId = getPartnerId(roomId, userId);
    if (partnerId && users[partnerId]) {
      io.to(users[partnerId].socketId).emit('typing', isTyping);
    }
  });

  // Rating system
  socket.on('rate_partner', (roomId, rating) => {
    if (!roomId || typeof rating !== 'boolean') return;
    const partnerId = getPartnerId(roomId, userId);
    if (partnerId && users[partnerId]) {
      io.to(users[partnerId].socketId).emit('partner_rated', rating);

      // End the call after rating
      io.to(users[partnerId].socketId).emit('partner_left');
      io.to(socket.id).emit('partner_left');

      delete rooms[roomId];
    }
  });
});

// Helper Functions
function handleDisconnect(userId) {
  if (!users[userId]) return;

  // Remove from waiting list
  const waitingIndex = waitingUsers.findIndex(u => u.userId === userId);
  if (waitingIndex !== -1) waitingUsers.splice(waitingIndex, 1);

  // Notify partner if in a room
  for (const roomId in rooms) {
    if (rooms[roomId].includes(userId)) {
      const partnerId = rooms[roomId].find(id => id !== userId);
      if (partnerId && users[partnerId]) {
        io.to(users[partnerId].socketId).emit('partner_left');
      }
      delete rooms[roomId];
    }
  }

  delete users[userId];
}

function handleJoinRandom(userId, userInterests) {
  if (waitingUsers.length > 0) {
    const { partner, commonInterests } = findMatchingPartner(userInterests, waitingUsers);
    const partnerIndex = waitingUsers.findIndex(u => u.userId === partner.userId);

    if (partnerIndex !== -1) {
      waitingUsers.splice(partnerIndex, 1);
      const roomId = uuidv4();
      rooms[roomId] = [userId, partner.userId];

      io.to(users[userId].socketId).emit('partner_found', {
        roomId,
        partnerId: partner.userId,
        isInitiator: true,
        partnerInterests: partner.interests,
        commonInterests
      });

      io.to(partner.socketId).emit('partner_found', {
        roomId,
        partnerId: userId,
        isInitiator: false,
        partnerInterests: userInterests,
        commonInterests
      });
      return;
    }
  }

  // No partner found, add to waiting list
  waitingUsers.push({ userId, socketId: users[userId].socketId, interests: userInterests });
  io.to(users[userId].socketId).emit('waiting_for_partner');
}

function forwardWebRTCEvent(type, roomId, senderId, data) {
  const partnerId = getPartnerId(roomId, senderId);
  if (partnerId && users[partnerId]) {
    io.to(users[partnerId].socketId).emit(`webrtc_${type}`, data);
  }
}

function getPartnerId(roomId, userId) {
  return rooms[roomId]?.find(id => id !== userId);
}

// Error handling
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});