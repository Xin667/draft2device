import React from 'react';

interface Step {
  number: number;
  label: string;
}

interface StepperProps {
  currentStep: number;
  unlockedStep: number;
  onStepClick: (stepNumber: number) => void;
}

export const NavStepper: React.FC<StepperProps> = ({
  currentStep,
  unlockedStep,
  onStepClick,
}) => {
  const steps: Step[] = [
    { number: 1, label: 'Input' },
    { number: 2, label: 'Klärung' },
    { number: 3, label: 'Hardware' },
    { number: 4, label: 'Schaltplan' },
    { number: 5, label: 'Quellcode' },
    { number: 6, label: 'Ergebnis' },
  ];

  return (
    <div className="mb-6 w-full min-w-0">
      <nav
        aria-label="Projektfortschritt"
        className="grid w-full min-w-0 grid-cols-6 gap-1"
      >
        {steps.map((step) => {
          const isActive = step.number === currentStep;
          const isDone = step.number < currentStep && step.number <= unlockedStep;
          const isLocked = step.number > unlockedStep;

          return (
            <div key={step.number} className="min-w-0">
              <button
                type="button"
                disabled={isLocked}
                onClick={() => onStepClick(step.number)}
                className={`flex w-full min-w-0 flex-col items-center justify-center gap-1 rounded-lg border-l-3 px-1 py-2 text-center text-[10px] leading-tight font-sans
                  ${
                    isActive
                      ? 'bg-orange-50/60 border-[#C46A2B] text-[#1E2430] font-semibold'
                      : isDone
                        ? 'border-transparent text-[#1E2430]/80 hover:bg-gray-100'
                        : 'border-transparent text-[#5A6172]/50 cursor-not-allowed opacity-50'
                  }`}
              >
                <div
                  className={`w-4 h-4 rounded-full flex items-center justify-center font-mono text-xs border
                    ${
                      isActive
                        ? 'border-[#C46A2B] text-[#C46A2B] bg-white'
                        : isDone
                          ? 'bg-[#1E2430] border-[#1E2430] text-[#FAF8F4]'
                          : 'border-gray-300 bg-white'
                    }`}
                >
                  {isDone ? '✓' : step.number}
                </div>
                <span className="min-w-0 break-words">{step.label}</span>
              </button>
            </div>
          );
        })}
      </nav>
    </div>
  );
};
