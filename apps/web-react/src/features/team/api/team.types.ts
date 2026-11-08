export type TeamAccountant = {
  id: string;
  name: string;
  email: string;
  owner: boolean;
  createdAt: string;
};

export type PendingInvite = { id: string; email: string; expiresAt: string };

export type CreatedInvite = { id: string; email: string; url: string };
