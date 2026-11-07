import { createBrowserRouter, type RouteObject } from 'react-router';

const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: '/__ui',
        lazy: async () => ({ Component: (await import('@/app/routes/ui-gallery')).UiGallery }),
      },
    ]
  : [];

export const router = createBrowserRouter([...devRoutes, { path: '*', element: null }]);
