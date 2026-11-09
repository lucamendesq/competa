export const pwaKeys = {
  all: ['pwa'] as const,
  vapidKey: () => [...pwaKeys.all, 'vapid-key'] as const,
  subscription: () => [...pwaKeys.all, 'push-subscription'] as const,
};
