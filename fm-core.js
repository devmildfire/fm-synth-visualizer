/**
 * FM Core - Shared Mathematical Model
 * 
 * This module contains the fundamental FM synthesis mathematics shared between
 * the educational visualization and the real-time AudioWorklet.
 * 
 * All calculations use:
 * - Radians for phase
 * - Hz for frequency
 * - Seconds for time
 * - Normalized amplitude values (-1 to 1)
 */

// Mathematical constants
export const TWO_PI = 2 * Math.PI;

/**
 * Calculate modulator output for a given sample
 * m(t) = Am × sin(2π × fm × t)
 */
export function calculateModulator(Am, fm, t) {
    const phase = TWO_PI * fm * t;
    const output = Am * Math.sin(phase);
    return { phase, output };
}

/**
 * Calculate carrier output for a given sample
 * y(t) = Ac × sin(2π × fc × t + I × m(t))
 */
export function calculateCarrier(Ac, fc, I, m_output, t) {
    const basePhase = TWO_PI * fc * t;
    const modulationOffset = I * m_output;
    const modifiedPhase = basePhase + modulationOffset;
    const output = Ac * Math.sin(modifiedPhase);
    return { basePhase, modulationOffset, modifiedPhase, output };
}

/**
 * Calculate both operators for a single sample (educational use)
 * Returns complete calculation trace for visualization
 */
export function calculateSample(n, Fs, params) {
    const t = n / Fs;
    
    // Modulator
    const mod = calculateModulator(params.Am, params.fm, t);
    
    // Carrier
    const car = calculateCarrier(params.Ac, params.fc, params.I, mod.output, t);
    
    return {
        n,
        t,
        modulator: {
            phase: mod.phase,
            output: mod.output
        },
        carrier: {
            basePhase: car.basePhase,
            modulationOffset: car.modulationOffset,
            modifiedPhase: car.modifiedPhase,
            output: car.output
        }
    };
}

/**
 * Format number for display with appropriate precision
 */
export function formatNumber(value, decimals = 6) {
    if (Math.abs(value) < 0.000001 && value !== 0) {
        return value.toExponential(3);
    }
    return value.toFixed(decimals);
}

/**
 * Format phase in radians
 */
export function formatPhase(rad) {
    return formatNumber(rad, 6) + ' rad';
}

/**
 * Format time in seconds
 */
export function formatTime(seconds) {
    if (seconds < 0.001) {
        return formatNumber(seconds * 1e6, 2) + ' μs';
    }
    if (seconds < 1) {
        return formatNumber(seconds * 1e3, 3) + ' ms';
    }
    return formatNumber(seconds, 6) + ' s';
}

/**
 * Format frequency in Hz
 */
export function formatFrequency(hz) {
    return hz.toFixed(0) + ' Hz';
}

/**
 * Default parameters for the synthesizer
 */
export const DEFAULT_PARAMS = {
    Am: 0.78,      // Modulator amplitude (0-1)
    fm: 269,       // Modulator frequency in Hz
    Ac: 0.76,      // Carrier amplitude (0-1)
    fc: 619,       // Carrier frequency in Hz
    I: 2.82        // Modulation index in radians
};

/**
 * Parameter ranges for UI controls
 */
export const PARAM_RANGES = {
    Am: { min: 0, max: 1, step: 0.01 },
    fm: { min: 1, max: 2000, step: 1 },
    Ac: { min: 0, max: 1, step: 0.01 },
    fc: { min: 20, max: 2000, step: 1 },
    I: { min: 0, max: 10, step: 0.01 }
};

/**
 * Validate and clamp parameters
 */
export function validateParams(params) {
    return {
        Am: Math.max(PARAM_RANGES.Am.min, Math.min(PARAM_RANGES.Am.max, params.Am)),
        fm: Math.max(PARAM_RANGES.fm.min, Math.min(PARAM_RANGES.fm.max, params.fm)),
        Ac: Math.max(PARAM_RANGES.Ac.min, Math.min(PARAM_RANGES.Ac.max, params.Ac)),
        fc: Math.max(PARAM_RANGES.fc.min, Math.min(PARAM_RANGES.fc.max, params.fc)),
        I: Math.max(PARAM_RANGES.I.min, Math.min(PARAM_RANGES.I.max, params.I))
    };
}

/**
 * Generate substituted formula strings for display
 */
export function getModulatorFormulaString(params) {
    return `m(t) = ${formatNumber(params.Am, 2)} × sin(2π × ${params.fm} × t)`;
}

export function getCarrierFormulaString(params) {
    return `y(t) = ${formatNumber(params.Ac, 2)} × sin(2π × ${params.fc} × t + ${formatNumber(params.I, 2)} × m(t))`;
}

/**
 * Generate evaluation strings for a specific sample calculation
 */
export function getModulatorEvaluationStrings(mod, params) {
    return [
        `t[n] = ${mod.n} / ${mod.Fs} = ${formatNumber(mod.t, 9)} s`,
        `φm = 2π × ${params.fm} × ${formatNumber(mod.t, 9)} = ${formatPhase(mod.phase)}`,
        `m[n] = ${formatNumber(params.Am, 2)} × sin(${formatPhase(mod.phase)}) = ${formatNumber(mod.output, 6)}`
    ];
}

export function getCarrierEvaluationStrings(car, mod, params) {
    return [
        `φc = 2π × ${params.fc} × ${formatNumber(car.t, 9)} = ${formatPhase(car.basePhase)}`,
        `m[n] = ${formatNumber(mod.output, 6)}`,
        `I × m[n] = ${formatNumber(params.I, 2)} × ${formatNumber(mod.output, 6)} = ${formatPhase(car.modulationOffset)}`,
        `φmodified = ${formatPhase(car.basePhase)} + ${formatPhase(car.modulationOffset)} = ${formatPhase(car.modifiedPhase)}`,
        `y[n] = ${formatNumber(params.Ac, 2)} × sin(${formatPhase(car.modifiedPhase)}) = ${formatNumber(car.output, 6)}`
    ];
}

/**
 * Generate waveform data points for preview
 * Returns array of {x: time, y: amplitude} for the final output
 */
export function generateWaveformPreview(params, Fs, duration = 0.02) {
    const sampleCount = Math.floor(duration * Fs);
    const points = new Array(sampleCount + 1);
    
    for (let n = 0; n <= sampleCount; n++) {
        const t = n / Fs;
        const mod = calculateModulator(params.Am, params.fm, t);
        const car = calculateCarrier(params.Ac, params.fc, params.I, mod.output, t);
        points[n] = { x: t, y: car.output };
    }
    
    return points;
}

/**
 * Audio-rate phase accumulator for real-time synthesis
 * Maintains continuous phase between samples
 */
export class PhaseAccumulator {
    constructor(frequency = 440, sampleRate = 48000) {
        this.frequency = frequency;
        this.sampleRate = sampleRate;
        this.phase = 0;
        this.updateIncrement();
    }
    
    updateIncrement() {
        this.phaseIncrement = (this.frequency * TWO_PI) / this.sampleRate;
    }
    
    setFrequency(frequency) {
        this.frequency = frequency;
        this.updateIncrement();
    }
    
    setSampleRate(sampleRate) {
        this.sampleRate = sampleRate;
        this.updateIncrement();
    }
    
    getPhase() {
        return this.phase;
    }
    
    process() {
        const currentPhase = this.phase;
        this.phase += this.phaseIncrement;
        // Wrap phase to prevent precision loss
        if (this.phase >= TWO_PI) {
            this.phase -= TWO_PI * Math.floor(this.phase / TWO_PI);
        }
        return currentPhase;
    }
    
    reset() {
        this.phase = 0;
    }
}

export default {
    TWO_PI,
    calculateModulator,
    calculateCarrier,
    calculateSample,
    formatNumber,
    formatPhase,
    formatTime,
    formatFrequency,
    DEFAULT_PARAMS,
    PARAM_RANGES,
    validateParams,
    getModulatorFormulaString,
    getCarrierFormulaString,
    getModulatorEvaluationStrings,
    getCarrierEvaluationStrings,
    generateWaveformPreview,
    PhaseAccumulator
};
