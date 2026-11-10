'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { PaperButton } from './paper-primitives';

function highlighted(code: string) {
  return code.split(/(\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:import|from|export|type|const|let|await|async|if|else|throw|new|try|catch|return|function|instanceof|typeof|true|false|null|undefined)\b|\b\d+\b)/g).map((part, index) => {
    const color = part.startsWith('//') ? 'text-[#B9B0A5]' : /^["'`]/.test(part) ? 'text-[#F6D97A]' : /^\d+$/.test(part) ? 'text-[#A8D6F0]' : /^(import|from|export|type|const|let|await|async|if|else|throw|new|try|catch|return|function|instanceof|typeof|true|false|null|undefined)$/.test(part) ? 'text-[#F5B4A4]' : '';
    return <span key={index} className={color}>{part}</span>;
  });
}

export function CodeBlock({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  return <div className="min-w-0 rounded-xl border-2 border-[#2A2623] overflow-hidden">
    <div className="flex justify-between items-center gap-3 px-4 py-2 bg-[#F2ECE1] border-b border-[#2A2623]/20">
      <span className="font-mono text-xs">{label}</span>
      <PaperButton size="sm" aria-label={`Copy ${label}`} onClick={async () => {
        try {
          await navigator.clipboard.writeText(code);
          setError(''); setCopied(true); setTimeout(() => setCopied(false), 1800);
        } catch { setError('Select the example to copy it.'); }
      }}>{copied ? <Check size={12} /> : <Copy size={12} />}{copied ? 'Copied' : 'Copy'}</PaperButton>
    </div>
    <pre tabIndex={0} aria-label={label} className="p-4 sm:p-5 bg-[#2A2623] text-[#FAF6F0] overflow-x-auto text-xs leading-6 focus-visible:outline-2 focus-visible:outline-[#F6D97A]"><code>{highlighted(code)}</code></pre>
    {error && <p role="status" className="p-2 text-xs">{error}</p>}
  </div>;
}
