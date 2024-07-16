
try

```
screenpipe -h

Usage: screenpipe [OPTIONS]

Options:
  -f, --fps <FPS>
          FPS for continuous recording [default: 5]
  -a, --audio-chunk-duration <AUDIO_CHUNK_DURATION>
          Audio chunk duration in seconds [default: 30]
  -p, --port <PORT>
          Port to run the server on [default: 3030]
      --disable-audio
          Disable audio recording
      --memory-threshold <MEMORY_THRESHOLD>
          Memory usage threshold for restart (in percentage) [default: 80]
      --runtime-threshold <RUNTIME_THRESHOLD>
          Runtime threshold for restart (in minutes) [default: 60]
      --restart-enabled
          Enable automatic restart when resource thresholds are exceeded. This feature will automatically restart the application if the memory usage or runtime exceeds the specified thresholds, helping to ensure stability and prevent potential crashes or performance degradation
      --audio-device <AUDIO_DEVICE>
          Audio devices to use (can be specified multiple times)
      --list-audio-devices
          List available audio devices
      --data-dir <DATA_DIR>
          Data directory [default: ./data]
      --debug
          Enable debug logging for screenpipe modules
  -h, --help
          Print help
  -V, --version
          Print version
```

some usages with audio devices:


```
screenpipe --list-audio-devices
Available audio devices:
  1. BlackHole 16ch (input)
  2. MacBook Pro Microphone (input)
  3. louisbeaumont.me iphone Microphone (input)
  4. Immersed (input)
  5. EpocCam Microphone (input)
  6. Display 1 (output)
```

for example if I want to record my iPhone mic + macbook pro during an IRL meeting:

```
screenpipe --audio-device "beaumont.me iphone Microphone (input)" --audio-device "MacBook Pro Microphone (input)"
```

Display 1 is usually the output device, like for example when you listen to music, or in a video call.


for the data dir we recommend to use something like

```
screenpipe --data-dir $HOME/.screenpipe
```

on mac and linux


if you have performance issue, feel free to lower the fps or disable audio:

```
screenpipe --disable-audio
```

