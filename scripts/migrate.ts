import { getDb } from '../lib/db/client';
const db = getDb();
console.log('migrations applied, user_version =', db.pragma('user_version', { simple: true }));
