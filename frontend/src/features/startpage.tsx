import type { FormEvent } from 'react';
import { Button } from '../components/ui/button';

type StartPageProps = {
  onStart: (name: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
};


export function StartPage({
  onStart,
  isLoading,
  error,
}: StartPageProps) {

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get('project_name') ?? '').trim();

    void onStart(name);
  };


  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <section className="w-full max-w-xl text-center">
        <h1 className="font-sans text-xl font-bold tracking-tight text-[#1E2430]">
          Draft<span className="text-[#C46A2B]">2</span>Device
        </h1>
        <p className="text-xs font-mono text-[#5A6172] mt-1">Skizze → Code</p>

        <p className="mt-4 text-muted-foreground">
          Erstelle ein neues Projekt
        </p>
        <form onSubmit={handleSubmit}>
          <input  
            className="mt-4 w-full rounded-lg border border-[#D9D3C7] bg-white px-4 py-2 text-sm text-[#1E2430] placeholder:text-[#5A6172]/50 focus:border-[#C46A2B] focus:ring-1 focus:ring-[#C46A2B]"
            type="text"
            placeholder="Projektname"
            name="project_name"
          />
          <Button className="mt-8" type="submit" disabled={isLoading}>
            {isLoading ? 'Projekt wird erstellt …' : 'Projekt erstellen'}
          </Button>
        </form>

        {error && (
          <p
            role="alert"
            className="mt-4 text-sm text-destructive"
          >
            {error}
          </p>
        )}
      </section>
    </main>
  );
}