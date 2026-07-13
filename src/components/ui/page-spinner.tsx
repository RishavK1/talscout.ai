export function PageSpinner({ label }: { label?: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        {label && <p className="font-label-md text-text-muted">{label}</p>}
      </div>
    </main>
  );
}
