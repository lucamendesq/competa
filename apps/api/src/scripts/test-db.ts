import { db } from '../infra/database/index.js';
import { invite } from '../infra/database/schema/registry.js';
import { eq } from 'drizzle-orm';
async function run() {
  const [row] = await db.select().from(invite).where(eq(invite.tokenHash, '88e3faf92bfae4fd337b89db8bf83199e617729c087ba0a134cc552a39a1afbb'));
  console.log(row);
  process.exit(0);
}
run();
