var siteKey = process.env.HORSELIGHTS_SITEKEY
var lightId = process.argv[2]

if(siteKey == null || lightId == null) {
  throw "Please provide site key in environment variable and light id as command line parameter"
}

console.log("Controlling lightId", lightId);

var midi = require('midi')
var request = require('request')

function putLightState(message) {
  var url = "https://houm.herokuapp.com/api/site/" + siteKey + "/light/state"
  request({ method: 'PUT', url: url, body: message, json: true}, function (error, response, body) {
    if(error) {
      console.log('Failed setting light state to', message)
    }
  });
}

var input = new midi.input()

input.on('message', function(deltaTime, message) {
  var isControlMessage = (message[0] >> 4) === 0xb;
  if(isControlMessage) {
    var controllerValue = message[2];
    var brightness = controllerValue * 2;
    console.log('Set brightness to', brightness);
    putLightState({
      _id: lightId,
      on: brightness > 0,
      bri: brightness
    });
  }
});

input.openPort(0);
