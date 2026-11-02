import './MessageCryptoDetails.css';

function byteLength(value) {
  if (typeof value !== 'string' || !value) return null;
  return Math.floor(value.length * 3 / 4) - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0);
}
const formatBytes = (value) => {
  const bytes = byteLength(value);
  return bytes === null ? '—' : `${bytes.toLocaleString()} bytes`;
};

export default function MessageCryptoDetails({ message, onClose }) {
  const rows = [
    ['Key establishment', message.kex_algorithm?.toUpperCase()],
    ['Signature', message.signature_algorithm?.toUpperCase()],
    ['Key derivation', message.kdf_algorithm?.toUpperCase()],
    ['Message cipher', message.cipher?.toUpperCase()],
    ['Ciphertext', formatBytes(message.ciphertext_b64)],
    ['Signature size', formatBytes(message.signature_b64)],
    ['Key wraps', message.key_wraps?.length ?? '—'],
  ];
  return (
    <aside className="qx-crypto-details" aria-label="Message encryption details">
      <div className="qx-crypto-details-head">
        <strong>Message encryption</strong>
        <button type="button" onClick={onClose} aria-label="Close encryption details">×</button>
      </div>
      <p className={message.cryptoVerified ? 'qx-crypto-verified' : 'qx-crypto-unverified'}>
        {message.cryptoVerified ? '✓ Signature verified and content decrypted in this browser' : '⚠ This browser could not verify or decrypt this message'}
      </p>
      <div className="qx-crypto-details-flow" aria-label="Encryption sequence">
        <span>Public key</span><b>→</b><span>Shared secret</span><b>→</b><span>AES key</span><b>→</b><span>Ciphertext</span>
      </div>
      <dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl>
      <p className="qx-crypto-details-note">Only public envelope metadata is shown. Private keys and shared secrets stay in the browser.</p>
    </aside>
  );
}
