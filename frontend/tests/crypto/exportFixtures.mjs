import { setup, message } from './helpers.mjs';
const f = await setup();
const envelopes = {};
for (const suite of ['classical', 'pqc']) envelopes[suite] = await f.alice.encrypt(message(suite, JSON.stringify({ type: 'text', text: 'backend contract test' })));
process.stdout.write(JSON.stringify({ envelopes, bundles: [...f.bundles.values()] }));
