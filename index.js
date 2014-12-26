var midi = require("midi")
var WebSocket = require("ws")
var Bacon = require("baconjs")
var fs = require("fs")
var _ = require("lodash")

var midiInput = new midi.input()

function listMidiInputPorts() {
  var inputs = []
  for(var i = 0; i < midiInput.getPortCount(); i++) {
    inputs.push(midiInput.getPortName(i))
  }
  return inputs
}

var configurationFile =
  Bacon
    .fromNodeCallback(fs.readFile, "config.json")
    .map(JSON.parse)

var configuration = configurationFile.flatMap(function(configuration) {
  if(configuration.siteKey == null || configuration.lightId == null) {
    return new Bacon.Error("siteKey and lightId must be defined in config.json")
  }

  var midiInputPorts = listMidiInputPorts()
  var midiInputPortNumber = midiInputPorts.indexOf(configuration.midiInputPortName)
  if(midiInputPortNumber === -1) {
    return new Bacon.Error(
      "Configured MIDI port \"" + configuration.midiInputPortName + "\" not found!\n" +
      "Available ports are:\n  " + midiInputPorts.join("\n  ")
    )
  }
  return {
    siteKey: configuration.siteKey,
    lightId: configuration.lightId,
    midiInputPortNumber: midiInputPortNumber
  }
})

configuration.onError(function(error) {
  console.log("ERROR:", error)
  process.exit(1);
})

function isControlMessage(midiMessage) {
  return (midiMessage[0] >> 4) === 0xb
}

function toHoumioMessage(lightId, midiMessage) {
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
function houmioConnection(siteKey, messagesToHoumioStream) {
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

configuration.onValue(function(configuration) {
  var midiMessages =
    Bacon.fromEventTarget(midiInput, "message", function(deltaTime, message) { return message })

  var messagesToHoumio = midiMessages
    .filter(isControlMessage)
    .map(_.partial(toHoumioMessage, configuration.lightId))

  var messagesFromHoumio = houmioConnection(configuration.siteKey, messagesToHoumio)
  messagesFromHoumio.onValue(function(m) {
    console.log("Received message from Houm.io", m)
  })

  midiInput.openPort(configuration.midiInputPortNumber)
})
