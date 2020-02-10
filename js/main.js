"use strict";

var localStream;
var idToConn = {};

var iceConfig = {
  iceServers: [
    { urls: "stun:stun.stunprotocol.org:3478" },
    { urls: "stun:stun.l.google.com:19302" }
  ]
};

var room = "foo";
// Could prompt for room name:
// room = prompt('Enter room name:');

var socket = io.connect();

var txtInput = document.getElementById("type-box");
var sendButton = document.getElementById("send-button");
txtInput.addEventListener("keyup", function(event) {
  if (event.keyCode == 13) {
    event.preventDefault();
    sendButton.click();
  }
});

sendButton.onclick = sendText;
function sendText() {
  var text = txtInput.value;
  if (text !== "") {
    addMessage("(Myself)", text);
    for (var id in idToConn) {
      var conn = idToConn[id];
      conn.textChannel.send(text);
    }
    txtInput.value = "";
  }
}

var chatContainer = document.getElementById("chat-container");
function addMessage(senderName, message) {
  var msg = document.createElement("div");
  msg.classList.add("message");
  msg.innerText = senderName + " : " + message;

  chatContainer.appendChild(msg);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

if (room !== "") {
  socket.emit("create or join", room);
  console.log("Attempted to create or  join room", room);
}

socket.on("created", function(room) {
  console.log("Created room " + room);
});

socket.on("full", function(room) {
  console.log("Room " + room + " is full");
});

// Other person join
socket.on("join", function(room) {
  console.log("Another peer made a request to join room " + room);
});

// I joined
socket.on("joined", function(room) {
  console.log("joined: " + room);
});

socket.on("log", function(array) {
  console.log.apply(console, array);
});

////////////////////////////////////////////////

function broadcastMessage(message) {
  console.log("Client broadcasting message: ", message);
  socket.emit("broadcast", message);
}

function sendMessage(target, message) {
  console.log("Client sending message: ", target, message);
  socket.emit("message", [target, message]);
}

// This client receives a message
socket.on("message", function(packedMessage) {
  console.log("Client received message:", packedMessage);
  var [sender, message] = packedMessage;
  if (message === "got user media") {
    var newConn = createConnection(sender);
    doCall(newConn);
  } else if (message.type === "offer") {
    // TODO : check duplicated offer
    var newConn = createConnection(sender);
    newConn.setRemoteDescription(new RTCSessionDescription(message));
    doAnswer(newConn);
  } else if (message.type === "answer") {
    if (sender in idToConn) {
      var conn = idToConn[sender];
      conn.setRemoteDescription(new RTCSessionDescription(message));
    }
  } else if (message.type === "candidate") {
    if (sender in idToConn) {
      var candidate = new RTCIceCandidate({
        sdpMLineIndex: message.label,
        candidate: message.candidate
      });
      var conn = idToConn[sender];
      conn.addIceCandidate(candidate);
    }
  } else if (message === "bye") {
    handleRemoteHangup(sender);
  }
});

////////////////////////////////////////////////////
navigator.mediaDevices
  .getUserMedia({
    audio: true
  })
  .then(gotStream)
  .catch(function(e) {
    alert("getUserMedia() error: " + e.name);
  });

function gotStream(stream) {
  console.log("Adding local stream.");
  localStream = stream;
  broadcastMessage("got user media");
}

function createConnection(sender) {
  var newConn = null;
  console.log(">>>>>>> createConnection() ", localStream);
  if (typeof localStream !== "undefined") {
    console.log(">>>>>> creating peer connection");
    newConn = new RTCPeerConnection(iceConfig);
    newConn.userDOM = createUserDOM(sender);
    newConn.textChannel = newConn.createDataChannel("sendDataChannel", null);
    newConn.ondatachannel = event => {
      event.channel.onmessage = event => {
        console.log("Data come");
        addMessage(sender, event.data);
      };
    };
    newConn.senderID = sender;
    newConn.onicecandidate = event => {
      handleIceCandidate(newConn, event);
    };
    newConn.onaddstream = event => {
      handleRemoteStreamAdded(newConn.userDOM, event);
    };
    newConn.onremovestream = event => {
      handleRemoteStreamRemoved(newConn.userDOM, event);
    };
    newConn.addStream(localStream);
    console.log("Created RTCPeerConnnection");

    idToConn[sender] = newConn;
  }

  return newConn;
}

window.onbeforeunload = function() {
  hangup();
};

function handleIceCandidate(conn, event) {
  console.log("icecandidate event: ", event);
  if (event.candidate) {
    sendMessage(conn.senderID, {
      type: "candidate",
      label: event.candidate.sdpMLineIndex,
      id: event.candidate.sdpMid,
      candidate: event.candidate.candidate
    });
  } else {
    console.log("End of candidates.");
  }
}

function handleCreateOfferError(event) {
  console.log("createOffer() error: ", event);
}

function doCall(conn) {
  console.log("Sending offer to peer");
  conn.createOffer(sessionDescription => {
    setLocalAndSendMessage(conn, sessionDescription);
  }, handleCreateOfferError);
}

function doAnswer(conn) {
  console.log("Sending answer to peer.");
  conn.createAnswer().then(sessionDescription => {
    setLocalAndSendMessage(conn, sessionDescription);
  }, onCreateSessionDescriptionError);
}

function setLocalAndSendMessage(conn, sessionDescription) {
  conn.setLocalDescription(sessionDescription);
  console.log("setLocalAndSendMessage sending message", sessionDescription);
  sendMessage(conn.senderID, sessionDescription);
}

function onCreateSessionDescriptionError(error) {
  trace("Failed to create session description: " + error.toString());
}

function handleRemoteStreamAdded(dom, event) {
  console.log("Remote stream added.");
  dom.lastElementChild.srcObject = event.stream;
}

function handleRemoteStreamRemoved(dom, event) {
  console.log("Remote stream removed. Event: ", event);
  document.getElementById("videos").removeChild(dom);
}

function hangup() {
  console.log("Hanging up.");
  for (var id in idToConn) {
    var conn = idToConn[id];
    conn.close();
  }
}

function handleRemoteHangup(id) {
  if (id in idToConn) {
    console.log("Other said bye.");
    var conn = idToConn[id];
    conn.close();
    document.getElementById("videos").removeChild(conn.userDOM);
    delete idToConn[id];
  }
}

function createUserDOM(id) {
  var node = document.createElement("div");
  node.classList.add("row");
  node.id = id;

  var label = document.createElement("label");
  label.innerText = id; // TODO : nickname

  var audio = document.createElement("audio");
  audio.volume = 0.75;
  audio.autoplay = true;
  audio.playsinline = true;

  var slider = document.createElement("input");
  slider.id = "slider" + id;
  slider.type = "range";
  slider.min = 0;
  slider.max = 100;
  slider.value = 75;
  slider.oninput = function() {
    audio.volume = slider.value / 100;
  };
  node.appendChild(label);
  node.appendChild(slider);
  node.appendChild(audio);

  document.getElementById("videos").appendChild(node);
  return node;
}
