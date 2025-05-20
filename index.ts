const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

// Initialize app and server
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*" },
});

// Firebase Admin Initialization
const serviceAccount = require("./firebase.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = getFirestore();

// Socket.IO connection handler
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Register user with socket
  socket.on("register", async ({ userId, fcmToken }) => {
    try {
      const docRef = db.collection("users").doc(userId);
      const doc = await docRef.get();
      const existing = doc.data();

      if (existing?.socketId === socket.id) {
        // Already registered with the same socket ID
        return;
      }

      await docRef.set({
        socketId: socket.id,
        fcmToken: fcmToken || null,
        status: "online",
        lastSeen: new Date(),
      }, { merge: true });

      socket.userId = userId;
      console.log(`User ${userId} registered with socket ${socket.id}`);
    } catch (error) {
      console.error("Register error:", error);
    }
  });

  // Handle incoming offer
  socket.on("offer", async ({ offer, from, to }) => {
    try {
      const res = await db.collection("users").doc(to).get();
      const recipient = res.data();

      if (!recipient) {
        socket.emit("error", `User ${to} not found`);
        return;
      }

      if (recipient.socketId && recipient.status === "online") {
        io.to(recipient.socketId).emit("offer", { offer, from });
      } else if (recipient.fcmToken) {
        await admin.messaging().send({
          token: recipient.fcmToken,
          data: {
            type: "incoming_call",
            callerId: from,
            callUUID: "call-uuid-" + Date.now(),
          },
        });
      } else {
        socket.emit("error", `User ${to} is unreachable`);
      }
    } catch (error) {
      console.error("Error handling offer:", error);
    }
  });

  // Handle answer
  socket.on("answer", async ({ answer, from, to }) => {
    try {
      const res = await db.collection("users").doc(to).get();
      const recipient = res.data();
      if (recipient?.socketId) {
        io.to(recipient.socketId).emit("answer", { answer });
      }
    } catch (error) {
      console.error("Answer error:", error);
    }
  });

  // Handle ICE candidate
  socket.on("ice-candidate", async ({ candidate, to }) => {
    try {
      const res = await db.collection("users").doc(to).get();
      const recipient = res.data();
      if (recipient?.socketId) {
        io.to(recipient.socketId).emit("ice-candidate", { candidate });
      }
    } catch (error) {
      console.error("ICE candidate error:", error);
    }
  });

  // Handle call end
  socket.on("end-call", async ({ to }) => {
    try {
      const res = await db.collection("users").doc(to).get();
      const recipient = res.data();
      if (recipient?.socketId) {
        io.to(recipient.socketId).emit("end-call");
      }
    } catch (error) {
      console.error("End-call error:", error);
    }
  });

  // Handle disconnect
  socket.on("disconnect", async () => {
    try {
      if (socket.userId) {
        const docRef = db.collection("users").doc(socket.userId);
        await docRef.set({
          socketId: null,
          status: "offline",
          lastSeen: new Date(),
        }, { merge: true });
      }
      console.log("User disconnected:", socket.id);
    } catch (error) {
      console.error("Disconnect error:", error);
    }
  });
});

// Start server
server.listen(3000, () => console.log("Server running on port 3000"));
