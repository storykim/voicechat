# Voicechat
Simple P2P voicechat application based on [WebRTC](https://webrtc.org/).

# Requirements
* Node.js
* NPM
* HTTPS server
    * You cannot use user's media if a webpage is loaded unsecurely.

# Usage
```
$ git clone git@github.com:storykim/voicechat.git
$ cd voicechat
$ npm install
$ node index.js
```

# Limitations
* If a client is behind a [symmetric NAT](https://en.wikipedia.org/wiki/Network_address_translation#Methods_of_translation), the client cannot use this application.
    * You can solve this problem by using TURN server. 
* Since this application makes `N(N-1)/2` connections when there are `N` users, the load might be high when there are many users in a single room.

# Author
Donghwa Kim([@storykim](https://github.com/storykim))

# License
MIT License