export const utf8 = (value) => new TextEncoder().encode(value);
export const decodeUtf8 = (value) => new TextDecoder('utf-8', { fatal: true }).decode(value);
export function toBase64(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}
export function fromBase64(value) {
  if (typeof value !== 'string') throw new Error('Expected base64 string');
  const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  if (toBase64(bytes) !== value) throw new Error('Non-canonical base64');
  return bytes;
}
// Stable ordering binds the same transcript on every client.
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
export const encodeObject = (value) => utf8(canonical(value));
export const randomBytes = (size) => crypto.getRandomValues(new Uint8Array(size));
export async function fingerprint(value) {
  return toBase64(await crypto.subtle.digest('SHA-256', encodeObject(value)));
}
