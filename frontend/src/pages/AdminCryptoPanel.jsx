import { useCallback, useEffect, useState } from "react";
import { fetchAdminCryptoItems, fetchAdminCryptoOverview } from "../services/adminService";

const sections = [
  { id: "identities", label: "Public keys" },
  { id: "messages", label: "Encrypted messages" },
  { id: "logins", label: "Authentication events" },
];

const formatDate = (value) => value ? new Date(value).toLocaleString() : "—";

function AdminCryptoPanel({ token, onExpired }) {
  const [section, setSection] = useState("identities");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [overview, setOverview] = useState(null);
  const [result, setResult] = useState({ items: [], total: 0, pageSize: 20 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const changeSection = useCallback((next) => {
    setSection(next);
    setPage(1);
    setResult({ items: [], total: 0, pageSize: 20 });
  }, []);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError("");
    Promise.all([
      fetchAdminCryptoOverview(token),
      fetchAdminCryptoItems(token, section, page),
    ]).then(([summary, data]) => {
      if (!current) return;
      setOverview(summary);
      setResult(data);
    }).catch((err) => {
      if (!current) return;
      if (/admin session expired|admin sign in required/i.test(err.message || "")) onExpired();
      setError(err.message || "Unable to load cryptography records.");
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [token, section, page, refresh, onExpired]);

  const lastPage = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <div className="admin-crypto">
      <div className="admin-heading">
        <div>
          <div className="admin-eyebrow">PQC RECORDS</div>
          <h1>Cryptography and logins</h1>
          <p>Public PQC identity bundles, encrypted direct-message envelopes, and authentication events stored by the server.</p>
        </div>
        <button type="button" className="admin-primary-button" onClick={() => setRefresh((value) => value + 1)} disabled={loading}>{loading ? "Loading…" : "↻ Refresh"}</button>
      </div>

      <div className="admin-stats">
        <div><strong>{overview?.counts?.identities ?? "—"}</strong><span>PQC public identities</span></div>
        <div><strong>{overview?.counts?.encrypted_messages ?? "—"}</strong><span>Encrypted direct messages</span></div>
        <div><strong>{overview?.counts?.auth_events ?? "—"}</strong><span>Recorded auth events</span></div>
      </div>
      <div className="admin-algorithms">
        <article><strong>Kyber</strong><span>{overview?.algorithms?.keyExchange || "ML-KEM-768"}</span><p>Public encryption keys and per-message encapsulation ciphertext.</p></article>
        <article><strong>Dilithium</strong><span>{overview?.algorithms?.signature || "ML-DSA-65"}</span><p>Public signing keys and message signatures.</p></article>
        <article><strong>AES-256</strong><span>{overview?.algorithms?.messageCipher || "AES-256-GCM"}</span><p>Message ciphertext, nonce, and encrypted content-key wraps. Raw AES keys stay in browsers.</p></article>
      </div>
      <p className="admin-crypto-note">Message plaintext and private keys remain in user browsers. Login uses Argon2id password hashes and HS256 session tokens; it does not use PQC. Login events are recorded from this update onward.</p>

      <div className="admin-crypto-tabs" role="tablist" aria-label="Crypto records">
        {sections.map((item) => (
          <button type="button" key={item.id} role="tab" aria-selected={section === item.id} className={section === item.id ? "active" : ""} onClick={() => changeSection(item.id)}>{item.label}</button>
        ))}
      </div>

      {error && <div className="admin-error" role="alert">{error}</div>}
      <div className="admin-records">
        {!loading && result.items.length === 0 && <p className="admin-empty">No records found.</p>}
        {!loading && result.items.map((item) => (
          <article className="admin-record" key={item.id || `${item.user_id}-${item.suite_id}`}>
            {section === "identities" && <>
              <div><strong>{item.user_id}</strong><span>PQC identity · {formatDate(item.updated_at)}</span></div>
              <p>Suite: {item.suite_id} · Device: {item.device_id}</p>
              <details><summary>Kyber / ML-KEM-768 public encryption key</summary><pre>{item.bundle?.encryption_public_key_b64 || "—"}</pre></details>
              <details><summary>Dilithium / ML-DSA-65 public signing key</summary><pre>{item.bundle?.signing_public_key_b64 || "—"}</pre></details>
              <details><summary>View public key bundle</summary><pre>{JSON.stringify(item.bundle, null, 2)}</pre></details>
            </>}
            {section === "messages" && <>
              <div><strong>Message {item.id}</strong><span>{formatDate(item.created_at)}</span></div>
              <p>Thread: {item.thread_id} · From: {item.sender_id} · To: {item.receiver_id}</p>
              <p>Suite: {item.envelope?.suite_id} · Cipher: {item.envelope?.cipher} · Signature: {item.envelope?.signature_algorithm}</p>
              <details><summary>AES-256-GCM ciphertext and nonce</summary><pre>{JSON.stringify({ ciphertext_b64: item.envelope?.ciphertext_b64, nonce_b64: item.envelope?.nonce_b64 }, null, 2)}</pre></details>
              <details><summary>Kyber encapsulations and wrapped AES content keys</summary><pre>{JSON.stringify(item.envelope?.key_wraps, null, 2)}</pre></details>
              <details><summary>Dilithium / ML-DSA-65 signature</summary><pre>{item.envelope?.signature_b64 || "—"}</pre></details>
              <details><summary>View encrypted envelope and key wraps</summary><pre>{JSON.stringify(item.envelope, null, 2)}</pre></details>
            </>}
            {section === "logins" && <>
              <div><strong>{item.event_type.replaceAll("_", " ")}</strong><span>{formatDate(item.created_at)}</span></div>
              <p>Account: {item.email} · ID: {item.account_id}</p>
            </>}
          </article>
        ))}
      </div>
      <div className="admin-pagination">
        <span>Page {page} of {lastPage} · {result.total} records</span>
        <button type="button" className="admin-quiet-button" disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
        <button type="button" className="admin-quiet-button" disabled={loading || page >= lastPage} onClick={() => setPage((value) => value + 1)}>Next</button>
      </div>
    </div>
  );
}

export default AdminCryptoPanel;
