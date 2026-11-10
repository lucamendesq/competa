import { Outlet } from 'react-router';
import { useDocumentTitle } from '@/app/router/route-handle';

export function RootLayout() {
  const title = useDocumentTitle();

  return (
    <>
      <title>{title}</title>
      <Outlet />
    </>
  );
}
