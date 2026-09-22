interface GetDbUrlArgs {
  user: string;
  password?: string;
  host: string;
  port: number;
  dbName: string;
}

export const getDbUrl = ({ user, password, host, port, dbName }: GetDbUrlArgs) =>
  `postgresql://${encodeURIComponent(user)}${password ? `:${encodeURIComponent(password)}` : ''}@${host}:${port}/${dbName}`;
