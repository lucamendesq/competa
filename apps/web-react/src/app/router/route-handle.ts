import { useMatches } from 'react-router';

export type RouteArea = 'accountant' | 'contact' | 'public';

export type RouteHandle = {
  title?: string;
  area?: RouteArea;
};

type MatchLike = { route?: { handle?: unknown }; handle?: unknown };

const handleOf = (match: MatchLike) =>
  (match.route?.handle ?? match.handle) as RouteHandle | undefined;

export const areaOf = (matches: readonly MatchLike[]) =>
  matches.reduce<RouteArea | undefined>((area, match) => handleOf(match)?.area ?? area, undefined);

export const documentTitle = (matches: readonly MatchLike[]) => {
  const title = matches.reduce<string | undefined>(
    (current, match) => handleOf(match)?.title ?? current,
    undefined,
  );
  return title ? `${title} - Competa` : 'Competa';
};

export const useDocumentTitle = () => documentTitle(useMatches());
