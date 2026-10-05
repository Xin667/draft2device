import { useState } from 'react';

import { AppShell } from './app/AppShell';
import { NavStepper } from './app/Navigation';
import { useAppStore } from './app/store';
import { useProjectStore } from '@/store/state';
import { toApiError } from '@/api/api';

import { StartPage } from './features/startpage';
import { ProjectHistory } from './features/project-history';
import { Step1Input } from './features/step1-input/Step1Input';
import { Step2Klaerung } from './features/step2-klaerung/Step2Klaerung';
import { Step3Hardware } from './features/step3-hardware/Step3Hardware';
import { Step4Schaltplan } from './features/step4-schaltplan/Step4Schaltplan';
import { Step5Quellcode } from './features/step5-quellcode/Step5Quellcode';
import { Step6Ergebnis } from './features/step6-ergebnis/Step6Ergebnis';

import { Button } from './components/ui/button';

export default function AppShowcase() {
  const { currentStep, maxStepReached, setCurrentStep } = useAppStore();
  const startProject = useProjectStore((s) => s.startProject);
  const setProjectId = useProjectStore((s) => s.setProjectId);
  const loadProject = useProjectStore((s) => s.loadProject);

  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  async function handleStart(name?: string) {
    setIsStarting(true);
    setStartError(null);

    try {
      setProjectId(null);
      const projectId = await startProject(name);

      setCurrentProjectId(projectId);
      sessionStorage.setItem('projectId', projectId);
      setRefreshTrigger((value) => value + 1);
      setHasStarted(true);
    } catch (error) {
      console.error(error);
      setStartError(toApiError(error).message);
    } finally {
      setIsStarting(false);
    }
  }

  if (!hasStarted) {
    return (
      <StartPage
        onStart={handleStart}
        isLoading={isStarting}
        error={startError}
      />
    );
  }

 async function handleSelectProject(projectId: string) {
  setCurrentProjectId(projectId);
  sessionStorage.setItem('projectId', projectId);
  setHasStarted(true);

  // Lädt Analyse, Hardware und Schaltplan via GET aus dem Backend:
  await loadProject(projectId);

  // Stepper auf den zuletzt erreichten Schritt setzen:
  const reachedStep = useProjectStore.getState().activeStep;
  setCurrentStep(reachedStep);
}

  function handleDeleteProject(projectId: string) {
    if (projectId !== currentProjectId) return;

    setProjectId(null);
    setCurrentProjectId(null);
    setCurrentStep(1);
    sessionStorage.removeItem('projectId');
  }

  return (
    <AppShell
      navigation={
        <NavStepper
          currentStep={currentStep}
          unlockedStep={maxStepReached}
          onStepClick={setCurrentStep}
        />
      }
      projects={
        <div className="flex h-full min-h-0 flex-col">
          <div className="mb-6 border-b border-[#D9D3C7] pb-4">
            <h1 className="font-sans text-xl font-bold tracking-tight text-[#1E2430]">
              Draft<span className="text-[#C46A2B]">2</span>Device
            </h1>
            <p className="mt-1 font-mono text-xs text-[#5A6172]">Skizze → Code</p>
          </div>
          <ProjectHistory
            currentProjectId={currentProjectId}
            onSelectProject={handleSelectProject}
            onDeleteProject={handleDeleteProject}
            onCreateProject={handleStart}
            isCreating={isStarting}
            refreshTrigger={refreshTrigger}
          />
        </div>
      }
    >
      <div className="pb-6">
        {currentStep === 1 && <Step1Input />}
        {currentStep === 2 && <Step2Klaerung />}
        {currentStep === 3 && <Step3Hardware />}
        {currentStep === 4 && <Step4Schaltplan />}
        {currentStep === 5 && <Step5Quellcode />}
        {currentStep === 6 && <Step6Ergebnis />}
      </div>

      <div className="flex justify-end">
        <Button
          variant="default"
          onClick={() => {
            if (currentStep < 6) {
              setCurrentStep(currentStep + 1);
            }
          }}
          disabled={currentStep >= 6}
        >
          {currentStep < 6
            ? `Weiter zu Schritt ${currentStep + 1}`
            : 'Fertig'}
        </Button>
      </div>
    </AppShell>
  );
}