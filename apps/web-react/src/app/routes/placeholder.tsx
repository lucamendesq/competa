export function Placeholder({ name }: { name: string }) {
  return (
    <main className="p-6">
      <h1 className="text-foreground text-2xl font-semibold tracking-tight">{name}</h1>
    </main>
  );
}
