import { useEffect, useState } from 'react';
import { PQC_FLOWS, subscribePqcActivity } from '../../crypto/pqcActivity.js';
import './PqcActivity.css';

export default function PqcActivity() {
  const [activity, setActivity] = useState(null);

  useEffect(() => subscribePqcActivity((event) => {
    setActivity((current) => {
      const same = current?.id === event.id;
      if (current && !same && event.status !== 'start') return current;
      const steps = { ...(same ? current.steps : {}) };
      const details = { ...(same ? current.details : {}) };
      if (event.step) steps[event.step] = event.status;
      if (event.step && event.detail) details[event.step] = event.detail;
      return {
        id: event.id,
        kind: event.kind,
        steps,
        details,
        status: event.status === 'complete' || event.status === 'error'
          ? event.status : 'running',
      };
    });
  }), []);

  useEffect(() => {
    if (!activity || activity.status === 'running') return undefined;
    const timer = window.setTimeout(() => setActivity((current) => current?.id === activity.id ? null : current), 10000);
    return () => window.clearTimeout(timer);
  }, [activity]);

  if (!activity) return null;
  const flow = PQC_FLOWS[activity.kind];
  return (
    <aside className="qx-pqc-activity" role="status" aria-live="polite" aria-label="Post-quantum cryptography activity">
      <div className="qx-pqc-activity-head">
        <span className="qx-pqc-activity-mark" aria-hidden="true">⚛</span>
        <div><small>POST-QUANTUM CRYPTOGRAPHY</small><strong>{flow.title}</strong></div>
        <button type="button" aria-label="Dismiss cryptography activity" onClick={() => setActivity(null)}>×</button>
      </div>
      <ol>
        {flow.steps.map(([key, label]) => {
          const state = activity.steps[key] || 'waiting';
          return <li key={key} className={`qx-pqc-step qx-pqc-step--${state}`}>
            <span aria-hidden="true">{state === 'done' ? '✓' : state === 'active' ? '●' : '○'}</span>
            {label}{activity.details[key] && <small>· {activity.details[key]}</small>}
          </li>;
        })}
      </ol>
      <div className={`qx-pqc-activity-state qx-pqc-activity-state--${activity.status}`}>
        {activity.status === 'complete' ? 'Protected in your browser ✓' : activity.status === 'error' ? 'Operation failed — see the app message' : 'Working locally in this browser…'}
      </div>
    </aside>
  );
}
