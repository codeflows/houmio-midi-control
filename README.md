houmio-midi-control
===================

Control dimmable Houm.io lights with a standard MIDI controller.

## Usage

1. Plug-in a MIDI controller that can send MIDI control messages (I have an [Akai MPK mini](http://www.akaipro.com/product/mpkmini))
2. Find out the `_id` of your dimmable Houm.io light from the list at: `https://houm.herokuapp.com/api/site/<YOUR-SITEKEY>/light`
3. Install this app:
```
$ npm install
$ export HORSELIGHTS_SITEKEY=<YOUR-SITEKEY>
$ node index.js <_id>
```
Then, twist the controller knobs on your MIDI controller!

## TODO

* Uses hard-coded MIDI input number
* Light configuration is cumbersome
* Only supports one light (since the controller number is ignored for now)
* Only tested on OS X
