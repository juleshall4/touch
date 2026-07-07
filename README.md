<p align="center">
  <img src="https://placehold.co/1200x630/e5e7eb/6b7280?text=Touch+typing+practice+with+live+hand+tracking" alt="Touch app preview placeholder" width="100%">
</p>

<h1 align="center">Touch</h1>

<p align="center">
  <strong>Make touch typing visible.</strong>
</p>

<p align="center">
  A playful typing practice app that watches your hands while you type, tracks
  your fingertips, and turns each keypress into feedback you can actually see.
</p>

<p align="center">
  <code>React</code> · <code>TypeScript</code> · <code>Vite</code> · <code>Tailwind CSS</code> · <code>MediaPipe</code>
</p>

<p align="center">
  <a href="#quick-start"><strong>Quick Start</strong></a> ·
  <a href="#camera-setup"><strong>Camera Setup</strong></a> ·
  <a href="#using-touch"><strong>Using Touch</strong></a>
</p>

## What It Does

- Tracks both hands in the browser with MediaPipe hand landmarks.
- Lets you calibrate where keys appear in the camera preview.
- Scores each keypress against the expected touch-typing finger.
- Shows a live prompt, score, debug readout, and per-key heatmap.
- Keeps calibration in local browser storage, so setup survives refreshes.

<p align="center">
  <img src="https://placehold.co/1200x675/f3f4f6/6b7280?text=Camera+preview+%2B+calibrated+keyboard+overlay" alt="Camera calibration placeholder" width="100%">
</p>

## Why It Exists

Most typing tools only know what you typed. Touch cares how you typed it.

That makes it useful for catching small habits that are hard to notice in the
moment: stretching the wrong finger, drifting away from home row, or favoring one
hand when another should be doing the work.

## Camera Setup

Touch works best when the camera is looking straight down at the keyboard.

<p align="center">
  <img src="https://placehold.co/1200x620/f3f4f6/6b7280?text=Top-down+camera+view+over+keyboard" alt="Top-down camera setup placeholder" width="100%">
</p>

<p align="center">
  <strong>Best angle:</strong> camera above the keyboard, lens facing down, hands fully visible, keyboard filling most of the frame.
</p>

## Quick Start

<table>
  <tr>
    <td><strong>1. Install</strong></td>
    <td>

```sh
bun install
```

  </td>
  </tr>
  <tr>
    <td><strong>2. Run</strong></td>
    <td>

```sh
bun run dev
```

  </td>
  </tr>
  <tr>
    <td><strong>3. Open</strong></td>
    <td>Open the local URL from Vite and allow camera access.</td>
  </tr>
</table>

## Using Touch

1. Put your keyboard and hands clearly in view of the camera.
2. Select a key from the control bar.
3. Click that key's position in the camera preview.
4. Repeat until the keyboard overlay matches your real keyboard.
5. Type the prompt and watch the score, status, and heatmap update.

<p align="center">
  <strong>Tip:</strong> press <code>Tab</code> to reset the practice round.
</p>

<p align="center">
  <img src="https://placehold.co/1200x520/e5e7eb/6b7280?text=Per-key+accuracy+heatmap" alt="Typing heatmap placeholder" width="100%">
</p>

<table>
  <tr>
    <td align="center"><strong>Calibrate</strong><br>Click the real key positions.</td>
    <td align="center"><strong>Type</strong><br>Work through the prompt.</td>
    <td align="center"><strong>Compare</strong><br>Expected finger vs tracked fingertip.</td>
    <td align="center"><strong>Improve</strong><br>Use the heatmap to clean up weak spots.</td>
  </tr>
</table>

## Project Shape

```txt
src/
  App.tsx              browser camera, hand tracking, calibration, scoring
  components/ui/      small reusable UI pieces
  lib/                shared utilities
```

## Scripts

```sh
bun run dev      # start the Vite dev server
bun run build    # type-check and build for production
bun run preview  # preview the production build
```

## Tech

<p align="center">
  <code>React 19</code>
  <code>TypeScript</code>
  <code>Vite</code>
  <code>Tailwind CSS 4</code>
  <code>MediaPipe Tasks Vision</code>
  <code>Bun</code>
</p>

## Notes

Touch is early, local-first, and intentionally small. Calibration is manual
because it keeps the first version understandable and lets the app adapt to real
desks, cameras, keyboards, and lighting without pretending the physical world is
tidier than it is.

The practice prompts are short quotes filtered from the reusable
[dwyl/quotes](https://github.com/dwyl/quotes) collection.
