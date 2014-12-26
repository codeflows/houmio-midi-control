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
function houmioWebSocket(siteKey) {
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
  return socket
}

configuration.onValue(function(configuration) {
  var socket = houmioWebSocket(configuration.siteKey)
  var messagesFromHoumio =
    Bacon
      .fromEventTarget(socket, "message", function(message) { return message.data  })
      .map(JSON.parse)
  messagesFromHoumio.onValue(function(m) {
    console.log("Received message from Houm.io", m)
  })

  var midiMessages =
    Bacon.fromEventTarget(midiInput, "message", function(deltaTime, message) { return message })

  if(process.argv[2] === "learn") {
    console.log("Midi learn mode!")

    console.log("1) Open Houm.io UI at https://houm.herokuapp.com/site/" + configuration.siteKey)
    console.log("2) Move the dimmer you'd like to control with MIDI")
    console.log("3) Move the MIDI controller knob you'd like to assign this dimmer to.")

    return
  } else {
    var messagesToHoumio = midiMessages
      .filter(isControlMessage)
      .map(_.partial(toHoumioMessage, configuration.lightId))
      .onValue(function(m) {
        socket.send(JSON.stringify(m))
      })
  }

  midiInput.openPort(configuration.midiInputPortNumber)
})
