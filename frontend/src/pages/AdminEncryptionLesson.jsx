import { useEffect, useState } from 'react';
import './AdminEncryptionLesson.css';

const steps = [
  {
    title: 'Alice writes a message',
    simple: 'The words begin as ordinary, readable text in Alice’s browser.',
    detail: 'Only the sender’s browser has the message at this point. Nothing has been sent to the server.',
    tag: 'Readable message',
  },
  {
    title: 'Alice gets Bob’s public key',
    simple: 'Think of Bob’s Kyber public key as a padlock anyone can use, while only Bob has its matching private key.',
    detail: 'Alice checks Bob’s signed public identity before using the key. Bob’s private key stays in his browser.',
    tag: 'Kyber / ML-KEM-768',
  },
  {
    title: 'A fresh message key is prepared',
    simple: 'Alice makes a new, random AES key for this message. Kyber helps package that key so Bob can recover it.',
    detail: 'Kyber creates a shared secret. HKDF turns it into a wrapping key. Alice wraps the AES key for Bob and separately for her own chat history.',
    tag: 'Kyber + HKDF',
  },
  {
    title: 'The words become ciphertext',
    simple: 'AES-256-GCM scrambles the message. Someone looking at the server record sees encrypted bytes, not the words.',
    detail: 'The browser uses the fresh AES key and a fresh nonce. AES-GCM also checks whether the encrypted content was changed.',
    tag: 'AES-256-GCM',
  },
  {
    title: 'Alice signs the sealed packet',
    simple: 'Dilithium adds a digital signature, like a tamper-checking seal that Bob can verify with Alice’s public key.',
    detail: 'Alice signs the encrypted envelope with her private signing key. The private signing key never goes to the server.',
    tag: 'Dilithium / ML-DSA-65',
  },
  {
    title: 'The server delivers the packet',
    simple: 'The server passes on the sealed message. It holds ciphertext, wrapped keys, and a signature, but cannot read the words.',
    detail: 'The packet can be stored and relayed without exposing the raw AES key or either user’s private key.',
    tag: 'Encrypted relay',
  },
  {
    title: 'Bob checks and opens it',
    simple: 'Bob checks Alice’s signature, uses his Kyber private key to recover the AES key, then AES restores the words.',
    detail: 'Verification and decryption happen in Bob’s browser. A modified packet or invalid signature is rejected.',
    tag: 'Verify → unwrap → decrypt',
  },
];

const lastStep = steps.length - 1;

function AdminEncryptionLesson() {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return undefined;
    if (step === lastStep) {
      setPlaying(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setStep((current) => current + 1), 4300);
    return () => window.clearTimeout(timer);
  }, [playing, step]);

  const goTo = (index) => {
    setPlaying(false);
    setStep(Math.min(lastStep, Math.max(0, index)));
  };

  return <>
    <section className="admin-lesson" aria-labelledby="admin-lesson-title">
      <div className="admin-eyebrow">START HERE · VISUAL EXPLANATION</div>
      <div className="admin-lesson-heading">
        <div>
          <h2 id="admin-lesson-title">How does a private message travel?</h2>
          <p>Follow a simple example from Alice to Bob. Use Play or move one step at a time.</p>
        </div>
        <span className="admin-lesson-count">{step + 1} / {steps.length}</span>
      </div>

      <div className="admin-lesson-track" data-step={step} aria-label="Alice sends an encrypted message through the server to Bob">
        <div className={`admin-lesson-person ${step <= 4 ? 'is-current' : ''}`}>
          <span className="admin-lesson-role">SENDER · ALICE</span>
          <strong>Alice’s browser</strong>
          <div className={`admin-lesson-sample ${step >= 3 ? 'is-locked' : ''}`}>
            {step >= 3 ? '🔒 Encrypted bytes' : '“Meet me at 5”'}
          </div>
          <small>{step >= 4 ? 'Signed with Alice’s private signing key' : step >= 2 ? 'Fresh AES key prepared here' : 'Readable only here so far'}</small>
        </div>
        <div className={`admin-lesson-person ${step === 5 ? 'is-current' : ''}`}>
          <span className="admin-lesson-role">RELAY</span>
          <strong>QUANTX server</strong>
          <div className={`admin-lesson-sample ${step >= 5 ? 'is-locked' : ''}`}>
            {step >= 5 ? '🔒 Encrypted packet' : 'Nothing received yet'}
          </div>
          <small>{step >= 5 ? 'No readable message or raw private keys' : 'Waiting for Alice to send'}</small>
        </div>
        <div className={`admin-lesson-person ${step === 1 || step === 6 ? 'is-current' : ''}`}>
          <span className="admin-lesson-role">RECIPIENT · BOB</span>
          <strong>Bob’s browser</strong>
          <div className="admin-lesson-sample">
            {step === 6 ? '“Meet me at 5”' : step === 1 ? '🔑 Public key is shared' : 'Waiting for message'}
          </div>
          <small>{step === 6 ? 'Private key unlocks the AES key' : 'Private key stays here'}</small>
        </div>
        <span className="admin-lesson-packet" aria-hidden="true">{step === 1 ? '🔑' : step >= 3 ? '🔒' : '✉'}</span>
      </div>

      <div className="admin-lesson-stage" key={step} aria-live="polite">
        <div className="admin-lesson-stage-top"><span>STEP {String(step + 1).padStart(2, '0')}</span><span>{steps[step].tag}</span></div>
        <h3>{steps[step].title}</h3>
        <p className="admin-lesson-simple">{steps[step].simple}</p>
        <p className="admin-lesson-detail">What the app does: {steps[step].detail}</p>
      </div>

      <div className="admin-lesson-controls" aria-label="Animation controls">
        <button type="button" className="admin-quiet-button" onClick={() => goTo(step - 1)} disabled={step === 0}>← Previous</button>
        <button type="button" className="admin-primary-button" onClick={() => {
          if (playing) setPlaying(false);
          else { if (step === lastStep) setStep(0); setPlaying(true); }
        }}>{playing ? 'Pause' : step === lastStep ? 'Replay animation' : 'Play animation'}</button>
        <button type="button" className="admin-quiet-button" onClick={() => goTo(step + 1)} disabled={step === lastStep}>Next →</button>
      </div>
      <div className="admin-lesson-dots" aria-label="Choose a step">
        {steps.map((item, index) => <button key={item.title} type="button" className={index === step ? 'is-current' : ''}
          onClick={() => goTo(index)} aria-label={`Step ${index + 1}: ${item.title}`} aria-current={index === step ? 'step' : undefined} />)}
      </div>
      <p className="admin-lesson-caption">This is an illustration with example text. The live demo below follows actual browser operations and shows the real encrypted packet.</p>
    </section>

    <section className="admin-why-pqc" aria-labelledby="admin-why-title">
      <div className="admin-eyebrow">WHY QUANTX USES PQC</div>
      <h2 id="admin-why-title">Why change the locks before quantum computers arrive?</h2>
      <p>RSA and elliptic-curve methods protect many systems today. A sufficiently powerful future quantum computer could break their public-key math. Someone could save encrypted traffic now and try to unlock it later. Post-quantum cryptography prepares for that risk; no algorithm comes with an absolute security guarantee.</p>
      <div className="admin-why-timeline" aria-label="Harvest now, decrypt later risk">
        <div><strong>Today</strong><span>An attacker copies encrypted traffic.</span></div>
        <b aria-hidden="true">→</b>
        <div><strong>Years later</strong><span>A powerful quantum computer may threaten RSA or elliptic-curve protection.</span></div>
      </div>
      <h3>What changes in this app?</h3>
      <div className="admin-why-table-wrap">
        <table className="admin-why-table">
          <thead><tr><th scope="col">Job</th><th scope="col">Common classical approach</th><th scope="col">QUANTX direct messages</th></tr></thead>
          <tbody>
            <tr><th scope="row">Establish a secret</th><td>RSA key transport or ECDH key agreement</td><td>Kyber / ML-KEM-768 creates a shared secret used to wrap the message key.</td></tr>
            <tr><th scope="row">Prove who sent it</th><td>RSA or ECDSA signature</td><td>Dilithium / ML-DSA-65 signs the encrypted packet.</td></tr>
            <tr><th scope="row">Encrypt the actual words</th><td>A symmetric cipher, often AES</td><td>AES-256-GCM encrypts each message with a fresh key.</td></tr>
          </tbody>
        </table>
      </div>
      <p className="admin-why-footnote">Kyber and Dilithium are post-quantum public-key algorithms. AES is a symmetric cipher that still does the bulk message encryption. PQC here is for direct messages; account password sign-in has its own protection.</p>
      <div className="admin-why-sources">
        <span>Read the standards:</span>
        <a href="https://csrc.nist.gov/pubs/fips/203/final" target="_blank" rel="noreferrer">NIST ML-KEM ↗</a>
        <a href="https://csrc.nist.gov/pubs/fips/204/final" target="_blank" rel="noreferrer">NIST ML-DSA ↗</a>
        <a href="https://www.nist.gov/cybersecurity-and-privacy/what-post-quantum-cryptography" target="_blank" rel="noreferrer">NIST PQC explainer ↗</a>
      </div>
    </section>
  </>;
}

export default AdminEncryptionLesson;
