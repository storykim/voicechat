'use strict';

var localStream;
var idToConn = {};

var iceConfig = {
  'iceServers': [
	  {'urls': 'stun:stun.stunprotocol.org:3478'},
    {'urls': 'stun:stun.l.google.com:19302'},
  ]
};

// Set up audio and video regardless of what devices are present.
var sdpConstraints = {
  offerToReceiveAudio: true,
  offerToReceiveVideo: true
};

/////////////////////////////////////////////

var room = 'foo';
// Could prompt for room name:
// room = prompt('Enter room name:');

var socket = io.connect();

if (room !== '') {
  socket.emit('create or join', room);
  console.log('Attempted to create or  join room', room);
}

socket.on('created', function(room) {
  console.log('Created room ' + room);
});

socket.on('full', function(room) {
  console.log('Room ' + room + ' is full');
});

// Other person join
socket.on('join', function (room){
  console.log('Another peer made a request to join room ' + room);
});

// I joined
socket.on('joined', function(room) {
  console.log('joined: ' + room);
});

socket.on('log', function(array) {
  console.log.apply(console, array);
});

////////////////////////////////////////////////

function sendMessage(message) {
  console.log('Client sending message: ', message);
  socket.emit('message', message);
}

// This client receives a message
socket.on('message', function(packedMessage) {
  console.log('Client received message:', packedMessage);
  var[sender, message] = packedMessage;
  if (message === 'got user media') {
    var newConn = createConnection(sender);
    doCall(newConn);
  } else if (message.type === 'offer') {
    // TODO : check duplicated offer
    var newConn = createConnection(sender);
    newConn.setRemoteDescription(new RTCSessionDescription(message));
    doAnswer(newConn);
  } else if (message.type === 'answer') {
    if (sender in idToConn) {
      var conn = idToConn[sender];
      conn.setRemoteDescription(new RTCSessionDescription(message));
    }
  } else if (message.type === 'candidate') {
    if (sender in idToConn) {
      var candidate = new RTCIceCandidate({
        sdpMLineIndex: message.label,
        candidate: message.candidate
      });
      var conn = idToConn[sender];
      conn.addIceCandidate(candidate);
    }
  } else if (message === 'bye') {
    handleRemoteHangup(sender);
  }
});

////////////////////////////////////////////////////

var localVideo = document.querySelector('#localVideo');
var remoteVideo = document.querySelector('#remoteVideo');

navigator.mediaDevices.getUserMedia({
  audio: false,
  video: true
})
.then(gotStream)
.catch(function(e) {
  alert('getUserMedia() error: ' + e.name);
});

function gotStream(stream) {
  console.log('Adding local stream.');
  localStream = stream;
  localVideo.srcObject = stream;
  sendMessage('got user media');
}

function createConnection(sender) {
  var newConn = null
  console.log('>>>>>>> createConnection() ', localStream);
  if (typeof localStream !== 'undefined') {
    console.log('>>>>>> creating peer connection');
    newConn = new RTCPeerConnection(iceConfig);
    newConn.videoDOM = createVideoDOM(sender);
    newConn.onicecandidate = handleIceCandidate;
    newConn.onaddstream = (event) => {handleRemoteStreamAdded(newConn.videoDOM, event);};
    newConn.onremovestream = (event) => {handleRemoteStreamRemoved(newConn.videoDOM, event);};
    newConn.addStream(localStream);
    console.log('Created RTCPeerConnnection');

    idToConn[sender] = newConn;
  }

  return newConn;
}

window.onbeforeunload = function() {
  hangup();
};

function handleIceCandidate(event) {
  console.log('icecandidate event: ', event);
  if (event.candidate) {
    sendMessage({
      type: 'candidate',
      label: event.candidate.sdpMLineIndex,
      id: event.candidate.sdpMid,
      candidate: event.candidate.candidate
    });
  } else {
    console.log('End of candidates.');
  }
}

function handleCreateOfferError(event) {
  console.log('createOffer() error: ', event);
}

function doCall(conn) {
  console.log('Sending offer to peer');
  conn.createOffer( (sessionDescription) => {setLocalAndSendMessage(conn, sessionDescription);}, handleCreateOfferError);
}

function doAnswer(conn) {
  console.log('Sending answer to peer.');
  conn.createAnswer().then(
    (sessionDescription) => {setLocalAndSendMessage(conn, sessionDescription);},
    onCreateSessionDescriptionError
  );
}

function setLocalAndSendMessage(conn, sessionDescription) {
  conn.setLocalDescription(sessionDescription);
  console.log('setLocalAndSendMessage sending message', sessionDescription);
  sendMessage(sessionDescription);
}

function onCreateSessionDescriptionError(error) {
  trace('Failed to create session description: ' + error.toString());
}

function handleRemoteStreamAdded(dom, event) {
  console.log('Remote stream added.');
  dom.srcObject = event.stream;
}

function handleRemoteStreamRemoved(dom, event) {
  console.log('Remote stream removed. Event: ', event);
  document.getElementById('videos').removeChild(dom);
}

function hangup() {
  console.log('Hanging up.');
  for (var id in idToConn) {
    var conn = idToConn[id];
    conn.close();
  }
  sendMessage('bye');
}

function handleRemoteHangup(id) {
  if (id in idToConn) {
    console.log('Other said bye.');
    var conn = idToConn[id];
    conn.close();
    document.getElementById('videos').removeChild(conn.videoDOM);
    delete idToConn[id];
  }
}

function createVideoDOM(id) {
  var node = document.createElement("video");
  node.id = id;
  node.autoplay = true;
  node.playsinline = true;
  document.getElementById('videos').appendChild(node);
  return node;
}
