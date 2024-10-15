const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");

dotenv.config();
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Path to ride data files
const ridesFilePath = path.join(__dirname, "rides.json");
const completedRidesFilePath = path.join(__dirname, "completed_rides.json");

// Helper functions
const readFile = (filePath) => {
  if (!fs.existsSync(filePath)) return [];
  const data = fs.readFileSync(filePath);
  return JSON.parse(data);
};

const writeFile = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

// Store the initial state of rides if the file doesn't exist
if (!fs.existsSync(ridesFilePath)) {
  writeFile(ridesFilePath, []);
}

app.get("/", (req, res) => {
  res.send("socket.IO server is running");
});

io.on("connection", (socket) => {
  console.log(`user connected: ${socket.id}`);

  // Send all pending rides to the newly connected rider
  const pendingRides = readFile(ridesFilePath).filter(
    (ride) => ride.status === "pending"
  );
  socket.emit("pendingRides", pendingRides);

  // Handle new ride emission
  socket.on("sendCard", (cardData) => {
    console.log(`New ride from ${socket.id}: `, cardData);

    const ride = {
      ...cardData,
      status: "pending",
      sender: socket.id,
      timestamp: new Date().toISOString(),
    };

    const rides = readFile(ridesFilePath);
    rides.push(ride);
    writeFile(ridesFilePath, rides);

    io.emit("recieveCard", ride);

    // Start a 1-minute timer for this ride
    const rideTimeout = setTimeout(() => {
      const rides = readFile(ridesFilePath);
      const rideIndex = rides.findIndex(
        (r) => r.sender === socket.id && r.status === "pending"
      );

      if (rideIndex !== -1) {
        // Notify the user that no rider is available
        io.to(socket.id).emit("rideTimeout", {
          message: "We are sorry, no rider available at this time.",
        });

        // Remove the ride from the list of pending rides
        rides.splice(rideIndex, 1);
        writeFile(ridesFilePath, rides);

        // Stop emitting this ride to others
        io.emit(
          "pendingRides",
          rides.filter((ride) => ride.status === "pending")
        );
      }
    }, 60000); // 1 minute (60000 ms)

    // Store the timeout so we can clear it later if the ride is accepted
    ride.timeout = rideTimeout;
  });

  // Handle ride reaction (acceptance)
  socket.on("reaction", ({ cardSender, reaction, reactorName }) => {
    console.log(
      `Reaction from ${reactorName.userName}: accepted ${cardSender}'s ride`
    );

    const rides = readFile(ridesFilePath);
    const rideIndex = rides.findIndex((ride) => ride.sender === cardSender);

    if (rideIndex !== -1) {
      // Clear the timeout since the ride has been accepted
      clearTimeout(rides[rideIndex].timeout);

      // Update ride status to accepted
      rides[rideIndex].status = "accepted";
      rides[rideIndex].acceptedBy = reactorName;
      delete rides[rideIndex].timeout; // Remove the timeout reference
      writeFile(ridesFilePath, rides);

      io.to(cardSender).emit("notifyReaction", {
        message: reactorName,
      });
    }
  });

  // Handle ride status updates
  socket.on("updateRideStatus", ({ cardSender, status, reactorName }) => {
    console.log(`${reactorName.userName} updated the ride status to ${status}`);

    const rides = readFile(ridesFilePath);
    const rideIndex = rides.findIndex((ride) => ride.sender === cardSender);

    if (rideIndex !== -1) {
      if (status === "Ride Ended" || status === "Ride Cancelled") {
        // Clear the timeout if it exists
        if (rides[rideIndex].timeout) {
          clearTimeout(rides[rideIndex].timeout);
        }

        // Move ride to completed/cancelled rides and delete from current rides
        const completedRides = readFile(completedRidesFilePath);
        const completedRide = {
          ...rides[rideIndex],
          contact: rides[rideIndex].contact, // Include contact
          username: rides[rideIndex].username, // Include username
          status,
          completedBy: reactorName,
          completedAt: new Date().toISOString(),
          type: status === "Ride Ended" ? "completed" : "cancelled",
        };
        completedRides.push(completedRide);
        writeFile(completedRidesFilePath, completedRides);

        // Remove the ride from active rides
        rides.splice(rideIndex, 1);
        writeFile(ridesFilePath, rides);

        // Emit the new completed ride to the user
        io.to(cardSender).emit("newCompletedRide", completedRide);
      } else {
        // Just update the status if it's not ending/cancelling the ride
        rides[rideIndex].status = status;
        writeFile(ridesFilePath, rides);
      }
    }

    io.to(cardSender).emit("rideStatusUpdate", {
      message: `${reactorName.userName} has updated the ride status to: ${status}`,
      status,
      reactorDetails: reactorName,
    });
  });

  socket.on("disconnect", () => {
    console.log(`user ${socket.id} disconnected`);
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`server listening on port http://localhost:${PORT}`);
});
