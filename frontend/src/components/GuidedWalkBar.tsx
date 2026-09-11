import React from 'react';

export interface GuidedStep {
  stepNumber: number;
  title: string;
  badge: string;
  description: string;
  actionText: string;
  actionHandler: () => void;
}

interface GuidedWalkBarProps {
  currentStep: number;
  totalSteps: number;
  onNextStep: () => void;
  onPrevStep: () => void;
  onSelectStep: (step: number) => void;
  onCloseTour: () => void;
  steps: GuidedStep[];
}

export const GuidedWalkBar: React.FC<GuidedWalkBarProps> = ({
  currentStep,
  totalSteps,
  onNextStep,
  onPrevStep,
  onSelectStep,
  onCloseTour,
  steps,
}) => {
  const active = steps[currentStep - 1] || steps[0];

  return (
    <div className="mb-6 rounded-2xl bg-gradient-to-r from-slate-900 via-amber-950/30 to-slate-900 border-2 border-amber-500/40 p-4 lg:p-5 shadow-2xl backdrop-blur-xl animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-mono font-bold text-sm">
            {currentStep}/{totalSteps}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400 font-bold">
                GUIDED PRODUCT WALKTHROUGH
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono border border-amber-500/30">
                {active.badge}
              </span>
            </div>
            <h3 className="text-sm lg:text-base font-bold text-white mt-0.5">
              {active.title}
            </h3>
          </div>
        </div>

        {/* Step Indicator Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-1">
          {steps.map((s) => (
            <button
              key={s.stepNumber}
              onClick={() => onSelectStep(s.stepNumber)}
              className={`h-2.5 rounded-full transition-all cursor-pointer ${
                s.stepNumber === currentStep
                  ? 'w-8 bg-amber-400 shadow-sm shadow-amber-400/50'
                  : s.stepNumber < currentStep
                  ? 'w-4 bg-emerald-500/70'
                  : 'w-4 bg-slate-700 hover:bg-slate-600'
              }`}
              title={`Step ${s.stepNumber}: ${s.title}`}
            />
          ))}
        </div>

        <button
          onClick={onCloseTour}
          className="text-xs text-slate-400 hover:text-slate-200 self-end md:self-auto cursor-pointer"
        >
          Exit Tour &times;
        </button>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mt-3">
        <p className="text-xs lg:text-sm text-slate-300 leading-relaxed max-w-4xl">
          {active.description}
        </p>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={active.actionHandler}
            className="py-1.5 px-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md shadow-amber-500/20 flex items-center gap-1.5 cursor-pointer transition-all"
          >
            <span>{active.actionText}</span>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </button>

          <div className="flex items-center gap-1 border-l border-white/10 pl-2">
            <button
              onClick={onPrevStep}
              disabled={currentStep === 1}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 cursor-pointer"
              title="Previous Step"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <button
              onClick={onNextStep}
              disabled={currentStep === totalSteps}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 cursor-pointer"
              title="Next Step"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
