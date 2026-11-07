# Padrão React do `apps/web-react`

Padrão normativo do `apps/web-react`. Em caso de conflito com `docs/conventions.md`, este documento vence para o frontend; o `AGENTS.md` continua valendo para nomenclatura, comentários, invariantes de segurança e styling.

O texto abaixo é a citação literal do padrão exigido na migração (Anexo A de [`docs/react-migration-2026-11.md`](./react-migration-2026-11.md)) e fica em inglês por isso.

```text
Act as a senior React engineer. Build this app using modern, production-grade React standards.

CORE PRINCIPLES
- Separate server state, client state, and UI-local state.
- Use TanStack Query for ALL server/API data: fetching, caching, loading/error states, retries, background refetching, and invalidation.
- Use local React state first. Lift state only when multiple components need it.
- Use Zustand for global client/UI state. Do not use Zustand for server data.
- Use React Context only for low-frequency, app-wide values such as theme, auth/session provider, or configuration.
- Use URL/search params for filters, pagination, tabs, and other shareable UI state.
- Organize code by feature, not only by file type.
- Keep shared code domain-agnostic. Shared code must not import from feature code.
- Do not add abstractions until there are at least two real consumers.
- Do not use useEffect to derive state from props/state. Derive values during render instead.
- Use useEffect only for synchronization with external systems.
- Keep components pure and avoid redundant state.

TECH STACK / DEFAULTS
- React + TypeScript.
- TanStack Query for server state.
- Zustand for global client state.
- React Hook Form + Zod for forms, unless the project already uses another standard.
- React Router or the project's existing routing solution.
- React Compiler where available.
- ESLint + Prettier/Biome.
- Strict TypeScript.
- Route-level code splitting for large features.
- Error Boundaries around route segments and risky widgets.

TANSTACK QUERY STANDARDS
- Use TanStack Query for every remote data request.
- Never fetch server data in useEffect and store it in useState, Zustand, Redux, or Context.
- Keep query keys, query functions, types, and custom hooks colocated in the feature that owns the resource.
- Use query-key factories. Never scatter raw string arrays across components.
- Query keys must include every variable that affects the response: IDs, filters, search, pagination, sorting, etc.
- Query functions must be pure: accept arguments, call the API, and return typed data. No UI logic inside them.
- Use useQuery for reads and useMutation for writes.
- Explicitly handle isPending, isError, data, and empty results in the UI.
- Do not infer loading from !data because cached data may exist during a background refetch.
- Use Suspense/useSuspenseQuery only for route-critical data, with proper Suspense boundaries and prefetching where appropriate.
- Set sensible QueryClient defaults centrally: staleTime, gcTime, retry behavior, and refetchOnWindowFocus.
- Use staleTime: Infinity only when data should refresh only after explicit invalidation.
- Use 'static' only for data that cannot change during the app lifetime, such as boot-time feature flags or permissions.
- After a successful mutation, invalidate the narrowest relevant query keys.
- Prefer invalidation after mutation as the default cache-update strategy.
- Use setQueryData only when the server returns the complete updated resource and the cache can be updated immutably.
- Use optimistic updates sparingly, only for high-value interactions. Always implement rollback and reconciliation logic.

EXAMPLE STRUCTURE FOR A FEATURE
src/features/todos/
  api/
    get-todos.ts
    create-todo.ts
    todo.types.ts
  queries/
    todo-keys.ts
    use-todos.ts
    use-create-todo.ts
  components/
    todo-list.tsx
    todo-item.tsx
  index.ts

QUERY KEY EXAMPLE
export const todoKeys = {
  all: ['todos'] as const,
  lists: () => [...todoKeys.all, 'list'] as const,
  list: (filters: TodoFilters) => [...todoKeys.lists(), filters] as const,
  details: () => [...todoKeys.all, 'detail'] as const,
  detail: (id: string) => [...todoKeys.details(), id] as const,
};

QUERY HOOK EXAMPLE
export function useTodos(filters: TodoFilters) {
  return useQuery({
    queryKey: todoKeys.list(filters),
    queryFn: () => getTodos(filters),
  });
}

MUTATION EXAMPLE
export function useCreateTodo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createTodo,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: todoKeys.lists() });
    },
  });
}

LOADING / ERROR / EMPTY STATE EXAMPLE
const todos = useTodos(filters);

if (todos.isPending) return <TodoListSkeleton />;
if (todos.isError) return <ErrorState retry={todos.refetch} />;
if (!todos.data.length) return <EmptyState />;

return <TodoList todos={todos.data} />;

STATE MANAGEMENT DECISION TREE
1. Is the state component-local? Use useState.
2. Is it derived from props or existing state? Calculate it during render; do not store it.
3. Do multiple components under one parent need it? Lift it to the closest common parent.
4. Is it server data? Use TanStack Query.
5. Is it URL-representable? Use route/search params.
6. Is it global client/UI state? Use Zustand.
7. Is it mostly read-only global configuration? Use React Context.
8. Is it complex local workflow state? Use useReducer.

ZUSTAND STANDARDS
- Create feature-scoped Zustand stores, not one giant global store.
- Store only client/UI state: modals, drawers, toasts, selected items, wizard steps, local feature flags, etc.
- Do not store API responses, server cache, or query status in Zustand.
- Select narrow slices from stores.
- Use useShallow when selecting multiple fields or objects/arrays.
- Update state immutably.
- Split large stores into smaller slices.
- Use persist only for state that genuinely needs to survive reloads.
- Use partialize with persist to avoid storing transient or sensitive data.

ZUSTAND EXAMPLE
type CheckoutStore = {
  step: 'cart' | 'shipping' | 'payment';
  setStep: (step: CheckoutStore['step']) => void;
};

export const useCheckoutStore = create<CheckoutStore>()((set) => ({
  step: 'cart',
  setStep: (step) => set({ step }),
}));

FOLDER STRUCTURE
src/
  app/
    providers/
    router/
    routes/
    app.tsx

  features/
    auth/
      api/
      components/
      hooks/
      queries/
      store/
      types/
      utils/
      index.ts

    billing/
      api/
      components/
      hooks/
      queries/
      types/
      index.ts

  shared/
    components/
      ui/
      layout/
    hooks/
    lib/
      api-client.ts
      query-client.ts
      utils.ts
    types/
    config/

  testing/
    mocks/
    factories/
    test-utils.tsx

FOLDER / ARCHITECTURE RULES
- shared/ may not import from features/.
- features/ may import from shared/, but not from another feature.
- app/ composes features into routes, layouts, and providers.
- Each feature exposes a public API through index.ts.
- Keep feature internals private.
- Delete a feature by deleting its folder and its route/provider wiring in app/.
- Start simple and grow the structure only as the application grows.

MEMOIZATION / PERFORMANCE
- Enable React Compiler where possible.
- Do not blanket-wrap components in memo.
- Do not blanket-wrap functions in useCallback.
- Do not blanket-wrap values in useMemo.
- Rely on React Compiler for automatic memoization in most cases.
- Use React.memo only for components that re-render often with stable props and have expensive rendering.
- Use useCallback only when referential stability is required, such as passing callbacks to memoized children or satisfying effect dependencies.
- Use useMemo only for expensive calculations or referential stability requirements.
- Measure performance before optimizing.
- Use React DevTools Profiler and production tracing when investigating performance.
- Do not optimize prematurely.

ENGINEERING GUARDRAILS
- Type the API boundary once and validate API responses with Zod or an equivalent schema library.
- Keep API clients thin: typed request functions only, no business logic in components.
- Do not trust raw JSON types.
- Test behavior, not implementation details.
- Prioritize tests for feature hooks, query invalidation, critical flows, and business logic.
- Avoid trivial tests for simple presentational components.
- Enforce architecture with lint rules where possible.
- Prevent cross-feature imports.
- Keep imports flowing in one direction: shared -> features -> app.

WHEN BUILDING FEATURES
- colocate related components, hooks, API calls, query keys, types, and store logic.
- expose a minimal public API from each feature.
- avoid creating global folders for every component, hook, or utility.
- avoid putting feature-specific logic in shared/.
- avoid storing server data in client state.
- avoid using Context as a general-purpose state manager.
- avoid using useEffect for data fetching or derived state.
- avoid premature memoization.
- avoid one giant global Zustand store.
- avoid duplicating server state between TanStack Query and Zustand.

Follow these standards consistently throughout the entire application.

COMPETA-SPECIFIC ADDENDA (decided in the migration plan, 2026-11)
- One exception to "features may not import from another feature": the leaf feature `catalog` (document types, template options, CatalogPicker). It imports nothing from other features and is the only feature others may import. Enforced by eslint-plugin-boundaries.
- The session (`/auth/me`, `/my/profile`) is a TanStack Query owned by `features/auth`; its derived value is exposed through a Context defined in `shared/session` and provided by `app/providers`. The Context holds no state of its own.
- Allowed Zustand stores: `shared/pwa/install.store.ts` and `features/companies/store/invited-companies.store.ts`. Adding a store requires a ticket that names the client-only state it holds.
- `useSuspenseQuery` is used only in the route guards (session). Pages use `useQuery` with explicit pending/error/empty rendering.
- Side-effect hooks allowed: `useBlocker` + `beforeunload` in the template editor; window listeners for PWA install registered once at module level. Anything else needs a ticket.
- Hooks that take injected dependencies (`useUpload`) and primitives used by two features move to `shared/` at the moment the second consumer appears, not before.
- UI primitives come from shadcn/ui, generated into `shared/components/ui/` and customized there. `@radix-ui/*` (what shadcn installs underneath) is never imported outside that folder; enforced by `no-restricted-imports`.
- AGENTS.md still governs naming (EN identifiers / PT-BR UI), no comments, upload-flow invariants (never file names, storage keys or download routes under the upload token), Tailwind-only styling, and contracts from `@competa/contracts` as the single validation source.
```

## Testes

Vitest + Testing Library + MSW, em `apps/web-react` (`pnpm --filter web-react test`).

- **O que testar:** hooks de feature (query keys, invalidação depois de mutation), fluxos críticos (entrar → abrir competência → painel → revisão; envio público; cadastro) e lógica de negócio pura (`format.ts`, `item-status.ts`, `readSpreadsheet`, `useUpload`).
- **O que não testar:** componentes puramente apresentacionais (um `StatusPill` que só mapeia props para classes). Comparação visual com o baseline cobre esses.
- **Como:** `renderWithProviders` e `renderHookWithProviders` de `src/testing/test-utils.tsx` (QueryClient novo por teste, sem retry; router em memória). A rede é sempre o MSW (`src/testing/mocks/handlers/`, um arquivo por recurso); request sem handler falha o teste. Dados de teste vêm das fábricas de `src/testing/factories/`.
- Afirme o que o usuário vê e o que a API recebeu, não detalhes de implementação.
