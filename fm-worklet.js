/**
 * FM Synthesis AudioWorklet Processor
 * 
 * Real-time FM synthesis using phase accumulators.
 * Calculates samples one by one inside the audio callback.
 * No pre-generated or stored intermediate waveforms.
 */

const TWO_PI = 2 * Math.PI;

class FMProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        
        // Parameters with default values
        this.currentParams = {
            Am: 0.78,     // Modulator amplitude
            fm: 269,      // Modulator frequency
            Ac: 0.76,     // Carrier amplitude
            fc: 619,      // Carrier frequency
            I: 2.82       // Modulation index
        };
        
        // Phase accumulators (maintain continuous phase)
        this.modPhase = 0;
        this.carPhase = 0;
        this.modPhaseInc = 0;
        this.carPhaseInc = 0;
        
        // Current sample rate
        this.sampleRate = sampleRate;
        
        // Smoothing for parameter changes
        this.smoothingFrames = 128;
        this.paramFramesRemaining = 0;
        this.paramKeys = Object.keys(this.currentParams);
        this.targetParams = { ...this.currentParams };
        this.paramSteps = Object.fromEntries(this.paramKeys.map(key => [key, 0]));
        
        // Initialize phase increments
        this.updatePhaseIncrements();
        
        // Listen for parameter changes from main thread
        this.port.onmessage = (event) => {
            if (event.data.type === 'params') {
                for (const key of this.paramKeys) {
                    const target = event.data.params[key];
                    if (!Number.isFinite(target)) continue;
                    this.targetParams[key] = target;
                    this.paramSteps[key] = (target - this.currentParams[key]) / this.smoothingFrames;
                }
                this.paramFramesRemaining = this.smoothingFrames;
            } else if (event.data.type === 'sampleRate') {
                this.sampleRate = event.data.sampleRate;
                this.updatePhaseIncrements();
            }
        };
    }
    
    updatePhaseIncrements() {
        this.modPhaseInc = (this.currentParams.fm * TWO_PI) / this.sampleRate;
        this.carPhaseInc = (this.currentParams.fc * TWO_PI) / this.sampleRate;
    }
    
    // Smooth parameter interpolation
    interpolateParams() {
        if (this.paramFramesRemaining > 0) {
            this.currentParams.Am += this.paramSteps.Am;
            this.currentParams.fm += this.paramSteps.fm;
            this.currentParams.Ac += this.paramSteps.Ac;
            this.currentParams.fc += this.paramSteps.fc;
            this.currentParams.I += this.paramSteps.I;
            this.paramFramesRemaining--;
            if (this.paramFramesRemaining === 0) {
                this.currentParams.Am = this.targetParams.Am;
                this.currentParams.fm = this.targetParams.fm;
                this.currentParams.Ac = this.targetParams.Ac;
                this.currentParams.fc = this.targetParams.fc;
                this.currentParams.I = this.targetParams.I;
            }

            this.updatePhaseIncrements();
        }
    }
    
    process(inputs, outputs, parameters) {
        const output = outputs[0];
        const frameCount = output[0]?.length ?? 0;

        // Calculate each frame once, then copy it to every output channel.
        for (let i = 0; i < frameCount; i++) {
            this.interpolateParams();

            const modOutput = this.currentParams.Am * Math.sin(this.modPhase);
            const modOffset = this.currentParams.I * modOutput;
            const outputSample = this.currentParams.Ac * Math.sin(this.carPhase + modOffset);

            for (let channel = 0; channel < output.length; channel++) {
                output[channel][i] = outputSample;
            }

            this.modPhase += this.modPhaseInc;
            this.carPhase += this.carPhaseInc;

            // Wrap phases to prevent precision loss during extended playback.
            if (this.modPhase >= TWO_PI) {
                this.modPhase -= TWO_PI * Math.floor(this.modPhase / TWO_PI);
            }
            if (this.carPhase >= TWO_PI) {
                this.carPhase -= TWO_PI * Math.floor(this.carPhase / TWO_PI);
            }
        }
        
        return true; // Keep processor alive
    }
}

registerProcessor('fm-processor', FMProcessor);
