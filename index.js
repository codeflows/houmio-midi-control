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

function readConfigurationJson() {
  return Bacon
    .fromNodeCallback(fs.readFile, "config.json")
    .map(JSON.parse)
}

function validateConfiguration(configuration) {
  if(configuration.siteKey == null) {
    return new Bacon.Error("siteKey must be defined in config.json")
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
    pairings: configuration.pairings,
    midiInputPortNumber: midiInputPortNumber
  }
}

var configuration = readConfigurationJson().flatMap(validateConfiguration)

configuration.onError(function(error) {
  console.log("ERROR:", error)
  process.exit(1)
})

function isControlMessage(midiMessage) {
  return (midiMessage[0] >> 4) === 0xb
}

function toHoumioMessage(configuration, midiMessage) {
  // MIDI gives us 0-127, Houmio expects 0-255
  var midiControllerNumber = midiMessage[1]
  var midiControllerValue = midiMessage[2]
  var brightness = midiControllerValue * 2
  return {
    command: "set",
    data: {
      _id: configuration.pairings[midiControllerNumber.toString()],
      on: brightness > 0,
      bri: brightness
    }
  }
}

// TODO error handling, reconnection etc
function houmioWebSocket(siteKey) {
  var socket = new WebSocket("wss://houm.herokuapp.com")
  socket.on("open", function() {
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

  var midiMessages =
    Bacon.fromEventTarget(midiInput, "message", function(deltaTime, message) { return message })
  var midiControlMessages = midiMessages.filter(isControlMessage)

  if(process.argv[2] === "learn") {
    console.log("Midi learn mode!")

    console.log("Open Houm.io UI at https://houm.herokuapp.com/site/" + configuration.siteKey)
    console.log("and move the dimmer you'd like to control with MIDI.")

    var dimmerTouched =
      messagesFromHoumio
        .filter(function(message) { return message.command === 'newlightstate' })
        .map(function(message) { return message.data._id })
        .skipDuplicates()
        .log("\nGreat! Now turn the MIDI controller knob you'd like to assign to light with id")

    var midiControllerTurned = midiControlMessages.map(function(midiMessage) {
      var controllerNumber = midiMessage[1]
      return controllerNumber
    })

    var pairing =
      dimmerTouched
        .sampledBy(midiControllerTurned, function(a, b) { return [a, b] })
        .skipDuplicates(_.isEqual)

    pairing.onValue(function(a) {
      console.log("Paired light " + a[0] + " with MIDI controller " + a[1])
    })

  } else {
    console.log("Controlling Houm.io lights using MIDI", configuration)
    var messagesToHoumio = midiControlMessages
      .filter(function(message) {
        var controllerNumber = message[1]
        var pairing = configuration.pairings[controllerNumber.toString()]
        console.log("Pairing for ctrl " + controllerNumber + "=" + pairing)
        return pairing
      })
      .map(_.partial(toHoumioMessage, configuration))
      .onValue(function(m) {
        console.log("Send", m)
        socket.send(JSON.stringify(m))
      })
  }

  midiInput.openPort(configuration.midiInputPortNumber)
})
