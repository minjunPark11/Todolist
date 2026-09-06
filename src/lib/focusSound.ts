let context: AudioContext | null = null;
export function prepareFocusSound() {
  try {
    context ??= new AudioContext();
    void context.resume().catch(() => undefined);
  } catch {
    /* Sound is optional. */
  }
}
export function playFocusSound(volume: number) {
  if (!context || context.state !== "running") return;
  const oscillator = context.createOscillator(),
    gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = 660;
  gain.gain.setValueAtTime(0, context.currentTime);
  gain.gain.linearRampToValueAtTime(
    Math.max(0, Math.min(1, volume)) * 0.25,
    context.currentTime + 0.03,
  );
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.4);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.45);
  oscillator.onended = () => {
    oscillator.disconnect();
    gain.disconnect();
  };
}
