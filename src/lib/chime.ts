// A synthesised startup chord in the spirit of the classic Mac chime (not a sample).

export function playChime(volume = 0.18) {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = volume;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2400;
  lp.connect(master).connect(ctx.destination);
  const now = ctx.currentTime + 0.02;
  // F major, spread like the Quadra/Power Mac chord.
  for (const [f, g] of [[87.31, 0.5], [174.61, 0.9], [220, 0.7], [261.63, 0.7], [349.23, 0.55], [523.25, 0.25]] as const) {
    for (const detune of [-4, 4]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.detune.value = detune;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, now);
      env.gain.linearRampToValueAtTime(g * 0.5, now + 0.012);
      env.gain.exponentialRampToValueAtTime(g * 0.22, now + 0.5);
      env.gain.exponentialRampToValueAtTime(0.0001, now + 3.2);
      o.connect(env).connect(lp);
      o.start(now);
      o.stop(now + 3.3);
    }
  }
  setTimeout(() => ctx.close(), 3600);
}
