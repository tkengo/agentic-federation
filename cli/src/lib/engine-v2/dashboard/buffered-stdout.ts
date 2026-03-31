/**
 * Placeholder — no patching needed when using <Static> layout
 * (dynamic section is small enough that eraseLines doesn't cause flicker).
 *
 * Returns a no-op restore function for API compatibility.
 */
export function patchStdoutBuffering(): () => void {
  return () => {};
}
