const apiUrl = `${location.protocol}//${location.hostname}:3000`;

export const environment = {
  production: false,
  apiUrl,
  authUrl: `${apiUrl}/api/auth`,
  sentryDsn: '',
};
