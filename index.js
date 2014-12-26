var midi = require("midi")
var WebSocket = require("ws")
var Bacon = require("baconjs")

var siteKey = process.env.HORSELIGHTS_SITEKEY
var lightId = process.argv[2]

if(siteKey == null || lightId == null) {
  throw "Please provide site key in environment variable and light id as command line parameter"
}

console.log("Controlling lightId", lightId);

function putLightState(state) {
  console.log("Putting state", state)
  var url = "https://houm.herokuapp.com/api/site/" + siteKey + "/light/state"
  request({ method: "PUT", url: url, body: state, json: true }, function (error, response, body) {
    if(error) {
      console.log("Failed putting light state to", state)
    }
  })
}

function isControlMessage(midiMessage) {
  return (midiMessage[0] >> 4) === 0xb
}

function toHoumioLightState(midiMessage) {
  // MIDI gives us 0-127, Houmio expects 0-255
  var midiControllerValue = midiMessage[2]
  var brightness = midiControllerValue * 2
  return {
    _id: lightId,
    on: brightness > 0,
    bri: brightness
  }
}

// TODO error handling, reconnection etc
function houmioConnection(messagesToHoumioStream) {
  var socket = new WebSocket("wss://houm.herokuapp.com")
  socket.on("open", function() {
    console.log("Connected to Houm.io")
    var subscribe = JSON.stringify({ command: "subscribe", data: { sitekey: siteKey } })
    socket.send(subscribe)
    Bacon.interval(3000).onValue(function() {
      socket.ping(null, {}, false)
    })
  })
  socket.on("close", function() { console.log("Websocket closed") })
  socket.on("error", function() { console.log("Websocket error") })
  socket.on("ping", socket.pong)
  return Bacon.fromEventTarget(socket, "message", function(message) { return message.data  })
}

var input = new midi.input()

var midiMessages =
  Bacon.fromEventTarget(input, "message", function(deltaTime, message) { return message })

midiMessages
  .filter(isControlMessage)
  .map(toHoumioLightState)
  .throttle(500)
  .onValue(putLightState)

input.openPort(0)

houmioConnection(null)
  .onValue(function(m) { console.log(m) })
