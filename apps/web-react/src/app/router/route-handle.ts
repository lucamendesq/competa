export type RouteArea = 'accountant' | 'contact';

export type RouteHandle = {
  title?: string;
  area?: RouteArea;
};

export const areaOf = (matches: readonly { route: { handle?: unknown } }[]) =>
  matches.reduce<RouteArea | undefined>(
    (area, match) => (match.route.handle as RouteHandle | undefined)?.area ?? area,
    undefined,
  );
