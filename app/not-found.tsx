export default function NotFound() {
  return <main className="max-w-xl mx-auto px-6 py-24 space-y-6">
    <p className="font-display font-extrabold text-xl">Plyli.</p>
    <h1 className="font-display font-bold text-3xl">This page isn’t available</h1>
    <p className="text-[#6E655E]">The link may have changed, or this form may no longer accept responses.</p>
    <a href="/dashboard" className="inline-flex px-4 py-2 rounded-xl border-2 border-[#2A2623] shadow-[3px_3px_0px_#2A2623] bg-[#FFFDF9] font-semibold text-sm hover:bg-[#F5EFE6] focus-visible:outline-2 focus-visible:outline-offset-2">Go to workspace</a>
  </main>;
}
