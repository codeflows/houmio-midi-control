var midi = require('midi')
var input = new midi.input()

input.on('message', function(deltaTime, message) {
  console.log("Got", message[0].toString(16), message[1].toString(16), message[2].toString(16));
  var isControlMessage = (message[0] >> 4) === 0xb;
  if(isControlMessage) {
    var controllerNumber = message[1];
    var controllerValue = message[2];
    console.log("Controller", controllerNumber, "value", controllerValue);
  }
});

input.openPort(0);
