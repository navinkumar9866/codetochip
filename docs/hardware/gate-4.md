# Hardware Gate 4 — Android test guide

Goal: the full flow works on at least **5 Android phones**, including a Samsung, a Pixel and one budget phone (e.g. Redmi or Realme). Record every phone in `docs/hardware-matrix.md`, including failures. They're the useful ones.

About 15 minutes per phone once set up.

## One-time setup on the Mac

```sh
brew install android-platform-tools   # provides adb
pnpm worker:build                     # if not built yet
pnpm --filter @codetochip/web dev     # web app on :5173
pnpm --filter @codetochip/compiler start   # compile API on :3001 (separate terminal)
```

## Per phone: reach the dev server over Wi-Fi

The phone's USB port is busy with the board, so use **wireless debugging** (Android 11+). WebUSB only works on secure pages, so the phone must open `localhost` (forwarded to the Mac), not the Mac's IP address.

1. **Turn on wireless debugging.** On the phone, enable Developer options (tap Build number 7 times), then turn on **Wireless debugging**. The phone and Mac must be on the same Wi-Fi.
2. **Pair the phone.** Tap **Pair device with pairing code**, then on the Mac:
   ```sh
   adb pair <ip>:<pairing-port>        # enter the 6-digit code
   adb connect <ip>:<port>             # the port shown on the Wireless debugging screen
   adb reverse tcp:5173 tcp:5173
   ```
3. **Open the test page.** In Chrome on the phone, open:
   `http://localhost:5173/ide?example=builtin-hello-serial&services=memory`

   `services=memory` skips Firebase. To test accounts too, also run `adb reverse` for ports 9099 and 8080, start the emulators, and drop the parameter.

## The test

Plug in the board with the OTG adapter. J12 must be open (no cap).

1. **Power.** Does the board's power light turn on? Record "Powers board" Y/N.
2. **Upload.** Tap **Upload** in the bottom bar, pick the board, and tap **Allow**. When the orange banner appears, press **RESET**.
   - Expect "Uploaded. Your program is running." and the Monitor view counting "Hello from CodeToChip 0, 1, 2…".
3. **Symbol toolbar.** Go back to **Code** and type with the on-screen keyboard and the symbol bar. Does the bar stay just above the keyboard?
4. **Replug.** Unplug the board for 3 seconds and plug it back in.
   - Expect "Board reconnected." and the counter continuing after you press RESET.
5. **Screen off.** Start an upload of `blink`, press RESET, and leave the phone alone. Does the screen stay on until it finishes, and does it finish?

### Extra: can the phone reset the board? (open question 1)

Open `http://localhost:5173/spike/flash` on the phone:

1. **Connect.** Choose **WebUSB + bridge driver** and tap **Connect**.
2. **Try each pin.** Under **Bridge GPIO**, pick GPIO0 and tap **Pulse low**. Repeat for GPIO1 to GPIO6.
3. **Watch the console.** Does the boot banner appear for any pin? Note which one.
4. **Save a transcript.** Record a transcript (`android-gpio-reset`) and use **Save to repo**. It saves into the Mac's repo through the same connection.

If one pin resets the board, Android can reset it automatically, with no RESET button. I'll add that as a manifest reset strategy.

## What to record per phone

| Field           | Example                                             |
| --------------- | --------------------------------------------------- |
| Phone model     | Samsung Galaxy A15                                  |
| Android version | 15                                                  |
| Chrome version  | `chrome://version`                                  |
| Powers board    | Y                                                   |
| Upload OK       | Y                                                   |
| Notes           | OTG had to be switched on in Settings; GPIO2 resets |
