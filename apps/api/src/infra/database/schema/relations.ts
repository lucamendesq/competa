import { defineRelations } from 'drizzle-orm';
import { user } from './auth.js';
import { accountant, accountingFirm, company, contact, invite } from './registry.js';

export const relations = defineRelations(
  { accountingFirm, accountant, company, contact, invite, user },
  (r) => ({
    accountingFirm: {
      accountants: r.many.accountant(),
      companies: r.many.company(),
      invites: r.many.invite(),
    },
    accountant: {
      accountingFirm: r.one.accountingFirm({
        from: r.accountant.accountingFirmId,
        to: r.accountingFirm.id,
      }),
      user: r.one.user({ from: r.accountant.authUserId, to: r.user.id }),
    },
    company: {
      accountingFirm: r.one.accountingFirm({
        from: r.company.accountingFirmId,
        to: r.accountingFirm.id,
      }),
      contacts: r.many.contact(),
      invites: r.many.invite(),
    },
    contact: {
      company: r.one.company({ from: r.contact.companyId, to: r.company.id }),
      user: r.one.user({ from: r.contact.authUserId, to: r.user.id }),
    },
    invite: {
      accountingFirm: r.one.accountingFirm({
        from: r.invite.accountingFirmId,
        to: r.accountingFirm.id,
      }),
      company: r.one.company({ from: r.invite.companyId, to: r.company.id }),
    },
  }),
);
