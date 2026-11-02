import { useEffect, useState } from 'react';
import { toBase64 } from '../../crypto/primitives/encoding.js';
import { clearLocalWalkthrough, isLocalWalkthroughActive, startLocalWalkthrough, subscribeLocalWalkthrough } from '../../crypto/localWalkthrough.js';
import { readOwnLocalIdentity } from '../../services/e2eeService.js';
import './ProfileKeyInspector.css';

const bytesOf = (value) => value ? Math.floor(value.length * 3 / 4) - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0) : 0;

function FullValue({ label, value, secret = false }) {
  const [copied, setCopied] = useState(false);
  return <div className={`qx-key-value ${secret ? 'qx-key-value--secret' : ''}`}>
    <div className="qx-key-value-head">
      <strong>{label}</strong><span>{bytesOf(value).toLocaleString()} bytes</span>
      <button type="button" disabled={!value} onClick={async () => {
        try { await navigator.clipboard.writeText(value); setCopied(true); }
        catch { setCopied(false); }
      }}>{copied ? 'Copied' : 'Copy'}</button>
    </div>
    <pre>{value || '—'}</pre>
  </div>;
}

export default function ProfileKeyInspector({ userId }) {
  const [identity, setIdentity] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [walkthrough, setWalkthrough] = useState(null);

  useEffect(() => subscribeLocalWalkthrough(setWalkthrough), []);
  useEffect(() => { setIdentity(null); setError(''); }, [userId]);

  const reveal = async () => {
    if (identity) { setIdentity(null); return; }
    setLoading(true);
    setError('');
    try {
      const stored = await readOwnLocalIdentity(userId);
      if (!stored) throw new Error('No keys in this browser yet. Sign in here and wait for identity setup to finish.');
      setIdentity({
        deviceId: stored.deviceId,
        kemPublic: toBase64(stored.encryption.publicKey),
        kemSecret: toBase64(stored.encryption.secretKey),
        dsaPublic: toBase64(stored.signing.publicKey),
        dsaSecret: toBase64(stored.signing.secretKey),
      });
    } catch (cause) { setError(cause.message || 'Could not read this browser’s keys.'); }
    finally { setLoading(false); }
  };

  const active = isLocalWalkthroughActive(userId);
  const trace = walkthrough?.userId === userId ? walkthrough.trace : null;

  return <section className="qx-key-inspector" aria-labelledby="profile-keys-title">
    <div className="qx-key-inspector-title"><div><small>BROWSER KEY STORE</small><h3 id="profile-keys-title">Your encryption keys</h3></div><span>IndexedDB · this device</span></div>
    <p>These are the complete keys for this account in this browser. Another device has its own key store. The server holds the public bundle only.</p>
    <button className="qx-key-main-button" type="button" onClick={reveal} disabled={loading}>{loading ? 'Reading browser keys…' : identity ? 'Hide identity keys' : 'Reveal full identity keys'}</button>
    {error && <p className="qx-key-error" role="alert">{error}</p>}
    {identity && <div className="qx-key-identity">
      <p>Device ID: <code>{identity.deviceId}</code></p>
      <FullValue label="Kyber / ML-KEM-768 public key" value={identity.kemPublic} />
      <FullValue label="Kyber / ML-KEM-768 secret key" value={identity.kemSecret} secret />
      <FullValue label="Dilithium / ML-DSA-65 public key" value={identity.dsaPublic} />
      <FullValue label="Dilithium / ML-DSA-65 secret key" value={identity.dsaSecret} secret />
      <p className="qx-key-caution">Anyone who copies a secret key can impersonate this device or read messages addressed to it. Hide this panel during normal use.</p>
    </div>}

    <div className="qx-key-walkthrough-head"><div><small>OPTIONAL LOCAL DEMO</small><h3>Message key walkthrough</h3></div>
      <button type="button" className="qx-key-main-button" onClick={() => active ? clearLocalWalkthrough() : startLocalWalkthrough(userId)}>{active ? 'Stop and clear' : 'Capture next message'}</button>
    </div>
    <p>Start capture, close Profile, then send or open a direct message. Reopen Profile to inspect the actual temporary values. Capture lasts ten minutes and stays only in this tab’s memory.</p>
    {active && <div className="qx-key-recording"><span /> Recording the next direct-message operation</div>}
    {trace && <div className="qx-key-trace">
      <div className="qx-key-trace-heading"><strong>{trace.direction === 'send' ? 'Sent message' : 'Received message'} · {trace.messageId}</strong><span>{new Date(trace.capturedAt).toLocaleTimeString()}</span></div>
      <div className={`qx-key-route qx-key-route--${trace.direction}`} aria-label="Encrypted message route">
        <div><strong>{trace.direction === 'send' ? 'Your browser' : 'Sender browser'}</strong><small>Kyber + AES + Dilithium</small></div>
        <div><strong>Relay</strong><small>Ciphertext only</small></div>
        <div><strong>{trace.direction === 'send' ? 'Recipient browser' : 'Your browser'}</strong><small>Verify + decrypt</small></div>
        <span className="qx-key-packet" aria-hidden="true">✉</span>
      </div>
      <ol className="qx-key-explain">
        <li>Kyber produces a shared secret for each participant. HKDF turns it into an AES wrapping key.</li>
        <li>A fresh 256-bit AES content key encrypts the message. Each participant receives an encrypted wrap of that key.</li>
        <li>Dilithium signs the envelope. The relay stores ciphertext and public metadata; the recipient verifies and decrypts locally.</li>
      </ol>
      <FullValue label="AES-256 content key · temporary secret" value={trace.contentKey_b64} secret />
      {trace.wraps.map((wrap, index) => <div className="qx-key-wrap" key={`${wrap.userId}-${index}`}>
        <h4>Key wrap for {wrap.userId}</h4>
        <FullValue label="Kyber shared secret · temporary" value={wrap.sharedSecret_b64} secret />
        <FullValue label="HKDF-derived AES wrapping key · temporary" value={wrap.wrappingKey_b64} secret />
        <FullValue label="Kyber encapsulation ciphertext · sent through relay" value={wrap.kemCiphertext_b64} />
        <FullValue label="Wrapped AES content key · sent through relay" value={wrap.wrappedKey_b64} />
        <FullValue label="Wrap nonce" value={wrap.wrapNonce_b64} />
      </div>)}
      <FullValue label="Message AES-GCM nonce" value={trace.messageNonce_b64} />
      <FullValue label="Encrypted message ciphertext" value={trace.ciphertext_b64} />
      <FullValue label="Dilithium / ML-DSA-65 message signature" value={trace.signature_b64} />
      <p>The raw AES key and Kyber shared secret shown here are temporary. They are zeroed from the protocol’s byte arrays after use; this opt-in demo copy is cleared when you stop, sign out, reload, or its timer expires.</p>
    </div>}
  </section>;
}
