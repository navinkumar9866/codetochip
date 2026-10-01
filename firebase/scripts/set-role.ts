// Usage: pnpm set-role <email> <student|teacher|editor|admin>
// The user must sign out and in again (or wait up to an hour) for the new role to apply.
import { isRole, ROLES } from '@codetochip/data';
import { initAdmin } from './admin.ts';

const [email, role] = process.argv.slice(2);
if (!email || !isRole(role)) {
  console.error(`Usage: pnpm set-role <email> <${ROLES.join('|')}>`);
  process.exit(1);
}

const { auth, projectId } = initAdmin();
const user = await auth.getUserByEmail(email);
await auth.setCustomUserClaims(user.uid, { ...user.customClaims, role });
console.log(`${email} is now "${role}" in ${projectId}.`);
