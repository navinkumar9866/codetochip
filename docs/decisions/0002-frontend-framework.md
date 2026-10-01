# 0002 — Frontend framework: React web PWA vs Flutter

Date: 2026-10-01 · Status: accepted (Navin, 2026-10-01)

## Context

The frontend must:

- run in a browser with no install, on desktop and Android
- talk to boards over **Web Serial** (desktop) and **WebUSB** (Android)
- host a good **code editor** that works with a phone keyboard
- load fast on budget Android phones over mobile data
- work offline as a PWA

The flasher (`packages/flasher`) is TypeScript and must stay framework-free. The admin panel is separate (see ADR 0001).

## Options

- **A. React + Vite PWA** (current scaffold).
- **B. Flutter** for web and/or a native Android app.

## Flutter: pros and cons

**Pros**

- **One codebase for web, a native Android app, iOS and desktop apps,** with a consistent, polished UI.
- **A native Android app could use Android's USB host API directly** (e.g. the `usb_serial` package, built on usb-serial-for-android). That covers more USB-serial chips and phones than Chrome's WebUSB, and survives the screen turning off mid-flash.
- **First-class Firebase support** (FlutterFire), so it fits ADR 0001.
- **App store presence** on Play Store, which helps discovery for some students.

**Cons**

- **Flutter web is a canvas app.** It downloads a WASM rendering engine (roughly 2 MB+ before our own code) and starts slower on budget phones. This works against "Blink in under 2 minutes" on mobile data.
- **No first-party Web Serial or WebUSB support.** Every USB call would go through Dart→JavaScript interop, or the TypeScript flasher would have to be rewritten in Dart. The flasher is the hardest and most-tested part of the product.
- **The code editor is the weak spot.** The mature editors (CodeMirror, Monaco) are JavaScript. Dart editors (e.g. `re_editor`, `flutter_code_editor`) are less mature in syntax highlighting, error markers, IME/keyboard handling, and selection on mobile. Embedding CodeMirror in Flutter web through a platform view is possible but fiddly with focus and keyboard.
- **Poor for SEO and public pages:** landing pages and lessons rendered on a canvas aren't indexed well.
- **A native app breaks the "no installs" promise** and adds Play Store review and release management.
- **iOS still can't flash.** A native iOS app can't talk to generic USB-serial devices either, so Flutter gains nothing there.
- **Two languages** (Dart for the UI, TypeScript for the flasher, compiler and admin) need two skill sets to maintain.

## React + Vite PWA: pros and cons

**Pros**

- Web Serial, WebUSB, CodeMirror and IndexedDB are all native JavaScript APIs or libraries. Nothing has to be bridged.
- **Small initial load** and fast start on budget phones. Installable and offline as a PWA.
- **One language (TypeScript) across UI, flasher, compiler and tooling,** and the largest hiring pool.
- Normal HTML, so public pages can be SEO-friendly and accessible.

**Cons**

- **Android flashing depends on Chrome's WebUSB** plus our own bridge drivers. Some phones and chips may misbehave (to be measured at Hardware Gate 4).
- **No app store presence** unless we wrap the app.
- **Getting a native feel on mobile takes deliberate design work.**

## Recommendation

**Keep React + Vite as a PWA for the product.** The core promise (browser, no installs) and the two hardest pieces (USB flashing and the code editor) are native to the web platform and awkward in Flutter.

**If Hardware Gate 4 shows that WebUSB on Android isn't reliable enough,** add a native Android app at that point. Prefer **Capacitor** (wrapping the same React app, with a small native USB-serial plugin) over Flutter, because it reuses all the existing UI and TypeScript flasher code. Re-evaluate Flutter only if we decide to build a separate, mobile-first native app with a different UI.
