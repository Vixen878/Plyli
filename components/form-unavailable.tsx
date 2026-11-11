import { CalendarX, CircleCheck } from 'lucide-react';

export function FormUnavailable({ title, kind, message }: {
  title: string;
  kind: 'closed' | 'submitted';
  message: string;
}) {
  const Icon = kind === 'closed' ? CalendarX : CircleCheck;
  return <main className="mx-auto grid min-h-dvh max-w-lg content-center px-5 py-12">
    <section aria-labelledby="form-availability-title" className="overflow-hidden rounded-2xl border-2 border-[#2A2623] bg-[#FFFDF9] shadow-[4px_4px_0_#2A2623]">
      <div aria-hidden="true" className={'h-2.5 border-b-2 border-[#2A2623] ' + (kind === 'closed' ? 'bg-[#F6D97A]' : 'bg-[#C5DFC9]')} />
      <div className="space-y-4 p-6 sm:p-8">
        <div className="flex items-start gap-2 text-sm font-semibold text-[#6E655E]"><Icon aria-hidden="true" size={19} className="shrink-0" /><span className="min-w-0 [overflow-wrap:anywhere]">{title}</span></div>
        <h1 id="form-availability-title" className="font-display text-3xl font-bold">{kind === 'closed' ? 'Responses are closed' : 'You’ve already responded'}</h1>
        <p className="whitespace-pre-line text-sm leading-relaxed text-[#6E655E] [overflow-wrap:anywhere]">{message}</p>
      </div>
    </section>
  </main>;
}
