const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const dotenv = require("dotenv");


dotenv.config();
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.get("/", (req, res) => {
  res.send("socket.IO server is running");
});

io.on("connection", (socket) => {
  console.log(`user connected: ${socket.id}`);

  socket.on("sendCard", (cardData) => {
    console.log(`card from ${socket.id}: `, cardData);
    io.emit(`recieveCard`, cardData);
  });

  socket.on("reaction", ({ cardSender, reaction, reactorName }) => {
    console.log(`reaction from ${reactorName}: accepted ${cardSender} ride`);
    io.to(cardSender).emit("notifyReaction", {
      message: `${reactorName}`,
    });
  });
  socket.on("dissconnect", () => {
    console.log(`user ${socket.id} disconnected`);
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`server listening on port http://localhost:${PORT}`);
});
