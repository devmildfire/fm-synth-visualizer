/**
 * Main Application - Interactive FM Synthesis Visualizer
 * 
 * Handles:
 * - Educational animation (slowed down, one sample every two seconds by default)
 * - Real-time audio via AudioWorklet
 * - Parameter controls and UI updates
 * - Waveform visualization
 */

import * as FM from './fm-core.js';

// State
let audioContext = null;
let audioWorkletNode = null;
let masterGainNode = null;
let audioReadyPromise = null;
let isAudioRunning = false;
let masterVolume = 0.05;

// Animation state
let isAnimating = false;
let animationSpeed = 0.1; // samples per second: one sample every 10 s
let currentSampleIndex = 0;
let animationLoopGeneration = 0;
let activeTokenAnimation = null;

// Phones get a stacked layout (see the max-width: 760px block in style.css).
const mobileQuery = window.matchMedia('(max-width: 760px)');

// Sample rate from audio context
let sampleRate = 48000;

// Parameters
let params = { ...FM.DEFAULT_PARAMS };

// DOM Elements - cached for performance
const elements = {};

// Token animation state
const tokens = {
    clockToMod: null,
    clockToCarrier: null,
    indexToCarrier: null,
    modToCarrier: null,
    carrierToDac: null
};

// Initialize DOM elements
function cacheElements() {
    elements.sampleIndex = document.getElementById('sample-index');
    elements.sampleTime = document.getElementById('sample-time');
    elements.sampleRate = document.getElementById('sample-rate');
    elements.clockToken = document.getElementById('clock-token');
    
    elements.modT = document.getElementById('mod-t');
    elements.modAmplitude = document.getElementById('mod-amplitude');
    elements.modFrequency = document.getElementById('mod-frequency');
    elements.modAmplitudeTerm = document.getElementById('mod-amplitude-term');
    elements.modFrequencyTerm = document.getElementById('mod-frequency-term');
    elements.modOutputToken = document.getElementById('mod-output-token');
    
    elements.modulationIndex = document.getElementById('modulation-index');
    elements.modulationIndexTerm = document.getElementById('modulation-index-term');
    elements.indexOutputToken = document.getElementById('mi-output-token');
    
    elements.carrierT = document.getElementById('carrier-t');
    elements.carrierModInput = document.getElementById('carrier-mod-input');
    elements.carrierAmplitude = document.getElementById('carrier-amplitude');
    elements.carrierFrequency = document.getElementById('carrier-frequency');
    elements.carrierAmplitudeTerm = document.getElementById('carrier-amplitude-term');
    elements.carrierFrequencyTerm = document.getElementById('carrier-frequency-term');
    elements.carrierOutputToken = document.getElementById('carrier-output-token');
    
    elements.dacInputToken = document.getElementById('dac-input-token');
    
    elements.startBtn = document.getElementById('start-btn');
    elements.pauseBtn = document.getElementById('pause-btn');
    elements.stepBtn = document.getElementById('step-btn');
    elements.resetBtn = document.getElementById('reset-btn');
    elements.speedControl = document.getElementById('speed-control');
    elements.speedDisplay = document.getElementById('speed-display');
    elements.jumpInput = document.getElementById('jump-input');
    elements.jumpBtn = document.getElementById('jump-btn');
    elements.audioStartBtn = document.getElementById('audio-start-btn');
    elements.audioStopBtn = document.getElementById('audio-stop-btn');
    elements.volumeControl = document.getElementById('volume-control');
    elements.volumeDisplay = document.getElementById('volume-display');
    
    elements.scope = document.getElementById('scope-svg');
    elements.scopeFullLine = document.getElementById('scope-full-line');
}

// Initialize the application
async function init() {
    cacheElements();
    setupKnobs();
    setupEventListeners();
    updateSampleRateDisplay();
    updateAllDisplays();
    fitStage();
    window.addEventListener('resize', fitStage);
    mobileQuery.addEventListener('change', () => {
        refreshVisualization(); // slot time format differs between layouts
        fitStage();
    });
    document.fonts?.ready.then(fitStage); // slot positions move once the web fonts arrive
}

function initAudioContext() {
    if (!audioReadyPromise) {
        // Ask for 48 kHz explicitly: otherwise the context follows the output device, which can be
        // 8 or 16 kHz (e.g. a headset in call mode). The browser resamples to the device itself.
        try {
            audioContext = new AudioContext({ sampleRate: 48000 });
        } catch {
            audioContext = new AudioContext();
        }
        sampleRate = audioContext.sampleRate;
        updateSampleRateDisplay();
        refreshVisualization();
        audioReadyPromise = loadAudioWorklet().catch(async (error) => {
            console.error('Failed to load AudioWorklet:', error);
            await audioContext.close();
            audioContext = null;
            audioReadyPromise = null;
            throw error;
        });
    }
    return audioReadyPromise;
}

async function loadAudioWorklet() {
    await audioContext.audioWorklet.addModule('fm-worklet.js');
    audioWorkletNode = new AudioWorkletNode(audioContext, 'fm-processor', {
        outputChannelCount: [2]
    });
    masterGainNode = audioContext.createGain();
    masterGainNode.gain.value = 0;

    audioWorkletNode.connect(masterGainNode);
    masterGainNode.connect(audioContext.destination);
    sendParamsToWorklet();
    console.log('AudioWorklet loaded successfully');
}

function sendParamsToWorklet() {
    if (audioWorkletNode) {
        audioWorkletNode.port.postMessage({
            type: 'params',
            params: { ...params }
        });
    }
}

// Event Listeners
function setupEventListeners() {
    // Parameter controls
    elements.modAmplitude.addEventListener('input', (e) => {
        params.Am = parseFloat(e.target.value);
        refreshVisualization();
        sendParamsToWorklet();
    });
    
    elements.modFrequency.addEventListener('input', (e) => {
        params.fm = parseInt(e.target.value, 10);
        refreshVisualization();
        sendParamsToWorklet();
    });
    
    elements.carrierAmplitude.addEventListener('input', (e) => {
        params.Ac = parseFloat(e.target.value);
        refreshVisualization();
        sendParamsToWorklet();
    });
    
    elements.carrierFrequency.addEventListener('input', (e) => {
        params.fc = parseInt(e.target.value, 10);
        refreshVisualization();
        sendParamsToWorklet();
    });
    
    elements.modulationIndex.addEventListener('input', (e) => {
        params.I = parseFloat(e.target.value);
        refreshVisualization();
        sendParamsToWorklet();
    });
    
    // Animation controls
    elements.startBtn.addEventListener('click', startAnimation);
    elements.pauseBtn.addEventListener('click', pauseAnimation);
    elements.stepBtn.addEventListener('click', stepAnimation);
    elements.resetBtn.addEventListener('click', resetAnimation);
    
    elements.speedControl.addEventListener('input', (e) => {
        animationSpeed = parseFloat(e.target.value);
        elements.speedDisplay.textContent = `${animationSpeed.toFixed(1)}/s`;
        cancelActiveTokenAnimation();
    });
    
    elements.jumpBtn.addEventListener('click', () => {
        const target = parseInt(elements.jumpInput.value, 10);
        if (!isNaN(target) && target >= 0) {
            jumpToSample(target);
        }
    });
    
    elements.jumpInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            elements.jumpBtn.click();
        }
    });
    
    // Audio controls
    elements.audioStartBtn.addEventListener('click', startAudio);
    elements.audioStopBtn.addEventListener('click', stopAudio);
    
    elements.volumeControl.addEventListener('input', (e) => {
        masterVolume = parseFloat(e.target.value);
        elements.volumeDisplay.textContent = masterVolume.toFixed(2);
        if (isAudioRunning) {
            setMasterGain(masterVolume);
        }
    });
}

// Knobs: vertical drag over half the viewport height covers the full range.
// data-scale="log" knobs move in equal ratios (musical steps) instead of equal Hz.
const KNOB_NUDGE = 1 / 450; // wheel notch / arrow key, as a fraction of the travel

function knobPos(input) {
    const min = Number(input.min);
    const max = Number(input.max);
    const value = Number(input.value);
    return input.dataset.scale === 'log'
        ? Math.log(value / min) / Math.log(max / min)
        : (value - min) / (max - min);
}

function setKnobPos(input, pos) {
    const min = Number(input.min);
    const max = Number(input.max);
    const p = Math.min(1, Math.max(0, pos));
    const old = input.value;
    // The range input rounds to its step and clamps to min/max.
    input.value = input.dataset.scale === 'log' ? min * (max / min) ** p : min + p * (max - min);
    if (input.value !== old) input.dispatchEvent(new Event('input'));
}

function nudgeKnob(input, direction) {
    const old = input.value;
    setKnobPos(input, knobPos(input) + direction * KNOB_NUDGE);
    // Near the bottom of a log range one nudge can round back to the same step.
    if (input.value === old) {
        direction > 0 ? input.stepUp() : input.stepDown();
        if (input.value !== old) input.dispatchEvent(new Event('input'));
    }
}

// A knob copy (data-mirror) drives its original, and follows it when the original moves.
function setupMirrors() {
    document.querySelectorAll('.knob-input[data-mirror]').forEach(copy => {
        const original = document.getElementById(copy.dataset.mirror);
        for (const attr of ['min', 'max', 'step', 'data-scale']) {
            if (original.hasAttribute(attr)) copy.setAttribute(attr, original.getAttribute(attr));
        }
        copy.value = original.value;
        copy.addEventListener('input', () => {
            if (original.value === copy.value) return;
            original.value = copy.value;
            original.dispatchEvent(new Event('input'));
        });
        original.addEventListener('input', () => {
            if (copy.value === original.value) return;
            copy.value = original.value;
            updateKnob(copy);
        });
    });
}

function setupKnobs() {
    setupMirrors();
    document.querySelectorAll('.knob-input').forEach(input => {
        const knob = input.parentElement;
        updateKnob(input);
        input.addEventListener('input', () => updateKnob(input));

        knob.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            input.focus();
            knob.setPointerCapture(e.pointerId);
            const startY = e.clientY;
            const startPos = knobPos(input);
            const travel = window.innerHeight / 2;
            const move = (ev) => setKnobPos(input, startPos + (startY - ev.clientY) / travel);
            knob.addEventListener('pointermove', move);
            knob.addEventListener('lostpointercapture', () => knob.removeEventListener('pointermove', move), { once: true });
        });

        knob.addEventListener('wheel', (e) => {
            e.preventDefault();
            nudgeKnob(input, e.deltaY < 0 ? 1 : -1);
        }, { passive: false });

        input.addEventListener('keydown', (e) => {
            const direction = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
            if (!direction) return;
            e.preventDefault();
            nudgeKnob(input, direction);
        });
    });
}

function updateKnob(input) {
    const pos = knobPos(input);
    input.parentElement.style.setProperty('--knob-angle', `${-135 + pos * 270}deg`);
    input.parentElement.style.setProperty('--p', pos);
}

function updateSampleRateDisplay() {
    const spaced = sampleRate.toLocaleString('en-US').replace(/,/g, ' ');
    elements.sampleRate.textContent = `${sampleRate} Hz`;
    document.querySelectorAll('.rate-text').forEach(el => { el.textContent = spaced; });
}

function refreshVisualization() {
    cancelActiveTokenAnimation();
    updateAllDisplays();
}

// Calculate current sample values

// Fixed-width formats so slots never change size: "999.979 ms" / "12.34567 s" (10 chars),
// sample values "-0.1234" (7 chars).
// ponytail: past 100 s (n > 4.8M at 48 kHz) the time string outgrows its slot.
function formatTimeMilliseconds(seconds) {
    return seconds < 1 ? `${(seconds * 1000).toFixed(3)} ms` : `${seconds.toFixed(5)} s`;
}

// Equation slots on phones drop the space: "999.979ms" fits a 9-character slot.
function formatSlotTime(seconds) {
    const text = formatTimeMilliseconds(seconds);
    return mobileQuery.matches ? text.replace(' ', '') : text;
}

function formatSampleValue(value) {
    return value.toFixed(4);
}

// Ports filled by arriving tokens, by animation stage:
// 1 = t and I have landed (modulator computes), 2 = m has landed (carrier computes), 3 = y reached the DAC.
// A port whose token has not arrived keeps the previous sample's value, muted as stale.
const PORT_STAGES = [
    { ids: [], fill: () => {} },
    {
        ids: ['mod-time-slot', 'carrier-time-slot', 'carrier-index-slot', 'mod-output-token'],
        fill: (sample) => {
            elements.modT.textContent = formatSlotTime(sample.t);
            elements.carrierT.textContent = formatSlotTime(sample.t);
            elements.modulationIndexTerm.textContent = params.I.toFixed(2);
            elements.modOutputToken.querySelector('.token-value').textContent = formatSampleValue(sample.modulator.output);
        }
    },
    {
        ids: ['carrier-mod-slot', 'carrier-output-token'],
        fill: (sample) => {
            elements.carrierModInput.textContent = formatSampleValue(sample.modulator.output);
            elements.carrierOutputToken.querySelector('.token-value').textContent = formatSampleValue(sample.carrier.output);
        }
    },
    {
        ids: ['dac-input-token'],
        fill: (sample) => {
            elements.dacInputToken.querySelector('.token-value').textContent = formatSampleValue(sample.carrier.output);
        }
    }
];

function revealUpTo(stage, sample) {
    PORT_STAGES.forEach(({ ids, fill }, i) => {
        if (i <= stage) fill(sample);
        ids.forEach(id => document.getElementById(id).classList.toggle('stale', i > stage));
    });
}

// Shows sample `index`; with `stage` < 3 the ports still waiting for their token stay stale.
function updateAllDisplays(index = currentSampleIndex, stage = 3) {
    const sample = FM.calculateSample(index, sampleRate, params);

    elements.sampleIndex.textContent = index;
    elements.sampleTime.textContent = formatTimeMilliseconds(sample.t);
    elements.clockToken.innerHTML = `<span class="token-label">t = ${formatTimeMilliseconds(sample.t)}</span>`;

    // Knob-controlled values are local to their box, so they are always current.
    elements.modAmplitudeTerm.textContent = params.Am.toFixed(2);
    elements.modFrequencyTerm.textContent = params.fm;
    elements.carrierAmplitudeTerm.textContent = params.Ac.toFixed(2);
    elements.carrierFrequencyTerm.textContent = params.fc;
    elements.indexOutputToken.querySelector('.token-value').textContent = params.I.toFixed(2);

    revealUpTo(stage, sample);
    if (stage === 3) drawWaveform(index);
    drawConnections();
    drawParameterArrows();
}

// Animation loop
async function animationLoop(generation) {
    while (isAnimating && generation === animationLoopGeneration) {
        await stepAnimationInternal();
    }
}

function startAnimation() {
    if (isAnimating) return;
    isAnimating = true;
    const generation = ++animationLoopGeneration;
    elements.startBtn.disabled = true;
    elements.pauseBtn.disabled = false;
    animationLoop(generation);
}

function pauseAnimation() {
    isAnimating = false;
    animationLoopGeneration++;
    cancelActiveTokenAnimation();
    updateAllDisplays(); // back to the last completed sample
    elements.startBtn.disabled = false;
    elements.pauseBtn.disabled = true;
}

async function stepAnimation() {
    pauseAnimation();
    elements.stepBtn.disabled = true;
    try {
        await stepAnimationInternal();
    } finally {
        elements.stepBtn.disabled = false;
    }
}

// The clock ticks to the next sample first; results appear as their tokens arrive.
// An interrupted step leaves currentSampleIndex alone, so the loop retries the same sample.
async function stepAnimationInternal() {
    const sampleIndex = currentSampleIndex + 1;
    const completed = await animateTokens(sampleIndex);
    if (!completed || currentSampleIndex !== sampleIndex - 1) return false;

    currentSampleIndex = sampleIndex;
    elements.jumpInput.value = currentSampleIndex;
    updateAllDisplays();
    return true;
}

function resetAnimation() {
    pauseAnimation();
    currentSampleIndex = 0;
    elements.jumpInput.value = 0;
    updateAllDisplays();
}

function jumpToSample(index) {
    const wasAnimating = isAnimating;
    pauseAnimation();
    currentSampleIndex = index;
    elements.jumpInput.value = index;
    updateAllDisplays();
    if (wasAnimating) {
        startAnimation();
    }
}

// Token Animation System
function animateTokens(sampleIndex) {
    cancelActiveTokenAnimation();
    updateAllDisplays(sampleIndex, 0);

    return new Promise((resolve) => {
        const signalFlow = document.querySelector('.signal-flow');
        const sample = FM.calculateSample(sampleIndex, sampleRate, { ...params });
        const modOutput = sample.modulator.output;
        const carrierOutput = sample.carrier.output;

        const active = { timers: [], animations: [], resolve, finished: false };
        activeTokenAnimation = active;
        const stageDuration = 1000 / (animationSpeed * 3);
        const moveDuration = Math.max(60, stageDuration * 0.9);

        const timeLabel = formatSlotTime(sample.t);
        const clockToModToken = createMovingToken('clock-token', timeLabel, 'clock-to-mod');
        const clockToCarrierToken = createMovingToken('clock-token', timeLabel, 'clock-to-carrier');
        signalFlow.appendChild(clockToModToken);
        signalFlow.appendChild(clockToCarrierToken);
        tokens.clockToMod = clockToModToken;
        tokens.clockToCarrier = clockToCarrierToken;
        // I is an input of the carrier just like t, so it travels in the same stage.
        const indexToken = createMovingToken('index-token', params.I.toFixed(2), 'index-to-carrier');
        signalFlow.appendChild(indexToken);
        tokens.indexToCarrier = indexToken;

        scheduleTokenStage(active, 20, () => {
            active.animations.push(moveTokenAlongPath(clockToModToken, 'clock-to-mod', moveDuration));
            active.animations.push(moveTokenAlongPath(clockToCarrierToken, 'clock-to-carrier', moveDuration));
            active.animations.push(moveTokenAlongPath(indexToken, 'index-to-carrier', moveDuration));
        });
        scheduleTokenStage(active, 20 + moveDuration, () => {
            dropTokens('clockToMod', 'clockToCarrier', 'indexToCarrier');
            revealUpTo(1, sample);
        });

        scheduleTokenStage(active, stageDuration, () => {
            const modToken = createMovingToken(
                'mod-token',
                formatSampleValue(modOutput),
                'mod-to-carrier'
            );
            signalFlow.appendChild(modToken);
            tokens.modToCarrier = modToken;
            active.animations.push(moveTokenAlongPath(modToken, 'mod-to-carrier', moveDuration));
        });
        scheduleTokenStage(active, stageDuration + moveDuration, () => {
            dropTokens('modToCarrier');
            revealUpTo(2, sample);
        });

        scheduleTokenStage(active, stageDuration * 2, () => {
            const carrierToken = createMovingToken(
                'carrier-token',
                formatSampleValue(carrierOutput),
                'carrier-to-dac'
            );
            signalFlow.appendChild(carrierToken);
            tokens.carrierToDac = carrierToken;
            active.animations.push(moveTokenAlongPath(carrierToken, 'carrier-to-dac', moveDuration));
        });
        scheduleTokenStage(active, stageDuration * 2 + moveDuration, () => {
            dropTokens('carrierToDac');
            revealUpTo(3, sample);
            drawWaveform(sampleIndex);
        });

        scheduleTokenStage(active, stageDuration * 3, () => finishTokenAnimation(active, true));
    });
}

function scheduleTokenStage(active, delay, callback) {
    const timer = setTimeout(() => {
        if (!active.finished) callback();
    }, delay);
    active.timers.push(timer);
}

function finishTokenAnimation(active, completed) {
    if (active.finished) return;
    active.finished = true;
    active.timers.forEach(clearTimeout);
    active.animations.forEach(animation => animation?.cancel());
    if (activeTokenAnimation === active) activeTokenAnimation = null;
    clearTokens();
    active.resolve(completed);
}

function cancelActiveTokenAnimation() {
    if (activeTokenAnimation) {
        finishTokenAnimation(activeTokenAnimation, false);
    } else {
        clearTokens();
    }
}

// A landed token hands its value to the port it reached.
function dropTokens(...keys) {
    keys.forEach(key => {
        tokens[key]?.remove();
        tokens[key] = null;
    });
}

// Wires are drawn trimmed to port edges; tokens follow the untrimmed centre-to-centre route.
function routeOf(pathId) {
    const route = document.getElementById('token-route');
    route.setAttribute('d', document.getElementById(pathId).dataset.route);
    return route;
}

// Tokens are sized like the port they fly to, so landing looks like filling it.
const TOKEN_TARGETS = {
    'clock-to-mod': 'mod-time-slot',
    'clock-to-carrier': 'carrier-time-slot',
    'index-to-carrier': 'carrier-index-slot',
    'mod-to-carrier': 'carrier-mod-slot',
    'carrier-to-dac': 'dac-input-token'
};

function createMovingToken(className, text, pathId) {
    const path = routeOf(pathId);
    const start = path.getPointAtLength(0);
    const token = document.createElement('div');
    token.className = `moving-token ${className}`;
    token.style.left = `${start.x}px`;
    token.style.top = `${start.y}px`;
    token.textContent = text;
    token.style.width = `${document.getElementById(TOKEN_TARGETS[pathId]).offsetWidth}px`;
    return token;
}

function moveTokenAlongPath(token, pathId, duration) {
    if (!token || !token.isConnected) return null;
    const path = routeOf(pathId);
    const length = path.getTotalLength();
    const steps = Math.max(24, Math.ceil(length / 12));
    const keyframes = Array.from({ length: steps + 1 }, (_, index) => {
        const offset = index / steps;
        const point = path.getPointAtLength(length * offset);
        return { left: `${point.x}px`, top: `${point.y}px`, offset };
    });
    return token.animate(keyframes, { duration, easing: 'linear', fill: 'forwards' });
}

function clearTokens() {
    Object.values(tokens).forEach(token => {
        if (token && token.isConnected) {
            token.remove();
        }
    });
    tokens.clockToMod = null;
    tokens.clockToCarrier = null;
    tokens.indexToCarrier = null;
    tokens.modToCarrier = null;
    tokens.carrierToDac = null;
}

// The stage is a fixed-size layout scaled to the window, so every measurement is
// converted back to unscaled stage pixels before wires and tokens are placed.
function stageScale() {
    const stage = document.querySelector('.signal-flow');
    return stage.getBoundingClientRect().width / stage.offsetWidth;
}

function stageBox() {
    const stage = document.querySelector('.signal-flow');
    return { left: 0, top: 0, width: stage.offsetWidth, height: stage.offsetHeight };
}

function stageRect(el) {
    const origin = document.querySelector('.signal-flow').getBoundingClientRect();
    const s = stageScale();
    const r = el.getBoundingClientRect();
    const left = (r.left - origin.left) / s;
    const top = (r.top - origin.top) / s;
    return { left, top, width: r.width / s, height: r.height / s, right: left + r.width / s, bottom: top + r.height / s };
}

// Desktop: fit the fixed stage to the window width. Phones: the stage flows at its natural size.
function fitStage() {
    const wrap = document.querySelector('.stage-wrap');
    const stageW = document.querySelector('.signal-flow').offsetWidth;
    wrap.style.setProperty('--s', mobileQuery.matches ? 1 : Math.min(1.35, (window.innerWidth - 32) / stageW));
    drawConnections();
    drawParameterArrows();
}

function drawConnections() {
    const svg = document.querySelector('.connections');
    if (!svg) return;

    const container = stageBox();
    const clock = stageRect(document.querySelector('.clock-box'));
    const clockPort = stageRect(elements.clockToken);
    const mod = stageRect(document.getElementById('modulator-box'));
    const indexOutput = stageRect(document.getElementById('mi-output-token'));
    const carrierIndexSlot = stageRect(document.getElementById('carrier-index-slot'));
    const carrier = stageRect(document.getElementById('carrier-box'));
    const dac = stageRect(document.querySelector('.dac-box'));
    const modTimeSlot = stageRect(document.getElementById('mod-time-slot'));
    const carrierTimeSlot = stageRect(document.getElementById('carrier-time-slot'));
    const modOutput = stageRect(document.getElementById('mod-output-token'));
    const carrierModSlot = stageRect(document.getElementById('carrier-mod-slot'));
    const carrierOutput = stageRect(document.getElementById('carrier-output-token'));
    const dacInput = stageRect(document.getElementById('dac-input-token'));
    const x = rect => rect.left - container.left;
    const y = rect => rect.top - container.top;
    const centerX = rect => x(rect) + rect.width / 2;
    const centerY = rect => y(rect) + rect.height / 2;
    const right = rect => x(rect) + rect.width;
    const bottom = rect => y(rect) + rect.height;
    const center = rect => [centerX(rect), centerY(rect)];
    const toD = points => 'M ' + points.map(([px, py]) => `${px} ${py}`).join(' L ');
    const trim = ([ax, ay], [bx, by], d) => {
        const len = Math.hypot(bx - ax, by - ay) || 1;
        return [ax + (bx - ax) * d / len, ay + (by - ay) * d / len];
    };
    // points: right-angle polyline from source port centre to target port centre.
    const setWire = (id, points, trimStart, trimEnd) => {
        const visible = [...points];
        visible[0] = trim(points[0], points[1], trimStart);
        visible[visible.length - 1] = trim(points[points.length - 1], points[points.length - 2], trimEnd);
        const path = document.getElementById(id);
        path.setAttribute('d', toD(visible));
        path.dataset.route = toD(points);
    };
    const halfH = rect => rect.height / 2;
    // From a slot's centre to the bottom of its little label, so wires below it stay clear of the label.
    const toSlotBottom = el => {
        const value = stageRect(el);
        return stageRect(el.closest('.slot')).bottom - (value.top + value.height / 2);
    };

    svg.setAttribute('viewBox', `0 0 ${container.width} ${container.height}`);
    if (mobileQuery.matches) {
        // Phones: blocks are stacked clock, modulator, index, carrier, DAC. Every input lands on the
        // carrier's top (phase) line from above, so t takes a rail down the left edge and branches
        // in below the index box; I drops straight in; m drops from the modulator's output.
        const rail = 7;
        const tBusY = (bottom(clock) + y(mod)) / 2;
        const tInY = y(carrier) - 10;
        const iInY = y(carrier) - 20;
        const mJogY = y(carrier) - 30;
        const yOutY = (bottom(carrier) + y(dac)) / 2;
        setWire('clock-to-mod', [center(clockPort), [centerX(clockPort), tBusY], [centerX(modTimeSlot), tBusY], center(modTimeSlot)], halfH(clockPort), halfH(modTimeSlot));
        setWire('clock-to-carrier', [center(clockPort), [centerX(clockPort), tBusY], [rail, tBusY], [rail, tInY], [centerX(carrierTimeSlot), tInY], center(carrierTimeSlot)], halfH(clockPort), halfH(carrierTimeSlot));
        setWire('index-to-carrier', [center(indexOutput), [centerX(indexOutput), iInY], [centerX(carrierIndexSlot), iInY], center(carrierIndexSlot)], halfH(indexOutput), halfH(carrierIndexSlot));
        setWire('mod-to-carrier', [center(modOutput), [centerX(modOutput), mJogY], [centerX(carrierModSlot), mJogY], center(carrierModSlot)], toSlotBottom(document.getElementById('mod-output-token')), halfH(carrierModSlot));
        setWire('carrier-to-dac', [center(carrierOutput), [centerX(carrierOutput), yOutY], [centerX(dacInput), yOutY], center(dacInput)], toSlotBottom(document.getElementById('carrier-output-token')), halfH(dacInput));
        return;
    }

    // Inputs only ever drop onto or rise into their slot; nothing slides across an equation.
    const clockBranchY = (bottom(clock) + y(mod)) / 2;
    const indexRouteY = (bottom(stageRect(document.querySelector('.modulation-index'))) + y(carrier)) / 2;
    const gapX = (right(mod) + x(carrier)) / 2;
    const modLaneY = bottom(carrier) + 16; // m passes under the carrier, then rises into its slot
    const outputRouteY = (modLaneY + y(dac)) / 2;

    setWire('clock-to-mod', [center(clockPort), [centerX(clockPort), clockBranchY], [centerX(modTimeSlot), clockBranchY], center(modTimeSlot)], halfH(clockPort), halfH(modTimeSlot));
    setWire('clock-to-carrier', [center(clockPort), [centerX(clockPort), clockBranchY], [centerX(carrierTimeSlot), clockBranchY], center(carrierTimeSlot)], halfH(clockPort), halfH(carrierTimeSlot));
    setWire('index-to-carrier', [center(indexOutput), [centerX(indexOutput), indexRouteY], [centerX(carrierIndexSlot), indexRouteY], center(carrierIndexSlot)], halfH(indexOutput), halfH(carrierIndexSlot));
    setWire('mod-to-carrier', [center(modOutput), [gapX, centerY(modOutput)], [gapX, modLaneY], [centerX(carrierModSlot), modLaneY], center(carrierModSlot)], modOutput.width / 2, toSlotBottom(document.getElementById('carrier-mod-slot')));
    setWire('carrier-to-dac', [center(carrierOutput), [centerX(carrierOutput), outputRouteY], [centerX(dacInput), outputRouteY], center(dacInput)], toSlotBottom(document.getElementById('carrier-output-token')), halfH(dacInput));


}

function drawParameterArrows() {
    const svg = document.querySelector('.parameter-arrows');
    if (!svg) return;

    const container = stageBox();
    const getRelRect = (el) => {
        const rect = stageRect(el);
        return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    };
    const setPath = (id, d) => document.getElementById(id).setAttribute('d', d);

    // Define arrow mappings: [arrowId, labelId, termId]
    const arrows = [
        ['mod-amplitude-arrow', 'mod-amplitude-label', 'mod-amplitude-term'],
        ['mod-frequency-arrow', 'mod-frequency-label', 'mod-frequency-term'],
        ['carrier-amplitude-arrow', 'carrier-amplitude-label', 'carrier-amplitude-term'],
        ['carrier-frequency-arrow', 'carrier-frequency-label', 'carrier-frequency-term']
    ];

    // Right-angle lines that never cross the equation: each starts at the far end of the
    // label's underline (the underline is the first segment), runs toward the term, then
    // turns up and ends under it.
    const GAP = 8;
    arrows.forEach(([arrowId, labelId, termId]) => {
        const labelEl = document.getElementById(labelId);
        const termEl = document.getElementById(termId);
        if (!labelEl || !termEl) return;

        const label = getRelRect(labelEl);
        const term = getRelRect(termEl.closest('.slot'));
        const formula = getRelRect(termEl.closest('.formula'));
        const termX = term.left + term.width / 2;
        const termBottom = term.top + term.height;
        const formulaBottom = formula.top + formula.height;
        const lineY = label.top + label.height - 1;
        const labelRight = label.left + label.width;
        const toRight = termX > label.left + label.width / 2;
        const clearsLabel = toRight ? termX >= labelRight + GAP : termX <= label.left - GAP;
        const sameBox = labelEl.closest('.operator-box') === termEl.closest('.operator-box');

        let d = `M ${toRight ? label.left : labelRight} ${lineY}`;
        if (lineY < formula.top) {
            // Phones put phase knobs above the equation: run along the underline, then drop in.
            const valueTop = getRelRect(termEl.closest('.slot-value')).top;
            d += ` H ${termX} V ${valueTop}`;
        } else if (sameBox && clearsLabel && lineY > formulaBottom) {
            d += ` H ${termX} V ${termBottom}`;
        } else {
            // The term sits right above the label, or the label lives in another box:
            // step aside, drop/climb to a lane just under the equation box, then go across.
            const termBox = getRelRect(termEl.closest('.operator-box'));
            const sideX = sameBox
                ? (toRight ? labelRight + GAP : label.left - GAP)
                : (toRight ? termBox.left + GAP : termBox.left + termBox.width - GAP);
            d += ` H ${sideX} V ${formulaBottom + GAP} H ${termX} V ${termBottom}`;
        }
        setPath(arrowId, d);
    });
}

// Audio Controls
async function startAudio() {
    if (isAudioRunning) return;

    elements.audioStartBtn.disabled = true;
    try {
        await initAudioContext();
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }
        isAudioRunning = true;
        setMasterGain(masterVolume);
        elements.audioStopBtn.disabled = false;
    } catch (error) {
        elements.audioStartBtn.disabled = false;
    }
}

async function stopAudio() {
    if (!isAudioRunning) return;

    isAudioRunning = false;
    setMasterGain(0);
    elements.audioStartBtn.disabled = false;
    elements.audioStopBtn.disabled = true;

    await new Promise(resolve => setTimeout(resolve, 15));
    if (!isAudioRunning && audioContext?.state === 'running') {
        await audioContext.suspend();
    }
}

function setMasterGain(value) {
    if (!masterGainNode) return;
    const now = audioContext.currentTime;
    masterGainNode.gain.cancelScheduledValues(now);
    masterGainNode.gain.setValueAtTime(masterGainNode.gain.value, now);
    masterGainNode.gain.linearRampToValueAtTime(value, now + 0.01);
}

// Scope: one 10 ms window, two traces on the same time axis. Top: every sample the synth produces
// in that window at full speed (what the audio contains). Bottom: the samples the slow animation
// has finished so far, newest as dots, with the rest of the window dimmed. Once the animation
// passes 10 ms the window scrolls, keeping the last finished sample at the right edge.
const SCOPE_WINDOW = 0.01;
const SCOPE_DOTS = 24;

function drawWaveform(highlightIndex = currentSampleIndex) {
    const W = 1000, H = 100, pad = 8, labelRoom = 60;
    const count = Math.round(SCOPE_WINDOW * sampleRate);
    const first = Math.max(0, highlightIndex - count + 1);
    const sx = k => pad + (k - first) / (count - 1) * (W - pad - labelRoom);
    const sy = v => H / 2 - v * (H / 2 - 10);
    const yAt = k => FM.calculateSample(k, sampleRate, params).carrier.output;

    let svg = '';
    svg += `<line class="zero" x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}"/>`;
    const line = (from, to) => {
        const points = [];
        for (let k = from; k <= to; k++) points.push(`${sx(k).toFixed(1)},${sy(yAt(k)).toFixed(1)}`);
        return points.join(' ');
    };
    if (highlightIndex < first + count - 1) svg += `<polyline class="ahead" points="${line(highlightIndex, first + count - 1)}"/>`;
    svg += `<polyline class="wave" points="${line(first, highlightIndex)}"/>`;
    elements.scopeFullLine.setAttribute('points', line(first, first + count - 1));
    for (let k = Math.max(0, highlightIndex - SCOPE_DOTS); k < highlightIndex; k++) {
        svg += `<circle class="dot" cx="${sx(k).toFixed(1)}" cy="${sy(yAt(k)).toFixed(1)}" r="1.8"/>`;
    }
    const nowY = sy(yAt(highlightIndex));
    svg += `<circle class="now" cx="${sx(highlightIndex)}" cy="${nowY}" r="5"/>`;
    svg += `<text x="${sx(highlightIndex) + 9}" y="${nowY + 5}">n=${highlightIndex}</text>`;
    elements.scope.innerHTML = svg;
}

// Start the application
init();
