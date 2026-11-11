'use client';

import { useState } from 'react';
import { GitBranch, RotateCcw } from 'lucide-react';
import { resolveNextNodeId } from '@/core/branching';
import { validateQuestionAnswer } from '@/core/validation';
import type { AnswerValue, FormSchema } from '@/core/types';
import { QuestionRenderer } from './question-renderer';
import { PaperButton } from './paper-primitives';

export function LandingDemo({ form }: { form: FormSchema }) {
  const firstNode = form.questions.find((question) => question.logicRules.length > 0)?.id ?? form.questions[0].id;
  const [node, setNode] = useState(firstNode);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [error, setError] = useState<string | null>(null);
  const question = form.questions.find((item) => item.id === node);

  function next() {
    if (!question) return;
    const validation = validateQuestionAnswer(question, answers[node]);
    if (!validation.valid) { setError(validation.error ?? 'Check your answer.'); return; }
    setError(null);
    setNode(resolveNextNodeId(form, node, answers));
  }
  return <section aria-label="Interactive form example" className="overflow-hidden rounded-3xl border-2 border-[#2A2623] bg-[#FFFDF9] shadow-[6px_6px_0px_#2A2623]">
    <div className="flex items-center justify-between gap-2 border-b border-[#2A2623]/25 bg-[#F6D97A]/35 px-5 py-3 text-xs font-bold">
      <span className="inline-flex items-center gap-1.5"><GitBranch size={15} />Event RSVP</span>
      <span className="text-[#6E655E]">Interactive example</span>
    </div>
    <div className="min-h-64 p-5 sm:p-8">
      {question ? <QuestionRenderer key={node} question={question} stepNumber={form.questions.indexOf(question) + 1} totalSteps={form.questions.length} value={answers[node]} error={error}
        onChange={(value) => { setError(null); setAnswers({ ...answers, [node]: value }); }} onSubmitStep={next} />
        : <div role="status" className="space-y-3 py-8"><h2 className="font-display text-2xl font-bold">You reached the end.</h2><p className="text-sm text-[#6E655E]">Branching chooses the next question based on your answer. This example runs locally in the page.</p></div>}
    </div>
    <div className="flex items-center justify-between gap-2 border-t border-[#2A2623]/15 px-5 py-3">
      <span className="text-xs text-[#6E655E]">Try an answer to see where it leads.</span>
      <PaperButton variant="ghost" size="sm" onClick={() => { setNode(firstNode); setAnswers({}); setError(null); }}><RotateCcw size={14} />Restart</PaperButton>
    </div>
  </section>;
}
