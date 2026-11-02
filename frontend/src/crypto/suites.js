// Classical provider retained in providers/classical.js as commented reference code.
// import { classical } from './providers/classical.js';
import { postQuantum } from './providers/postQuantum.js';

export const suites = Object.freeze({
  // classical,
  pqc: postQuantum,
});
export function getSuite(id) {
  if (!Object.hasOwn(suites, id)) throw new Error(`Unsupported cryptographic suite: ${id}`);
  return suites[id];
}
export function configuredSuite() {
  return postQuantum;
}
