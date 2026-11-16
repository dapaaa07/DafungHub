import { query } from '../lib/db';

export async function backfillWebUsernames() {
  const users = await query<{ id: string; email: string; username: string | null }>(
    `SELECT id, email, username
     FROM public.users
     WHERE email IS NOT NULL AND (username IS NULL OR username = '')`
  );

  console.log(`Found ${users.rows.length} users needing username backfill.`);

  for (const u of users.rows) {
    let base = u.email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!base || base.length < 3) base = `user_${u.id.substring(0, 6)}`;
    base = base.substring(0, 24);

    let candidate = base;
    let counter = 1;
    while (true) {
      const check = await query(
        `SELECT id FROM public.users WHERE LOWER(username) = $1 AND id <> $2 LIMIT 1`,
        [candidate, u.id]
      );
      if (check.rows.length === 0) break;
      candidate = `${base.substring(0, 20)}${counter}`;
      counter++;
    }

    await query(`UPDATE public.users SET username = $1 WHERE id = $2`, [candidate, u.id]);
    console.log(`Updated user ${u.email} -> @${candidate}`);
  }

  const check = await query(
    `SELECT id, telegram_id, email, username, name FROM public.users WHERE email IS NOT NULL`
  );
  console.log('Result in public.users:');
  console.table(check.rows);
}

if (process.argv[1]?.endsWith('backfill-usernames.ts')) {
  backfillWebUsernames()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
