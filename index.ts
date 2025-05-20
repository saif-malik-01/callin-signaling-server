const { getFirestore } = require("firebase-admin/firestore");
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const admin = require("firebase-admin");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*" },
});

const serviceAccount = require("./firebase.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = getFirestore();

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);
  // Register user
  socket.on("register", async ({ userId, fcmToken }) => {
    const docRef = db.collection("users").doc(userId);
    if (docRef)
      await docRef.set({
        socketId: socket.id,
        fcmToken: fcmToken || null,
        status: "online",
        lastSeen: new Date(),
      });
    socket.userId = userId;
    console.log(`User ${userId} registered with socket ${socket.id}`);
  });

  // Handle offer
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
        admin
          .messaging()
          .send({
            token: recipient.fcmToken,
            data: {
              type: "incoming_call",
              callerId: from,
              callUUID: "call-uuid-" + Date.now(),
            },
          })
          .catch((error) => console.error("FCM error:", error));
      } else {
        socket.emit("error", `User ${to} is unreachable`);
      }
    } catch (error) {
      console.error("Error handling offer:", error);
    }
  });

  // Handle answer
  socket.on("answer", async ({ answer, from, to }) => {
    const res = await db.collection("users").doc(to).get();
    const recipient = res.data();
    if (recipient && recipient.socketId) {
      io.to(recipient.socketId).emit("answer", { answer });
    }
  });

  // Handle ICE candidate
  socket.on("ice-candidate", async ({ candidate, to }) => {
    const res = await db.collection("users").doc(to).get();
    const recipient = res.data();
    if (recipient && recipient.socketId) {
      io.to(recipient.socketId).emit("ice-candidate", { candidate });
    }
  });

  // Handle call end
  socket.on("end-call", async ({ to }) => {
    const res = await db.collection("users").doc(to).get();
    const recipient = res.data();
    if (recipient && recipient.socketId) {
      io.to(recipient.socketId).emit("end-call");
    }
  });

  socket.on("disconnect", async () => {
    try {
    if (socket.userId) {
      const docRef = db.collection("users").doc(socket.userId);
      await docRef.set({ socketId: null, status: "offline", lastSeen: new Date() }, { merge: true });
    }
    console.log("User disconnected:", socket.id);
  } catch (error) {
    console.error("Error handling disconnect:", error);
  }
  });
});

server.listen(3000, () => console.log("Server running on port 3000"));
