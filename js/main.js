"use strict";

var localStream;
var idToConn = {};
var myID = null;
var myNickname = null;
var myJoinOrder = null;

var iceConfig = {
  iceServers: [
    { urls: "stun:stun.stunprotocol.org:3478" },
    { urls: "stun:stun.l.google.com:19302" }
  ]
};

var socket = null;
var nicknameInfo = null;

////////////////////////////////////////////////

function broadcastMessage(message) {
  console.log("Client broadcasting message: ", message);
  socket.emit("broadcast", message);
}

function sendMessage(target, message) {
  console.log("Client sending message: ", target, message);
  socket.emit("message", [target, message]);
}

////////////////////////////////////////////////////
function gotStream(stream) {
  console.log("Adding local stream.");
  localStream = stream;
  broadcastMessage({ type: "got user media", joinOrder: myJoinOrder });
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
        addMessage(nicknameInfo[sender], event.data);
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
  label.innerText = nicknameInfo[id];

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

function joinRoom(room, nickname) {
  socket = io.connect();
  navigator.mediaDevices
    .getUserMedia({
      audio: true
    })
    .then(gotStream)
    .catch(function(e) {
      alert("getUserMedia() error: " + e);
    });

  socket.emit("create or join", room, nickname);
  console.log("Attempted to create or  join room", room, nickname);
  myNickname = nickname;
  document.getElementById("myself-label").innerText = nickname + "(Myself)";

  socket.on("created", function(room, userID) {
    console.log("Created room " + room);
    nicknameInfo = {};
    myID = userID;
    myJoinOrder = 0;
  });

  socket.on("full", function(room) {
    console.log("Room " + room + " is full");
  });

  // Other person join
  socket.on("join", function(userId, nickname) {
    nicknameInfo[userId] = nickname;
  });

  // I joined
  socket.on("joined", function(room, userID, currentNicknameInfo, joinOrder) {
    console.log("joined: " + room);
    myID = userID;
    nicknameInfo = currentNicknameInfo;
    myJoinOrder = joinOrder;
  });

  socket.on("log", function(array) {
    console.log.apply(console, array);
  });

  // This client receives a message
  socket.on("message", function(packedMessage) {
    console.log("Client received message:", packedMessage);
    var [sender, message] = packedMessage;
    if (
      message.type === "got user media" &&
      myJoinOrder !== null &&
      myJoinOrder < message.joinOrder
    ) {
      var newConn = createConnection(sender);
      doCall(newConn);
    } else if (message.type === "offer") {
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
    } else if (message.type === "bye") {
      handleRemoteHangup(sender);
    }
  });

  txtInput.addEventListener("keyup", function(event) {
    if (event.keyCode == 13) {
      event.preventDefault();
      sendButton.click();
    }
  });

  sendButton.onclick = sendText;

  window.onbeforeunload = function() {
    hangup();
  };
}

var txtInput = document.getElementById("type-box");
var sendButton = document.getElementById("send-button");
function sendText() {
  var text = txtInput.value;
  if (text !== "") {
    addMessage(myNickname + "(Myself)", text);
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

function main() {
  document.getElementById("roomnumber-button").onclick = () => {
    var roomInput = document.getElementById("roomnumber-input");
    var nicknameInput = document.getElementById("nickname-input");
    if (!roomInput.checkValidity()) {
      return;
    }

    if (!nicknameInput.checkValidity()) {
      return;
    }
    document.getElementById("overlay").remove();
    joinRoom(roomInput.value, nicknameInput.value);
  };
}

main();
