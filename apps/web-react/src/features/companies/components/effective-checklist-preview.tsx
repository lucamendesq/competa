import { CATEGORY_LABEL, FLAG_LABEL, PERIODICITY_LABEL } from '@/shared/lib/format';

export type PreviewLine = {
  key: string;
  name: string;
  category: string;
  periodicity: string;
  conditionFlag: string | null;
  fromOverride: boolean;
};

export const buildPreview = (lines: PreviewLine[], flags: Record<string, boolean>) => {
  const items = lines.filter(
    (line) => line.conditionFlag === null || flags[line.conditionFlag] === true,
  );
  const groups = new Map<string, PreviewLine[]>();
  for (const item of items) groups.set(item.category, [...(groups.get(item.category) ?? []), item]);
  return {
    total: items.length,
    groups: [...groups],
    customized: items.some((item) => item.fromOverride),
  };
};

export function EffectiveChecklistPreview({
  preview,
}: {
  preview: ReturnType<typeof buildPreview>;
}) {
  return (
    <div className="border-border border-t pt-5">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-sm font-semibold font-display text-foreground">
          Prévia do checklist
          {preview.customized ? (
            <span className="text-muted-foreground font-normal text-xs block sm:inline">
              {' '}
              (inclui ajustes desta empresa)
            </span>
          ) : null}
        </h3>
        <span className="bg-primary/10 text-primary border border-primary/20 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold shrink-0">
          {preview.total} itens
        </span>
      </div>
      <div className="mt-4 flex flex-col gap-4">
        {preview.groups.map(([category, items]) => (
          <div
            key={category}
            className="flex flex-col gap-2 rounded-lg bg-sunken/40 p-3 border border-border/50"
          >
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {CATEGORY_LABEL[category] ?? category}
            </h4>
            <ul className="flex flex-col gap-2.5">
              {items.map((item) => (
                <li key={item.key} className="text-sm flex flex-col">
                  <span className="font-medium text-foreground flex items-center justify-between gap-2">
                    <span>{item.name}</span>
                    {item.fromOverride ? (
                      <span className="inline-flex rounded-full bg-info-surface border border-info-border px-1.5 py-0.5 text-[10px] font-semibold text-info-foreground">
                        ajuste
                      </span>
                    ) : null}
                  </span>
                  <span className="text-muted-foreground mt-0.5 text-xs flex flex-wrap items-center gap-1.5">
                    <span>{PERIODICITY_LABEL[item.periodicity] ?? item.periodicity}</span>
                    {item.conditionFlag ? (
                      <span className="text-warning-foreground font-medium">
                        &middot; Se {FLAG_LABEL[item.conditionFlag]}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
