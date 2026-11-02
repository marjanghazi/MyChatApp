import { useState } from 'react';
import { runProtocolDemo } from '../../crypto/demo/runProtocolDemo.js';
import './CryptoLab.css';

const steps = [
  { id: 'identities', number: '01', title: 'Create identities', detail: 'Alice and Bob generate browser-held key pairs. Only signed public bundles enter the demo relay.' },
  { id: 'encrypt', number: '02', title: 'Establish and encrypt', detail: 'A fresh shared secret derives an AES wrapping key. A random content key encrypts the message.' },
  { id: 'decrypt', number: '03', title: 'Verify and decrypt', detail: 'Bob verifies Alice’s signature, decapsulates his secret, unwraps the key, and decrypts.' },
  { id: 'tamper', number: '04', title: 'Change one byte', detail: 'A modified ciphertext must fail verification. The changed message is never displayed.' },
];

const formatMs = (value) => `${value.toFixed(1)} ms`;

export default function CryptoLab() {
  const [message, setMessage] = useState('Hello from Alice to Bob 🔐');
  const [active, setActive] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function run() {
    if (busy) return;
    setBusy(true);
    setResult(null);
    setError('');
    try {
      const output = await runProtocolDemo({ plaintext: message, onStage: setActive });
      setResult(output);
    } catch (cause) {
      setError(cause?.message || 'The demonstration could not complete.');
    } finally {
      setBusy(false);
      setActive(null);
    }
  }

  return (
    <section id="crypto-lab" className="cl-section" aria-labelledby="cl-title">
      <div className="cl-heading">
        <span className="ph-section-label">LIVE CRYPTOGRAPHY</span>
        <h2 id="cl-title">See a message become ciphertext</h2>
        <p>Run the same browser protocol used by direct chat. Alice and Bob are temporary identities in this page; no account or server is needed.</p>
      </div>

      <div className="cl-workspace">
        <div className="cl-controls">
          <div className="cl-field-label">PQC suite · ML-KEM-768 + ML-DSA-65 + AES-256-GCM</div>
          <label className="cl-field-label" htmlFor="cl-message">Alice’s message</label>
          <textarea id="cl-message" rows="3" maxLength="400" value={message} disabled={busy} onChange={(event) => { setMessage(event.target.value); setResult(null); }} />
          <button type="button" className="cl-run" disabled={busy} onClick={run}>{busy ? 'Running real cryptography…' : 'Run live demonstration →'}</button>
          <p className="cl-local-note">The message and keys stay in memory. Reloading clears this demonstration.</p>
          {error && <p className="cl-error" role="alert">{error}</p>}
        </div>

        <div className="cl-flow" aria-label="Encryption flow">
          <div className="cl-flow-party"><strong>Alice’s browser</strong><span>Message + private signing key</span></div>
          <div className="cl-flow-arrow" aria-hidden="true">→</div>
          <div className="cl-flow-party cl-flow-relay"><strong>Relay</strong><span>Ciphertext + public metadata</span></div>
          <div className="cl-flow-arrow" aria-hidden="true">→</div>
          <div className="cl-flow-party"><strong>Bob’s browser</strong><span>Verified, decrypted message</span></div>
        </div>
      </div>

      <div className="cl-steps">
        {steps.map((step) => {
          const state = result ? 'complete' : active === step.id ? 'active' : 'waiting';
          return <article key={step.id} className={`cl-step cl-step--${state}`}>
            <span className="cl-step-number">{step.number}</span>
            <div><h3>{step.title}</h3><p>{step.detail}</p></div>
            <span className="cl-step-state">{state === 'complete' ? '✓ Done' : state === 'active' ? 'Running' : 'Waiting'}</span>
          </article>;
        })}
      </div>

      {result && (
        <div className="cl-results" aria-live="polite">
          <div className="cl-result-top"><span>LIVE RESULT · {result.suiteLabel.toUpperCase()}</span><strong>Verified round trip ✓</strong></div>
          <div className="cl-algorithms">
            <div><small>KEY ESTABLISHMENT</small><strong>{result.kex}</strong><span>{result.metrics.kemPublicKeyBytes.toLocaleString()} B public key · {result.metrics.kemCiphertextBytes.toLocaleString()} B encapsulation</span></div>
            <div><small>AUTHENTICATION</small><strong>{result.signature}</strong><span>{result.metrics.signingPublicKeyBytes.toLocaleString()} B public key · {result.metrics.signatureBytes.toLocaleString()} B signature</span></div>
            <div><small>CONFIDENTIALITY</small><strong>AES-256-GCM</strong><span>12 B nonce · 128-bit tag · {result.metrics.ciphertextBytes.toLocaleString()} B encrypted payload</span></div>
          </div>
          <div className="cl-metrics">
            <div><span>Identity setup*</span><strong>{formatMs(result.metrics.identityMs)}</strong></div>
            <div><span>Encrypt + sign</span><strong>{formatMs(result.metrics.encryptMs)}</strong></div>
            <div><span>Verify + decrypt</span><strong>{formatMs(result.metrics.decryptMs)}</strong></div>
            <div><span>JSON envelope</span><strong>{result.metrics.envelopeBytes.toLocaleString()} B</strong></div>
          </div>
          <p className="cl-measure-note">*Identity setup creates the PQC identity, as sign-in does in the chat app. Timings are local measurements on this device.</p>
          <div className="cl-evidence">
            <div><span>Alice’s plaintext</span><code>{result.plaintext || '(empty message)'}</code></div>
            <div><span>Relay sees ciphertext</span><code>{result.publicEvidence.ciphertextPrefix}</code></div>
            <div><span>Signature sample</span><code>{result.publicEvidence.signaturePrefix}</code></div>
            <div><span>Altered ciphertext</span><strong className="cl-rejected">Rejected by verification ✓</strong></div>
          </div>
          <p className="cl-result-foot">Each message has a fresh content key, nonce, signature, and {result.publicEvidence.wraps} key wraps so both participants can read their history. No private key or shared secret is shown here.</p>
        </div>
      )}
    </section>
  );
}
