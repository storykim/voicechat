"use strict";

var os = require("os");
var nodeStatic = require("node-static");
var http = require("http");
var socketIO = require("socket.io");

var fileServer = new nodeStatic.Server();
var app = http
  .createServer(function(req, res) {
    fileServer.serve(req, res);
  })
  .listen(8080);

var nextId = 0;
function generateId() {
  nextId += 1;
  return nextId;
}

var idToConnMap = {};
const ROOM_CAPACITY = 4;

var io = socketIO.listen(app);
io.sockets.on("connection", function(socket) {
  socket.userId = generateId();
  idToConnMap[socket.userId] = socket;

  // convenience function to log server messages on the client
  function log() {
    var array = ["[ServerLog]"];
    array.push.apply(array, arguments);
    socket.emit("log", array);
  }

  socket.on("message", function(packedMessage) {
    var [target, message] = packedMessage;
    log("Client said: ", target, message);
    if (target in idToConnMap) {
      idToConnMap[target].emit("message", [socket.userId, message]);
    }
  });

  socket.on("broadcast", function(message) {
    socket.broadcast.to(socket.room).emit("message", [socket.userId, message]);
  });

  socket.on("disconnect", function(message) {
    delete idToConnMap[socket.userId];
    socket.broadcast.to(socket.room).emit("message", [socket.userId, "bye"]);
  });

  socket.on("create or join", function(room) {
    log("Received request to create or join room " + room);

    // Check validity
    var valid = /^\d{7}/.test(room);
    if (!valid) {
      log("Invalid request to create or join room " + room);
      return;
    }

    var clientsInRoom = io.sockets.adapter.rooms[room];
    var numClients = clientsInRoom
      ? Object.keys(clientsInRoom.sockets).length
      : 0;
    log("Room " + room + " now has " + numClients + " client(s)");

    if (numClients === 0) {
      socket.join(room);
      log("Client ID " + socket.id + " created room " + room);
      socket.emit("created", room, socket.id);
      socket.room = room;
    } else if (numClients < ROOM_CAPACITY) {
      log("Client ID " + socket.id + " joined room " + room);
      io.sockets.in(room).emit("join", room);
      socket.join(room);
      socket.emit("joined", room, socket.id);
      io.sockets.in(room).emit("ready");
      socket.room = room;
    } else {
      socket.emit("full", room);
    }
  });

  socket.on("ipaddr", function() {
    var ifaces = os.networkInterfaces();
    for (var dev in ifaces) {
      ifaces[dev].forEach(function(details) {
        if (details.family === "IPv4" && details.address !== "127.0.0.1") {
          socket.emit("ipaddr", details.address);
        }
      });
    }
  });
});
