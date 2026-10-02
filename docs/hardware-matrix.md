# Hardware test matrix

Filled in at each HARDWARE GATE. One row per device/browser combination tested.

| Date       | Board    | Host device            | OS / version | Browser / version    | Transport | Powers board | Flash OK                     | Notes                                                        |
| ---------- | -------- | ---------------------- | ------------ | -------------------- | --------- | ------------ | ---------------------------- | ------------------------------------------------------------ |
| 2026-10-02 | ARIES v3 | MacBook Air (Mac16,12) | macOS 26.4   | Chrome 154.0.8037.59 | webserial | Y            | Y (RAM: blink, hello-serial) | No driver install. DTR/RTS don't reset; RESET button needed. |
