interface GetDbUrlArgs {
  user: string;
  password?: string;
  host: string;
  port: number;
  dbName: string;
}

export const getDbUrl = ({ user, password, host, port, dbName }: GetDbUrlArgs) =>
  `postgresql://${user}:${password}@${host}:${port}/${dbName}`;
