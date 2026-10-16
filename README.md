# FM Synth Visualizer

An interactive, sample-by-sample visualization of two-operator digital FM synthesis, built on the same principle as the Yamaha DX7: every output sample is computed fresh from a phase value, with no recorded sound and no precomputed waveform.

**Live:** https://devmildfire.github.io/fm-synth-visualizer/

## What you see

- **Sample clock** produces the sample index `n` and time `t = n / Fs` (48 000 Hz).
- **Modulator** computes `m(t) = Am × sin(2π × fm × t)`.
- **Modulation index** `I` sets how strongly `m(t)` shifts the carrier's phase.
- **Carrier** computes `y(t) = Ac × sin(2π × fc × t + I × m(t))`.
- **DAC** receives one number per sample.

Values travel between the boxes as tokens and land in slots inside the equations. A slot still waiting for its token keeps the previous sample's value, dimmed. The scope shows a 10 ms window twice: every sample at full speed on top, and the samples the slow animation has finished below.

The page also contains a "How it works" section that compares each step with the DX7's OPS chip, with links to the sources (Ken Shirriff's die-level reverse engineering, Raph Levien's DX7 notes, Chowning's 1973 paper).

## Controls

- **Knobs:** drag up or down; half the window height covers the full range. Mouse wheel and arrow keys make small steps. Frequency and speed knobs are logarithmic.
- **Play / Pause / Step / Reset / Jump** control the slowed animation (0.1 to 1 sample per second).
- **Audio on / Off** plays the same formula in real time through an AudioWorklet; **Volume** is the master gain.

## Run locally

AudioWorklet needs a secure context, so serve the folder instead of opening the file directly:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Files

- `index.html` - page structure and the "How it works" docs
- `style.css` - the vector-phosphor look and the fixed stage layout
- `app.js` - animation, knobs, wires, scope and audio control
- `fm-core.js` - the shared formula used by the visualization
- `fm-worklet.js` - the real-time audio engine (phase accumulators, one sample at a time)

## Simplifications compared with the DX7

- `Math.sin` in floating point instead of fixed-point log-sine and exponential ROMs.
- Two operators and one algorithm instead of six operators and 32 algorithms; no envelopes, no feedback.
- 48 000 Hz instead of 49 096 Hz.

Plain HTML, CSS and JavaScript with the Web Audio API; no build step and no dependencies.
