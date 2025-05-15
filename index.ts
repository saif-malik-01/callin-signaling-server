const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: '*' }
});

// Store user socket mappings
const users = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Register user
  socket.on('register', (userId) => {
    users[userId] = socket.id;
    socket.userId = userId;
    console.log(`User ${userId} registered with socket ${socket.id}`);
  });

  // Handle offer
  socket.on('offer', ({ offer, from, to }) => {
    if (users[to]) {
      io.to(users[to]).emit('offer', { offer, from });
    } else {
      socket.emit('error', `User ${to} not found`);
    }
  });

  // Handle answer
  socket.on('answer', ({ answer, from, to }) => {
    if (users[to]) {
      io.to(users[to]).emit('answer', { answer });
    }
  });

  // Handle ICE candidate
  socket.on('ice-candidate', ({ candidate, to }) => {
    if (users[to]) {
      io.to(users[to]).emit('ice-candidate', { candidate });
    }
  });

  // Handle call end
  socket.on('end-call', ({ to }) => {
    if (users[to]) {
      io.to(users[to]).emit('end-call');
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    for (const userId in users) {
      if (users[userId] === socket.id) {
        delete users[userId];
        break;
      }
    }
  });
});

server.listen(3000, () => console.log('Server running on port 3000'));