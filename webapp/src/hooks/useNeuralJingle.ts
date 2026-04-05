import { useCallback, useRef } from 'react';

export const useNeuralJingle = () => {
    const audioCtxRef = useRef<AudioContext | null>(null);

    const playJingle = useCallback(() => {
        // Initialize AudioContext on first user interaction
        if (!audioCtxRef.current) {
            audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }

        const ctx = audioCtxRef.current;
        if (ctx.state === 'suspended') {
            ctx.resume();
        }

        const now = ctx.currentTime;

        // Master gain for premium volume control
        const masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(0, now);
        masterGain.gain.linearRampToValueAtTime(0.4, now + 0.05);
        masterGain.gain.exponentialRampToValueAtTime(0.001, now + 2.5);
        masterGain.connect(ctx.destination);

        // 1. Synaptic Handshake - Frequency Sweep (Sine)
        const sweep = ctx.createOscillator();
        const sweepGain = ctx.createGain();
        sweep.type = 'sine';
        sweep.frequency.setValueAtTime(440, now);
        sweep.frequency.exponentialRampToValueAtTime(880, now + 0.3);
        sweep.frequency.exponentialRampToValueAtTime(220, now + 0.8);

        sweepGain.gain.setValueAtTime(0, now);
        sweepGain.gain.linearRampToValueAtTime(0.2, now + 0.1);
        sweepGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

        sweep.connect(sweepGain);
        sweepGain.connect(masterGain);

        // 2. FTL Pulse - Low Thump (Triangle)
        const pulse = ctx.createOscillator();
        const pulseGain = ctx.createGain();
        pulse.type = 'triangle';
        pulse.frequency.setValueAtTime(60, now);
        pulse.frequency.linearRampToValueAtTime(40, now + 0.2);

        pulseGain.gain.setValueAtTime(0, now);
        pulseGain.gain.linearRampToValueAtTime(0.3, now + 0.02);
        pulseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

        pulse.connect(pulseGain);
        pulseGain.connect(masterGain);

        // 3. Neural Sparkle - Shimmer (Square + High Pass)
        const sparkle = ctx.createOscillator();
        const sparkleFilter = ctx.createBiquadFilter();
        const sparkleGain = ctx.createGain();

        sparkle.type = 'square';
        sparkle.frequency.setValueAtTime(2000, now);
        sparkle.frequency.linearRampToValueAtTime(4000, now + 0.1);

        sparkleFilter.type = 'highpass';
        sparkleFilter.frequency.value = 3000;

        sparkleGain.gain.setValueAtTime(0, now);
        sparkleGain.gain.linearRampToValueAtTime(0.05, now + 0.05);
        sparkleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

        sparkle.connect(sparkleFilter);
        sparkleFilter.connect(sparkleGain);
        sparkleGain.connect(masterGain);

        // Start all nodes
        sweep.start(now);
        pulse.start(now);
        sparkle.start(now);

        // Stop all nodes
        sweep.stop(now + 1.5);
        pulse.stop(now + 0.6);
        sparkle.stop(now + 0.4);

    }, []);

    return { playJingle };
};
