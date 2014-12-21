var midi = require('midi')
var request = require('request')
var Bacon = require('baconjs')

var siteKey = process.env.HORSELIGHTS_SITEKEY
var lightId = process.argv[2]

if(siteKey == null || lightId == null) {
  throw "Please provide site key in environment variable and light id as command line parameter"
}

console.log("Controlling lightId", lightId);

function putLightState(state) {
  console.log("Putting state", state)
  var url = "https://houm.herokuapp.com/api/site/" + siteKey + "/light/state"
  request({ method: 'PUT', url: url, body: state, json: true }, function (error, response, body) {
    if(error) {
      console.log("Failed putting light state to", state)
    }
  })
}

function isControlMessage(message) {
  return (message[0] >> 4) === 0xb
}

var input = new midi.input()

var midiMessages =
  Bacon.fromEventTarget(input, 'message', function(deltaTime, message) { return message })

var controlMessages = midiMessages.filter(isControlMessage)
var houmioLightState = controlMessages.map(function(message) {
  // MIDI gives us 0-127, Houmio expects 0-255
  var midiControllerValue = message[2]
  var brightness = midiControllerValue * 2
  return {
    _id: lightId,
    on: brightness > 0,
    bri: brightness
  }
})

houmioLightState.throttle(500).onValue(putLightState)

input.openPort(0)
