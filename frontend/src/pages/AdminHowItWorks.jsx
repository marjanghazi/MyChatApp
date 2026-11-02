import { useCallback, useEffect, useMemo, useState } from 'react';
import { PQC_FLOWS } from '../crypto/pqcActivity.js';
import { fetchAdminLiveDemo, startAdminLiveDemo, stopAdminLiveDemo,
  fetchRegistrationDemo, startRegistrationDemo, stopRegistrationDemo } from '../services/adminService.js';
import AdminEncryptionLesson from './AdminEncryptionLesson.jsx';

const stages = [
  {
    number: '01', title: 'Sign in and prepare identity', algorithm: 'Kyber + Dilithium',
    detail: 'Password sign-in uses Argon2id and a session token. Then this browser loads its existing ML-KEM-768 (Kyber) and ML-DSA-65 (Dilithium) key pairs from IndexedDB, or generates them if absent. It signs and registers only the public identity bundle. Private keys stay in this browser.',
  },
  {
    number: '02', title: 'Agree on a secret and encrypt', algorithm: 'Kyber + HKDF + AES-256-GCM',
    detail: 'To send a direct message, the browser verifies the recipient’s signed public bundle. ML-KEM encapsulation produces a shared secret. HKDF derives a key that wraps a fresh random 256-bit AES content key. AES-GCM encrypts the message with a fresh nonce; the content key is also wrapped for the sender’s history.',
  },
  {
    number: '03', title: 'Sign and relay ciphertext', algorithm: 'Dilithium',
    detail: 'The sender signs the authenticated envelope with its ML-DSA-65 private signing key. The server stores ciphertext, nonce, signature, public bundle, and wrapped AES keys. It does not receive the plaintext, raw AES content key, or private keys.',
  },
  {
    number: '04', title: 'Verify and read', algorithm: 'Dilithium + Kyber + AES-256-GCM',
    detail: 'The recipient checks the sender’s signature and identity pin, decapsulates its ML-KEM secret, derives the wrapping key, unwraps the AES key, and decrypts in its browser. A changed signature, envelope, or ciphertext is rejected.',
  },
];

const statusText = { start: 'started', active: 'running', done: 'finished', complete: 'completed', error: 'failed' };
const NEW_ACCOUNT = '__new_account__';
const PAIR = '__pair__';
const timeText = (value) => value ? new Date(value).toLocaleTimeString() : '—';
const expired = (error) => /admin session expired|admin sign in required/i.test(error?.message || '');
const byteLength = (value) => value ? Math.floor(value.length * 3 / 4) - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0) : 0;
const formatMs = (value) => value == null ? '—' : value < 1 ? `${value.toFixed(2)} ms`
  : value < 1000 ? `${value.toFixed(1)} ms` : `${(value / 1000).toFixed(2)} s`;
const metricNames = {
  publicKeyBytes: 'public key', privateKeyBytes: 'private key', kemCiphertextBytes: 'KEM ciphertext',
  signatureBytes: 'signature', wrappedKeyBytes: 'wrapped AES keys', plaintextBytes: 'input',
  ciphertextBytes: 'ciphertext', nonceBytes: 'nonce', bundleBytes: 'signed bundle',
  envelopeBytes: 'JSON envelope', wrapCount: 'recipient wraps',
};
const metricText = (metrics) => Object.entries(metrics || {}).map(([key, value]) =>
  `${metricNames[key] || key}: ${Number(value).toLocaleString()}${key === 'wrapCount' ? '' : ' B'}`).join(' · ');

function flowTiming(flow) {
  const completed = [...flow.events].reverse().find((event) => event.status === 'complete');
  const cryptoMs = flow.events.filter((event) => event.status === 'done' &&
    ['kem', 'kdf', 'aes', 'dsa', 'identity_sign'].includes(event.step) && event.duration_ms != null)
    .reduce((sum, event) => sum + event.duration_ms, 0);
  const relayMs = flow.events.find((event) => event.step === 'relay' && event.status === 'done')?.duration_ms;
  return { totalMs: completed?.duration_ms, cryptoMs, relayMs };
}

function TimingSummary({ flows }) {
  const kinds = ['register', 'login', 'send', 'receive'];
  return <div className="admin-live-summary">
    {kinds.map((kind) => {
      const completed = flows.filter((flow) => flow.kind === kind && flowTiming(flow).totalMs != null);
      const samples = completed.map((flow) => flowTiming(flow).totalMs).sort((a, b) => a - b);
      const middle = Math.floor(samples.length / 2);
      const median = samples.length ? (samples[middle] + samples[Math.floor((samples.length - 1) / 2)]) / 2 : null;
      const cryptoSamples = completed.map((flow) => flowTiming(flow).cryptoMs).filter((value) => value > 0).sort((a, b) => a - b);
      const cryptoMiddle = Math.floor(cryptoSamples.length / 2);
      const cryptoMedian = cryptoSamples.length
        ? (cryptoSamples[cryptoMiddle] + cryptoSamples[Math.floor((cryptoSamples.length - 1) / 2)]) / 2 : null;
      return <article key={kind}>
        <small>{kind === 'register' ? 'REGISTER' : kind === 'login' ? 'LOGIN' : kind === 'send' ? 'SEND + RELAY' : 'RECEIVE + DECRYPT'}</small>
        <strong>{formatMs(median)}</strong>
        <span>{samples.length ? `Median total · ${samples.length} completed flow${samples.length === 1 ? '' : 's'}` : 'Awaiting a completed flow'}</span>
        {cryptoMedian != null && <span>Measured crypto stages: {formatMs(cryptoMedian)}</span>}
      </article>;
    })}
  </div>;
}

function PublicMaterial({ label, value }) {
  const [copied, setCopied] = useState(false);
  return <div className="admin-live-key">
    <div><strong>{label}</strong><span>{byteLength(value).toLocaleString()} bytes</span>
      <button type="button" className="admin-quiet-button" disabled={!value} onClick={async () => {
        try { await navigator.clipboard.writeText(value); setCopied(true); }
        catch { setCopied(false); }
      }}>{copied ? 'Copied' : 'Copy full value'}</button>
    </div>
    <pre>{value || '—'}</pre>
  </div>;
}

function MessageJourney({ flow, message }) {
  const kind = flow?.kind || 'idle';
  const last = flow?.events.at(-1);
  const description = ['register', 'login', 'identity'].includes(kind) ? 'The user browser is preparing its Kyber and Dilithium identity.'
    : kind === 'send' ? 'The sender encrypts and signs; the relay receives ciphertext and wrapped keys.'
    : kind === 'receive' ? 'The recipient verifies the signature, unwraps the AES key, and decrypts locally.'
    : 'Start capture and ask the selected user to sign in or send a direct message.';
  return <div className={`admin-journey admin-journey--${kind}`} key={flow?.id || 'idle'}>
    <div className="admin-journey-track">
      <div><span>01 · SENDER</span><strong>Browser keys</strong><small>Kyber → AES → Dilithium</small></div>
      <div><span>02 · RELAY</span><strong>{message ? 'Encrypted packet stored' : 'Ciphertext only'}</strong><small>No raw keys or plaintext</small></div>
      <div><span>03 · RECIPIENT</span><strong>Verify and decrypt</strong><small>Dilithium → Kyber → AES</small></div>
      <span className="admin-journey-packet" aria-hidden="true">✉</span>
    </div>
    <p>{description} {last && <b>Current flow: {statusText[last.status] || last.status}.</b>}</p>
  </div>;
}

function AdminHowItWorks({ token, users, initialUserId, onExpired, onOpenRecords, onRefreshUsers }) {
  const [uid, setUid] = useState(initialUserId || users[0]?.uid || NEW_ACCOUNT);
  const [senderUid, setSenderUid] = useState(users[0]?.uid || '');
  const [recipientUid, setRecipientUid] = useState(users[1]?.uid || '');
  const [snapshot, setSnapshot] = useState({ activeUntil: null, publicIdentity: null, latestMessage: null, events: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialUserId) setUid(initialUserId);
  }, [initialUserId]);

  useEffect(() => {
    if (!senderUid && users[0]) setSenderUid(users[0].uid);
    if (!recipientUid && users[1]) setRecipientUid(users[1].uid);
  }, [users, senderUid, recipientUid]);

  const readSnapshot = useCallback(async () => {
    if (uid === NEW_ACCOUNT) return fetchRegistrationDemo(token);
    if (uid !== PAIR) return fetchAdminLiveDemo(token, uid);
    const [sender, recipient] = await Promise.all([
      fetchAdminLiveDemo(token, senderUid), fetchAdminLiveDemo(token, recipientUid),
    ]);
    const events = [...(sender.events || []).map((event) => ({ ...event, user_id: senderUid })),
      ...(recipient.events || []).map((event) => ({ ...event, user_id: recipientUid }))]
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at) || a.id - b.id);
    const latestMessage = [sender.latestMessage, recipient.latestMessage].filter(Boolean)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;
    const activeUntil = sender.activeUntil && recipient.activeUntil
      ? new Date(sender.activeUntil) < new Date(recipient.activeUntil) ? sender.activeUntil : recipient.activeUntil : null;
    return { activeUntil, events, latestMessage, publicIdentity: sender.publicIdentity,
      pairedIdentities: [{ uid: senderUid, identity: sender.publicIdentity },
        { uid: recipientUid, identity: recipient.publicIdentity }] };
  }, [token, uid, senderUid, recipientUid]);

  useEffect(() => {
    if (!uid || (uid === PAIR && (!senderUid || !recipientUid || senderUid === recipientUid))) return undefined;
    let cancelled = false;
    let timer;
    const refresh = async () => {
      try {
        const data = await readSnapshot();
        if (!cancelled) { setSnapshot(data); setError(''); }
      } catch (cause) {
        if (!cancelled) {
          if (expired(cause)) onExpired();
          else setError(cause.message || 'Could not load live activity.');
        }
      } finally {
        if (!cancelled) timer = window.setTimeout(refresh, 1500);
      }
    };
    setSnapshot({ activeUntil: null, publicIdentity: null, latestMessage: null, events: [] });
    refresh();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [readSnapshot, uid, senderUid, recipientUid, onExpired]);

  const selected = uid === NEW_ACCOUNT ? snapshot.capturedUser : users.find((user) => user.uid === uid);
  const active = Boolean(snapshot.activeUntil && new Date(snapshot.activeUntil).getTime() > Date.now());
  const flows = useMemo(() => {
    const grouped = new Map();
    for (const event of snapshot.events || []) {
      const key = event.flow_id;
      if (!grouped.has(key)) grouped.set(key, { id: key, kind: event.kind, userId: event.user_id, events: [] });
      grouped.get(key).events.push(event);
    }
    return [...grouped.values()].reverse().slice(0, 12).map((flow) => ({
      ...flow,
      events: flow.events.sort((a, b) => a.sequence - b.sequence),
    }));
  }, [snapshot.events]);

  const changeCapture = async (shouldStart) => {
    if (!uid || (uid === PAIR && (!senderUid || !recipientUid || senderUid === recipientUid))) return;
    setBusy(true);
    setError('');
    try {
      if (uid === PAIR) {
        for (const id of [senderUid, recipientUid]) {
          if (shouldStart) await startAdminLiveDemo(token, id);
          else await stopAdminLiveDemo(token, id);
        }
      } else if (uid === NEW_ACCOUNT) {
        if (shouldStart) await startRegistrationDemo(token);
        else await stopRegistrationDemo(token);
      } else {
        if (shouldStart) await startAdminLiveDemo(token, uid);
        else await stopAdminLiveDemo(token, uid);
      }
      setSnapshot(await readSnapshot());
    } catch (cause) {
      if (expired(cause)) onExpired();
      else setError(cause.message || 'Could not change live demonstration.');
    } finally { setBusy(false); }
  };

  const bundle = snapshot.publicIdentity?.bundle;

  return <div className="admin-how">
    <div className="admin-heading">
      <div>
        <div className="admin-eyebrow">HOW ENCRYPTION WORKS</div>
        <h1>How QUANTX protects a message</h1>
        <p>Start with a simple animated example, then inspect the real browser protocol and a live user session.</p>
      </div>
      <button type="button" className="admin-quiet-button" onClick={onOpenRecords}>View stored crypto records</button>
    </div>

    <AdminEncryptionLesson />

    <div className="admin-heading admin-technical-heading">
      <div><div className="admin-eyebrow">UNDER THE HOOD</div><h2>What the browsers actually do</h2>
        <p>These are the operations used by direct messages, including the sign-in preparation step.</p></div>
    </div>
    <div className="admin-how-flow" aria-label="Direct message encryption flow">
      <span>Sender browser</span><b aria-hidden="true">→</b><span>Encrypted server record</span><b aria-hidden="true">→</b><span>Recipient browser</span>
    </div>
    <div className="admin-how-stages">
      {stages.map((stage) => <article key={stage.number}>
        <div><span>{stage.number}</span><strong>{stage.algorithm}</strong></div>
        <h2>{stage.title}</h2><p>{stage.detail}</p>
      </article>)}
    </div>
    <p className="admin-crypto-note">The password and session token protect account sign-in. Kyber and Dilithium protect direct messages after sign-in. Group and channel messages do not use this direct-message PQC flow.</p>

    <section className="admin-live" aria-labelledby="admin-live-title">
      <div className="admin-heading">
        <div><div className="admin-eyebrow">ACTUAL USER · LIVE DEMO</div><h2 id="admin-live-title">Watch browser cryptography</h2>
          <p>Capture the next registration, one user, or a pair of devices for the sender-to-recipient journey. The timeline updates as their browsers run each stage.</p></div>
      </div>
      <div className="admin-live-controls">
        <label htmlFor="admin-live-user">User to watch</label>
        <select id="admin-live-user" value={uid} onChange={(event) => setUid(event.target.value)}>
          <option value={NEW_ACCOUNT}>Next new registration</option>
          {users.length > 1 && <option value={PAIR}>Two-user direct message</option>}
          {users.map((user) => <option key={user.uid} value={user.uid}>{user.displayName || user.email} · {user.email}</option>)}
        </select>
        {uid === PAIR && <div className="admin-live-pair">
          <label>Sender <select value={senderUid} onChange={(event) => setSenderUid(event.target.value)}>
            {users.map((user) => <option key={user.uid} value={user.uid}>{user.email}</option>)}
          </select></label>
          <label>Recipient <select value={recipientUid} onChange={(event) => setRecipientUid(event.target.value)}>
            {users.map((user) => <option key={user.uid} value={user.uid}>{user.email}</option>)}
          </select></label>
        </div>}
        <button type="button" className="admin-primary-button" disabled={!uid || busy || (uid === PAIR && (!senderUid || !recipientUid || senderUid === recipientUid))} onClick={() => changeCapture(true)}>{busy ? 'Please wait…' : active ? 'Restart capture' : 'Start live demo'}</button>
        {active && <button type="button" className="admin-quiet-button" disabled={busy} onClick={() => changeCapture(false)}>Stop</button>}
        <button type="button" className="admin-quiet-button" onClick={onRefreshUsers}>Refresh accounts</button>
        <a className="admin-quiet-button" href="/" target="_blank" rel="noreferrer">Open user app ↗</a>
      </div>
      <p className="admin-live-help">{active ? `Watching ${uid === PAIR ? `${users.find((user) => user.uid === senderUid)?.email || senderUid} and ${users.find((user) => user.uid === recipientUid)?.email || recipientUid}` : selected?.email || (uid === NEW_ACCOUNT ? 'the next account' : uid)} until ${timeText(snapshot.activeUntil)}.` : 'Capture is off. Start it before registration or sign-in.'} {uid === NEW_ACCOUNT && snapshot.capturedUser && `Captured ${snapshot.capturedUser.email}. `}Returning users reuse browser keys. Timings and byte counts come from each browser; the encrypted packet comes from the message relay.</p>
      {error && <div className="admin-error" role="alert">{error}</div>}
      <TimingSummary flows={flows} />
      <p className="admin-live-method">Times use the user browser’s high-resolution clock. Stage times measure the named operation; total times include local preparation and, for registration, login, and send, network calls. Medians compare only the captured flows, so device speed, network latency, message size, and browser load affect results. A single run is a demonstration, not a PQC benchmark.</p>
      <MessageJourney flow={flows[0]} message={snapshot.latestMessage} />

      <div className="admin-live-public">
        <h3>Registered public {uid === PAIR ? 'identities' : 'identity'}</h3>
        {uid === PAIR && snapshot.pairedIdentities?.map(({ uid: id, identity }) => <p key={id}>
          {users.find((user) => user.uid === id)?.email || id}: {identity
            ? `ML-KEM ${byteLength(identity.bundle?.encryption_public_key_b64).toLocaleString()} B public key · ML-DSA ${byteLength(identity.bundle?.signing_public_key_b64).toLocaleString()} B public key`
            : 'No registered identity yet'}
        </p>)}
        {bundle ? <>
          {uid === PAIR && <p>Sender identity: {users.find((user) => user.uid === senderUid)?.email || senderUid}</p>}
          <p>Device: {snapshot.publicIdentity.device_id} · Registered: {new Date(snapshot.publicIdentity.updated_at).toLocaleString()}</p>
          <PublicMaterial label="Kyber / ML-KEM-768 public key · complete Base64" value={bundle.encryption_public_key_b64} />
          <PublicMaterial label="Dilithium / ML-DSA-65 public key · complete Base64" value={bundle.signing_public_key_b64} />
          <PublicMaterial label="Dilithium signature on the public identity · complete Base64" value={bundle.signature_b64} />
          <p>These full values are public material. Private keys remain in the user’s browser. Encrypted message envelopes are in Stored crypto records.</p>
        </> : <p>No public PQC identity is registered for this user yet.</p>}
        {uid === PAIR && snapshot.pairedIdentities?.[1]?.identity?.bundle && <>
          <p>Recipient identity: {users.find((user) => user.uid === recipientUid)?.email || recipientUid}</p>
          <PublicMaterial label="Recipient ML-KEM-768 public key · complete Base64" value={snapshot.pairedIdentities[1].identity.bundle.encryption_public_key_b64} />
          <PublicMaterial label="Recipient ML-DSA-65 public key · complete Base64" value={snapshot.pairedIdentities[1].identity.bundle.signing_public_key_b64} />
        </>}
      </div>

      <div className="admin-live-envelope">
        <h3>Actual encrypted relay packet</h3>
        {snapshot.latestMessage ? <>
          <p>Message {snapshot.latestMessage.id} · {new Date(snapshot.latestMessage.created_at).toLocaleString()} · {snapshot.latestMessage.sender_id} → {snapshot.latestMessage.receiver_id}</p>
          <p>This is what the server stored after the sender used the temporary keys. The raw AES content key, Kyber shared secret, and private identity keys can be revealed only in that user’s browser Profile → Your encryption keys.</p>
          <PublicMaterial label="AES-256-GCM ciphertext · complete Base64" value={snapshot.latestMessage.envelope?.ciphertext_b64} />
          <PublicMaterial label="AES-256-GCM nonce · complete Base64" value={snapshot.latestMessage.envelope?.nonce_b64} />
          {(snapshot.latestMessage.envelope?.key_wraps || []).map((wrap, index) => <div className="admin-live-wrap" key={`${wrap.user_id}-${index}`}>
            <h4>Kyber wrap for {wrap.user_id}</h4>
            <PublicMaterial label="ML-KEM-768 encapsulation ciphertext · complete Base64" value={wrap.kem_ciphertext_b64} />
            <PublicMaterial label="Encrypted AES content key · complete Base64" value={wrap.wrapped_key_b64} />
            <PublicMaterial label="Key-wrap nonce · complete Base64" value={wrap.nonce_b64} />
          </div>)}
          <PublicMaterial label="Sender Kyber / ML-KEM-768 public key · complete Base64" value={snapshot.latestMessage.envelope?.sender_bundle?.encryption_public_key_b64} />
          <PublicMaterial label="Sender Dilithium / ML-DSA-65 public key · complete Base64" value={snapshot.latestMessage.envelope?.sender_bundle?.signing_public_key_b64} />
          <PublicMaterial label="Dilithium / ML-DSA-65 message signature · complete Base64" value={snapshot.latestMessage.envelope?.signature_b64} />
        </> : <p>No encrypted direct message has been stored for this user during this capture yet.</p>}
      </div>

      <h3>Live stage timeline</h3>
      {!flows.length && <p className="admin-live-empty">No activity captured yet. Sign in as the selected user, then send or open a direct message.</p>}
      <div className="admin-live-flows" aria-live="polite">
        {flows.map((flow) => {
          const definition = PQC_FLOWS[flow.kind];
          const latest = flow.events.at(-1);
          const timing = flowTiming(flow);
          return <article key={flow.id}>
            <div className="admin-live-flow-head"><strong>{definition?.title || flow.kind}{flow.userId && ` · ${users.find((user) => user.uid === flow.userId)?.email || flow.userId}`}</strong><span>{timeText(latest?.created_at)} · {statusText[latest?.status] || latest?.status}</span></div>
            <div className="admin-live-flow-timing">
              <span><b>{formatMs(timing.totalMs)}</b> total</span>
              <span><b>{formatMs(timing.cryptoMs || null)}</b> measured crypto</span>
              {timing.relayMs != null && <span><b>{formatMs(timing.relayMs)}</b> relay call</span>}
            </div>
            <ol>{(definition?.steps || []).map(([step, label]) => {
              const progress = [...flow.events].reverse().find((event) => event.step === step);
              const keyAction = [...flow.events].reverse().find((event) => event.step === step && event.detail)?.detail;
              return <li key={step} className={`admin-live-stage admin-live-stage--${progress?.status || 'waiting'}`}>
                <span aria-hidden="true">{progress?.status === 'done' ? '✓' : progress?.status === 'active' ? '●' : '○'}</span>
                <span>{label}{progress?.metrics && Object.keys(progress.metrics).length > 0 && <em>{metricText(progress.metrics)}</em>}</span>
                <small>{keyAction ? `${keyAction} · ` : ''}{progress?.duration_ms != null ? formatMs(progress.duration_ms) : statusText[progress?.status] || 'waiting'}</small>
              </li>;
            })}</ol>
          </article>;
        })}
      </div>
    </section>
  </div>;
}

export default AdminHowItWorks;
