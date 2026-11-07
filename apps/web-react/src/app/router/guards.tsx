import { Outlet } from 'react-router';

export function RequireAccountant() {
  return <Outlet />;
}

export function RequireContact() {
  return <Outlet />;
}

export function GuestOnly() {
  return <Outlet />;
}
