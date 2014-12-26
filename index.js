var midi = require("midi")
var WebSocket = require("ws")
var Bacon = require("baconjs")

var siteKey = process.env.HORSELIGHTS_SITEKEY
var midiPort = process.argv[2]
var lightId = process.argv[3]

if(siteKey == null || midiPort == null || lightId == null) {
  throw "usage: node index.js midiPort lightId (plus provide site key in env variable HORSELIGHTS_SITEKEY)"
}

console.log("Controlling lightId", lightId);

function isControlMessage(midiMessage) {
  return (midiMessage[0] >> 4) === 0xb
}

function toHoumioMessage(midiMessage) {
  // MIDI gives us 0-127, Houmio expects 0-255
  var midiControllerValue = midiMessage[2]
  var brightness = midiControllerValue * 2
  return {
    command: "set",
    data: {
      _id: lightId,
      on: brightness > 0,
      bri: brightness
    }
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
    messagesToHoumioStream.onValue(function(m) {
      socket.send(JSON.stringify(m))
    })
  })
  socket.on("close", function() { console.log("Websocket closed") })
  socket.on("error", function() { console.log("Websocket error") })
  socket.on("ping", socket.pong)

  return Bacon
    .fromEventTarget(socket, "message", function(message) { return message.data  })
    .map(JSON.parse)
}

var input = new midi.input()

var midiMessages =
  Bacon.fromEventTarget(input, "message", function(deltaTime, message) { return message })

var messagesToHoumio = midiMessages
  .filter(isControlMessage)
  .map(toHoumioMessage)

var messagesFromHoumio = houmioConnection(messagesToHoumio)

messagesFromHoumio.onValue(function(m) {
  console.log("Received message from Houm.io", m)
})

input.openPort(Number(midiPort))
