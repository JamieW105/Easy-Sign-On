"use client";

import { useCallback, useEffect, useState } from "react";
import { ParticipantCombobox } from "@/components/ParticipantCombobox";
import { useLiveUpdates } from "@/lib/useLiveUpdates";
import type {
  ParticipantsResponse,
  PublicParticipant,
  RoSettings,
  SignAction,
  SignRecordsResponse,
  SignTimeWindowStatus,
  TodaySailor,
} from "@/types";
import { normalizeHelmName, normalizeSailNo } from "@/lib/validation";

type FlowStep =
  | "action"
  | "class"
  | "participant"
  | "custom"
  | "sail"
  | "confirm"
  | "thanks";
type ParticipantStatus = "loading" | "ready" | "error";
type StepTransition = "forward" | "back" | "reset";
type CustomParticipantKind = "visitor" | "new_sailor";
type ClassOption = {
  value: string;
  label: string;
  count: number;
};

const UNKNOWN_CLASS_VALUE = "__unknown_class__";
const SIGN_ON_LIVE_UPDATE_TYPES = ["ro-settings", "sign-records"] as const;

export function SignOnFlow() {
  const [step, setStep] = useState<FlowStep>("action");
  const [stepTransition, setStepTransition] =
    useState<StepTransition>("forward");
  const [action, setAction] = useState<SignAction | null>(null);
  const [participants, setParticipants] = useState<PublicParticipant[]>([]);
  const [participantStatus, setParticipantStatus] =
    useState<ParticipantStatus>("loading");
  const [participantError, setParticipantError] = useState("");
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [selectedParticipant, setSelectedParticipant] =
    useState<PublicParticipant | null>(null);
  const [sailNo, setSailNo] = useState("");
  const [formError, setFormError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const [customActive, setCustomActive] = useState(false);
  const [customKind, setCustomKind] =
    useState<CustomParticipantKind>("visitor");
  const [customHelmName, setCustomHelmName] = useState("");
  const [customClassName, setCustomClassName] = useState("");
  const [customSailNo, setCustomSailNo] = useState("");
  const [customClub, setCustomClub] = useState("");
  const [timeWindow, setTimeWindow] = useState<SignTimeWindowStatus | null>(
    null,
  );
  const [roSettings, setRoSettings] = useState<RoSettings | null>(null);
  const [todaysSailors, setTodaysSailors] = useState<TodaySailor[]>([]);

  const resetFlow = useCallback(() => {
    setStepTransition("reset");
    setStep("action");
    setAction(null);
    setSelectedClass(null);
    setSelectedParticipant(null);
    setSailNo("");
    setCustomActive(false);
    setCustomKind("visitor");
    setCustomHelmName("");
    setCustomClassName("");
    setCustomSailNo("");
    setCustomClub("");
    setFormError("");
    setSubmitError("");
    setSubmitting(false);
    setCountdown(10);
  }, []);

  function moveToStep(nextStep: FlowStep, transition: StepTransition) {
    setStepTransition(transition);
    setStep(nextStep);
  }

  const refreshParticipants = useCallback(async () => {
    setParticipantStatus("loading");
    setParticipantError("");

    try {
      const nextParticipants = await fetchParticipants();
      setParticipants(nextParticipants);
      setParticipantStatus("ready");
    } catch (error) {
      setParticipants([]);
      setParticipantStatus("error");
      setParticipantError(
        error instanceof Error
          ? error.message
          : "The sailor list could not be loaded.",
      );
    }
  }, []);

  const refreshSignStatus = useCallback(async () => {
    try {
      const nextStatus = await fetchSignStatus();
      setTimeWindow(nextStatus.timeWindow);
      setRoSettings(nextStatus.settings);
      setTodaysSailors(nextStatus.today);
      if (!nextStatus.timeWindow.isAcceptingSignOns) {
        setAction((currentAction) =>
          currentAction === "sign_on" ? null : currentAction,
        );
      }
    } catch {
      setTimeWindow(null);
      setRoSettings(null);
      setTodaysSailors([]);
    }
  }, []);

  const refreshLiveData = useCallback(
    (type: (typeof SIGN_ON_LIVE_UPDATE_TYPES)[number]) => {
      void refreshSignStatus();

      if (type === "sign-records") {
        void refreshParticipants();
      }
    },
    [refreshParticipants, refreshSignStatus],
  );

  useLiveUpdates(SIGN_ON_LIVE_UPDATE_TYPES, refreshLiveData);

  useEffect(() => {
    let cancelled = false;

    void fetchParticipants()
      .then((nextParticipants) => {
        if (cancelled) {
          return;
        }

        setParticipants(nextParticipants);
        setParticipantStatus("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setParticipants([]);
        setParticipantStatus("error");
        setParticipantError(
          error instanceof Error
            ? error.message
            : "The sailor list could not be loaded.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void fetchSignStatus()
      .then((nextStatus) => {
        if (!cancelled) {
          setTimeWindow(nextStatus.timeWindow);
          setRoSettings(nextStatus.settings);
          setTodaysSailors(nextStatus.today);
          if (!nextStatus.timeWindow.isAcceptingSignOns) {
            setAction((currentAction) =>
              currentAction === "sign_on" ? null : currentAction,
            );
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTimeWindow(null);
          setRoSettings(null);
          setTodaysSailors([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (step !== "thanks") {
      return;
    }

    const interval = window.setInterval(() => {
      setCountdown((current) => Math.max(current - 1, 0));
    }, 1000);
    const timeout = window.setTimeout(resetFlow, 10000);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [resetFlow, step]);

  function chooseAction(nextAction: SignAction) {
    if (nextAction === "sign_on" && isSignOnClosed()) {
      return;
    }

    setAction(nextAction);
    setSelectedClass(null);
    setSelectedParticipant(null);
    setSailNo("");
    setCustomActive(false);
    setCustomHelmName("");
    setCustomClassName("");
    setCustomSailNo("");
    setCustomClub("");
    setFormError("");
    setSubmitError("");
  }

  function continueFromAction() {
    if (!action) {
      setFormError("Choose Sign On or Sign Off.");
      return;
    }

    if (action === "sign_on" && signOnRequiresOverride()) {
      setFormError("Sign-on is closed. Ask the Race Officer to use the override.");
      return;
    }

    setFormError("");
    moveToStep("class", "forward");
  }

  function chooseClass(nextClass: string) {
    setSelectedClass(nextClass);
    setSelectedParticipant(null);
    setSailNo("");
    setCustomActive(false);
    setCustomHelmName("");
    setCustomClassName(selectedClassLabel(nextClass, classOptions));
    setCustomSailNo("");
    setCustomClub("");
    setFormError("");
    setSubmitError("");
  }

  function continueFromClass() {
    if (participantStatus !== "ready") {
      setFormError("The sailor list is not ready yet.");
      return;
    }

    if (!selectedClass) {
      setFormError("Choose your class first.");
      return;
    }

    setFormError("");
    moveToStep("participant", "forward");
  }

  function chooseParticipant(participant: PublicParticipant | null) {
    setSelectedParticipant(participant);
    setCustomActive(false);
    setFormError("");
    setSubmitError("");

    if (participant?.sailNo) {
      setSailNo(normalizeSailNo(participant.sailNo, participant.className));
    } else {
      setSailNo("");
    }
  }

  function continueFromParticipant() {
    if (participantStatus !== "ready") {
      setFormError("The sailor list is not ready yet.");
      return;
    }

    if (!selectedParticipant) {
      setFormError("Choose your name from the list.");
      return;
    }

    const disabledReason = participantSignOffDisabledReason(selectedParticipant);
    if (disabledReason) {
      setFormError(disabledReason);
      return;
    }

    setFormError("");
    moveToStep(action === "sign_on" ? "sail" : "confirm", "forward");
  }

  function startCustomParticipant() {
    setCustomActive(true);
    setSelectedParticipant(null);
    setCustomKind("visitor");
    setCustomClassName(selectedClassLabel(selectedClass, classOptions));
    setCustomSailNo("");
    setFormError("");
    setSubmitError("");
    moveToStep("custom", "forward");
  }

  function continueFromCustomParticipant() {
    const nextHelmName = normalizeHelmName(customHelmName);
    const nextClassName = customClassName.trim();
    const nextSailNo = normalizeSailNo(customSailNo, nextClassName);

    if (!nextHelmName) {
      setFormError("Enter the sailor name.");
      return;
    }

    if (!nextClassName) {
      setFormError("Enter the sailor class.");
      return;
    }

    if (!nextSailNo) {
      setFormError("Enter the sail number.");
      return;
    }

    setCustomHelmName(nextHelmName);
    setCustomClassName(nextClassName);
    setCustomSailNo(nextSailNo);
    setSailNo(nextSailNo);
    setFormError("");
    moveToStep("confirm", "forward");
  }

  function continueFromSailNumber() {
    const nextSailNo = normalizeSailNo(sailNo, selectedParticipant?.className);
    if (!nextSailNo) {
      setFormError("Enter the sail number you are using today.");
      return;
    }

    setSailNo(nextSailNo);
    setFormError("");
    moveToStep("confirm", "forward");
  }

  function useAlternativeSailNumber() {
    const mainSailNo = selectedMainSailNo();
    const altSailNo = selectedAltSailNo();

    if (!altSailNo || altSailNo === mainSailNo) {
      setFormError("No different alternate sail number is listed for this sailor.");
      return;
    }

    setSailNo(altSailNo);
    setFormError("");
    moveToStep("confirm", "forward");
  }

  function selectedMainSailNo() {
    return normalizeSailNo(
      selectedParticipant?.sailNo ?? "",
      selectedParticipant?.className,
    );
  }

  function selectedAltSailNo() {
    return normalizeSailNo(
      selectedParticipant?.altSailNo ?? "",
      selectedParticipant?.className,
    );
  }

  async function submitSignRecord() {
    if (!action || (!selectedParticipant && !customActive)) {
      setSubmitError("Choose your action and sailor name before submitting.");
      return;
    }

    if (action === "sign_on" && signOnRequiresOverride()) {
      setSubmitError("Sign-on is closed. Ask the Race Officer to use the override.");
      return;
    }

    setSubmitting(true);
    setSubmitError("");

    const body =
      action === "sign_on" && customActive
        ? {
            action,
            participant: {
              helmName: normalizeHelmName(customHelmName),
              className: customClassName.trim(),
              sailNo: normalizeSailNo(customSailNo, customClassName),
              club: customClub.trim() || undefined,
              isVisitor: customKind === "visitor",
              isNewSailor: customKind === "new_sailor",
            },
            sailNo: normalizeSailNo(customSailNo, customClassName),
          }
        : action === "sign_on" && selectedParticipant
        ? {
            action,
            participantId: selectedParticipant.id,
            sailNo: normalizeSailNo(sailNo, selectedParticipant.className),
          }
        : {
            action,
            participantId: selectedParticipant?.id,
            retired: selectedParticipantWasRetired(),
          };

    try {
      const response = await fetch("/api/sign", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => null)) as
        | { ok: true; recordId: string }
        | { ok: false; error?: string }
        | null;

      if (!response.ok || !data?.ok) {
        throw new Error(
          data && "error" in data && data.error
            ? data.error
            : "The entry could not be saved.",
        );
      }

      void refreshSignStatus();
      void refreshParticipants();
      setCountdown(10);
      moveToStep("thanks", "forward");
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "The entry could not be saved.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function goBack() {
    setFormError("");
    setSubmitError("");

    if (step === "participant") {
      moveToStep("class", "back");
      return;
    }

    if (step === "class") {
      moveToStep("action", "back");
      return;
    }

    if (step === "sail") {
      moveToStep("participant", "back");
      return;
    }

    if (step === "custom") {
      moveToStep("participant", "back");
      return;
    }

    if (step === "confirm") {
      moveToStep(
        action === "sign_on"
          ? customActive
            ? "custom"
            : "sail"
          : "participant",
        "back",
      );
    }
  }

  function continueFromCurrentStep() {
    if (step === "action") {
      continueFromAction();
      return;
    }

    if (step === "class") {
      continueFromClass();
      return;
    }

    if (step === "participant") {
      continueFromParticipant();
      return;
    }

    if (step === "custom") {
      continueFromCustomParticipant();
      return;
    }

    if (step === "sail") {
      continueFromSailNumber();
      return;
    }

    if (step === "confirm") {
      void submitSignRecord();
    }
  }

  function isNextDisabled() {
    if (step === "action") {
      return !action || (action === "sign_on" && signOnRequiresOverride());
    }

    if (step === "participant") {
      return (
        participantStatus !== "ready" ||
        !selectedParticipant ||
        Boolean(participantSignOffDisabledReason(selectedParticipant))
      );
    }

    if (step === "class") {
      return participantStatus !== "ready" || !selectedClass;
    }

    if (step === "sail") {
      return !normalizeSailNo(sailNo, selectedParticipant?.className);
    }

    if (step === "custom") {
      return (
        !normalizeHelmName(customHelmName) ||
        !customClassName.trim() ||
        !normalizeSailNo(customSailNo, customClassName)
      );
    }

    if (step === "confirm") {
      return submitting;
    }

    return true;
  }

  function signOnRequiresOverride() {
    return Boolean(
      timeWindow &&
        !timeWindow.isAcceptingSignOns &&
        action === "sign_on",
    );
  }

  function isSignOnClosed() {
    return timeWindow?.isAcceptingSignOns === false;
  }

  function currentClassName() {
    return customActive
      ? customClassName.trim()
      : selectedParticipant?.className ?? "";
  }

  function selectedParticipantWasRetired() {
    if (action !== "sign_off" || !selectedParticipant) {
      return false;
    }

    return (
      todaysSailors.find(
        (sailor) => sailor.participantId === selectedParticipant.id,
      )?.status === "retired"
    );
  }

  function participantSignOffDisabledReason(participant: PublicParticipant) {
    if (action !== "sign_off") {
      return null;
    }

    const sailor = todaysSailors.find(
      (entry) => entry.participantId === participant.id,
    );

    if (!sailor) {
      return "Not signed on today";
    }

    if (sailor.status === "signed_off") {
      return "Already signed off";
    }

    return null;
  }

  const nextDisabled = isNextDisabled();
  const stepAnimationClass = `animate-step-${stepTransition}`;
  const classOptions = getClassOptions(participants);
  const participantsInSelectedClass = selectedClass
    ? participants.filter(
        (participant) => participantClassValue(participant) === selectedClass,
      )
    : [];
  const regattaMode = roSettings?.regattaMode === true;
  const clubName = roSettings?.clubName || "Easy Sign On";
  const customSignOnAllowed = roSettings?.regattaMode === false;
  const signOnClosed = isSignOnClosed();

  return (
    <main className="relative min-h-dvh bg-[#f8fafc] text-slate-950">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-[-12%] bottom-[-12%] h-[46dvh] bg-[linear-gradient(115deg,rgba(252,213,248,0.72),rgba(167,179,255,0.58)_48%,rgba(202,235,255,0.74))] blur-3xl"
      />
      <WizardTopBar
        action={action}
        customActive={customActive}
        nextDisabled={nextDisabled}
        nextLabel={
          step === "confirm" ? actionLabel(action) : step === "sail" ? "Continue" : "Next"
        }
        onNext={continueFromCurrentStep}
        onReset={resetFlow}
        step={step}
      />

      <div className="relative z-30 flex min-h-dvh items-center justify-center px-4 py-24 sm:px-8">
        <section
          key={step}
          className={`${stepAnimationClass} relative z-30 w-full max-w-xl rounded-[24px] border border-white/80 bg-white/95 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.16)] backdrop-blur transition-[box-shadow,transform] duration-300 ease-out sm:p-8`}
        >
          {renderStep(nextDisabled)}
        </section>
      </div>
    </main>
  );

  function renderStep(nextDisabled: boolean) {
    if (step === "action") {
      return (
        <div className="step-content">
          <StepHeader
            body="Choose the race-day action you need."
            eyebrow={
              regattaMode ? `${clubName} Regattas` : `${clubName} Club Racing`
            }
            title="What would you like to do?"
          />
          <div className="mt-7 space-y-3">
            {!signOnClosed ? (
              <ChoiceButton
                description="Before racing"
                onClick={() => chooseAction("sign_on")}
                selected={action === "sign_on"}
                title="Sign On"
              />
            ) : null}
            <ChoiceButton
              description="After racing"
              onClick={() => chooseAction("sign_off")}
              selected={action === "sign_off"}
              title="Sign Off"
            />
          </div>
          {signOnClosed && timeWindow ? (
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
              <p className="text-sm font-semibold">{timeWindow.label}</p>
              <p className="mt-1 text-sm font-medium">{timeWindow.message}</p>
            </div>
          ) : null}
          <TimeWindowNotice
            action={action}
            timeWindow={timeWindow}
          />
          <StepError message={formError} />
          <WizardFooter
            action={action}
            customActive={customActive}
            nextDisabled={nextDisabled}
            nextLabel="Next"
            onNext={continueFromCurrentStep}
            step={step}
          />
        </div>
      );
    }

    if (step === "participant") {
      return (
        <div className="step-content">
          <StepHeader
            body={`Search for your name in ${selectedClassLabel(selectedClass, classOptions)}.`}
            eyebrow={actionLabel(action)}
            title="Select your name"
          />

          {participantStatus === "loading" ? (
            <StatusPanel title="Loading sailor list" />
          ) : null}

          {participantStatus === "error" ? (
            <StatusPanel
              title="Sailor list unavailable"
              message={participantError}
              actionLabel="Try again"
              onAction={() => void refreshParticipants()}
            />
          ) : null}

          {participantStatus === "ready" && participants.length === 0 ? (
            <StatusPanel
              title="No sailors found"
              message="seasonal.blw loaded, but no valid sailors were found."
              actionLabel="Reload"
              onAction={() => void refreshParticipants()}
            />
          ) : null}

          {participantStatus === "ready" && participants.length > 0 ? (
            <div className="relative z-20 mt-7 space-y-4">
              <ParticipantCombobox
                participants={participantsInSelectedClass}
                value={selectedParticipant}
                onChange={chooseParticipant}
                disabledReason={participantSignOffDisabledReason}
              />
              {action === "sign_on" && !regattaMode ? (
                customSignOnAllowed ? (
                  <button
                    type="button"
                    onClick={startCustomParticipant}
                    className="min-h-20 w-full rounded-xl border border-dashed border-indigo-300 bg-indigo-50/50 px-5 py-4 text-left text-indigo-800 transition hover:border-indigo-400 hover:bg-indigo-50 focus:outline-none focus:ring-4 focus:ring-indigo-100"
                  >
                    <span className="block text-base font-semibold">
                      New sailor / visitor
                    </span>
                    <span className="mt-1 block text-sm font-medium text-indigo-700">
                      Register someone not in the sailor list.
                    </span>
                  </button>
                ) : (
                  <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
                    Checking race-day mode before allowing new sailor entries.
                  </p>
                )
              ) : null}
            </div>
          ) : null}

          <StepError message={formError} />
          <WizardFooter
            action={action}
            customActive={customActive}
            nextDisabled={nextDisabled}
            nextLabel="Continue"
            onBack={goBack}
            onNext={continueFromCurrentStep}
            step={step}
          />
        </div>
      );
    }

    if (step === "class") {
      return (
        <div className="step-content">
          <StepHeader
            body="Choose the class you are racing in before selecting your name."
            eyebrow={actionLabel(action)}
            title="What class are you in?"
          />

          {participantStatus === "loading" ? (
            <StatusPanel title="Loading class list" />
          ) : null}

          {participantStatus === "error" ? (
            <StatusPanel
              title="Class list unavailable"
              message={participantError}
              actionLabel="Try again"
              onAction={() => void refreshParticipants()}
            />
          ) : null}

          {participantStatus === "ready" && classOptions.length === 0 ? (
            <StatusPanel
              title="No classes found"
              message="seasonal.blw loaded, but no valid classes were found."
              actionLabel="Reload"
              onAction={() => void refreshParticipants()}
            />
          ) : null}

          {participantStatus === "ready" && classOptions.length > 0 ? (
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {classOptions.map((classOption) => (
                <ChoiceButton
                  key={classOption.value}
                  description={`${classOption.count} ${
                    classOption.count === 1 ? "sailor" : "sailors"
                  }`}
                  onClick={() => chooseClass(classOption.value)}
                  selected={selectedClass === classOption.value}
                  title={classOption.label}
                />
              ))}
            </div>
          ) : null}

          <StepError message={formError} />
          <WizardFooter
            action={action}
            customActive={customActive}
            nextDisabled={nextDisabled}
            nextLabel="Continue"
            onBack={goBack}
            onNext={continueFromCurrentStep}
            step={step}
          />
        </div>
      );
    }

    if (step === "custom") {
      return (
        <div className="step-content">
          <StepHeader
            body="Add the required race-day details for someone not already listed."
            eyebrow="Sign On"
            title="New sailor / visitor"
          />

          <div className="mt-7 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setCustomKind("visitor")}
              className={`h-12 rounded-lg text-sm font-semibold transition focus:outline-none focus:ring-4 focus:ring-indigo-100 ${
                customKind === "visitor"
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-950"
              }`}
            >
              Visitor
            </button>
            <button
              type="button"
              onClick={() => setCustomKind("new_sailor")}
              className={`h-12 rounded-lg text-sm font-semibold transition focus:outline-none focus:ring-4 focus:ring-indigo-100 ${
                customKind === "new_sailor"
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-950"
              }`}
            >
              New club sailor
            </button>
          </div>

          <div className="mt-5 grid gap-4">
            <label className="block">
              <span className="text-sm font-semibold text-slate-600">
                Sailor name
              </span>
              <input
                type="text"
                value={customHelmName}
                onChange={(event) => {
                  setCustomHelmName(event.target.value);
                  setFormError("");
                }}
                className="mt-2 h-14 w-full rounded-xl border border-slate-200 bg-white px-4 text-lg font-semibold text-slate-950 transition focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100"
                autoComplete="off"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-semibold text-slate-600">
                  Class
                </span>
                <input
                  type="text"
                  value={customClassName}
                  onChange={(event) => {
                    setCustomClassName(event.target.value);
                    setCustomSailNo(
                      normalizeSailNo(customSailNo, event.target.value),
                    );
                    setFormError("");
                  }}
                  className="mt-2 h-14 w-full rounded-xl border border-slate-200 bg-white px-4 text-lg font-semibold text-slate-950 transition focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100"
                  autoComplete="off"
                />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-600">
                  Sail number
                </span>
                <input
                  type="text"
                  value={customSailNo}
                  onChange={(event) => {
                    setCustomSailNo(
                      normalizeSailNo(event.target.value, customClassName),
                    );
                    setFormError("");
                  }}
                  className="mt-2 h-14 w-full rounded-xl border border-slate-200 bg-white px-4 text-lg font-semibold uppercase text-slate-950 transition focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100"
                  autoComplete="off"
                  inputMode="text"
                />
              </label>
            </div>

            <label className="block">
              <span className="text-sm font-semibold text-slate-600">
                Club
              </span>
              <input
                type="text"
                value={customClub}
                onChange={(event) => {
                  setCustomClub(event.target.value);
                  setFormError("");
                }}
                className="mt-2 h-14 w-full rounded-xl border border-slate-200 bg-white px-4 text-lg font-semibold text-slate-950 transition focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100"
                autoComplete="off"
              />
            </label>
          </div>

          <StepError message={formError} />
          <WizardFooter
            action={action}
            customActive={customActive}
            nextDisabled={nextDisabled}
            nextLabel="Continue"
            onBack={goBack}
            onNext={continueFromCurrentStep}
            step={step}
          />
        </div>
      );
    }

    if (step === "sail") {
      const mainSailNo = selectedMainSailNo();
      const altSailNo = selectedAltSailNo();
      const canUseAlt = Boolean(altSailNo && altSailNo !== mainSailNo);

      return (
        <div className="step-content">
          <StepHeader
            eyebrow="Sign On"
            title="Sail number"
            body="Check the registered sail number or enter the sail number you are using today."
          />
          <div className="mt-7 rounded-xl border border-slate-200 bg-slate-50/70 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
              {selectedParticipant?.helmName}
            </p>
            <div className="mt-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-500">
                  Registered sail number
                </p>
                <p className="mt-1 text-4xl font-semibold tracking-tight text-slate-950">
                  {mainSailNo || "Missing"}
                </p>
              </div>
              {altSailNo ? (
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-500">
                    Alt sail number
                  </p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-700">
                    {altSailNo}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
          <label className="mt-5 block">
            <span className="text-sm font-semibold text-slate-600">
              Sail number for today
            </span>
            <input
              type="text"
              value={sailNo}
              onChange={(event) => {
                setSailNo(
                  normalizeSailNo(event.target.value, selectedParticipant?.className),
                );
                setFormError("");
              }}
              className="mt-2 h-14 w-full rounded-xl border border-slate-200 bg-white px-4 text-xl font-semibold tracking-tight text-slate-950 transition focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100"
              autoComplete="off"
              inputMode="text"
            />
          </label>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={!mainSailNo}
              onClick={() => {
                setSailNo(mainSailNo);
                setFormError("");
              }}
              className="min-h-24 rounded-xl border border-indigo-500 bg-indigo-50/70 px-5 py-4 text-left text-indigo-700 shadow-[0_0_0_1px_rgba(99,102,241,0.45)] transition focus:outline-none focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
            >
              <span className="block text-base font-semibold">
                Use registered sail number
              </span>
              <span className="mt-1 block text-sm">
                {mainSailNo || "No registered sail number listed"}
              </span>
            </button>
            <button
              type="button"
              disabled={!canUseAlt}
              onClick={useAlternativeSailNumber}
              className="min-h-24 rounded-xl border border-slate-200 bg-white px-5 py-4 text-left text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            >
              <span className="block text-base font-semibold">
                Use alternate sail number
              </span>
              <span className="mt-1 block text-sm">
                {canUseAlt
                  ? `Use alt sail number ${altSailNo}`
                  : "No different alt sail number listed"}
              </span>
            </button>
          </div>
          <StepError message={formError} />
          <WizardFooter
            action={action}
            customActive={customActive}
            nextDisabled={nextDisabled}
            nextLabel="Continue"
            onBack={goBack}
            onNext={continueFromCurrentStep}
            step={step}
          />
        </div>
      );
    }

    if (step === "confirm") {
      return (
        <div className="step-content">
          <StepHeader
            eyebrow={actionLabel(action)}
            title="Check these details"
            body="Submit once everything looks right."
          />
          <dl className="mt-7 space-y-3">
            <ConfirmRow label="Action" value={actionLabel(action)} />
            <ConfirmRow
              label="Sailor"
              value={
                customActive
                  ? normalizeHelmName(customHelmName)
                  : selectedParticipant?.helmName ?? ""
              }
            />
            {currentClassName() ? (
              <ConfirmRow label="Class" value={currentClassName()} />
            ) : null}
            {action === "sign_on" ? (
              <ConfirmRow
                label="Sail number"
                value={normalizeSailNo(sailNo, currentClassName())}
              />
            ) : null}
            {customActive ? (
              <ConfirmRow
                label="Type"
                value={customKind === "visitor" ? "Visitor" : "New club sailor"}
              />
            ) : null}
            {customClub.trim() ? (
              <ConfirmRow label="Club" value={customClub.trim()} />
            ) : null}
            {action === "sign_off" ? (
              <ConfirmRow
                label="Retired"
                value={selectedParticipantWasRetired() ? "Yes" : "No"}
              />
            ) : null}
          </dl>
          <StepError message={submitError} />
          <WizardFooter
            action={action}
            customActive={customActive}
            nextDisabled={nextDisabled}
            nextLabel={submitting ? "Saving" : actionLabel(action)}
            onBack={goBack}
            onNext={continueFromCurrentStep}
            step={step}
          />
        </div>
      );
    }

    return (
      <div className="step-content py-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">
          Complete
        </p>
        <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
          Thank you for{" "}
          {action === "sign_on"
            ? "signing on."
            : selectedParticipantWasRetired()
            ? "signing off. Retired status recorded."
            : "signing off."}
        </h2>
        <p className="mt-5 text-lg font-medium text-slate-600">
          Returning to start in {countdown} seconds...
        </p>
        <button
          type="button"
          onClick={resetFlow}
          className="mt-8 h-12 rounded-xl bg-indigo-600 px-6 text-base font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100"
        >
          Start now
        </button>
      </div>
    );
  }
}

function StepHeader({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body?: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-slate-950">
        {title}
      </h2>
      {body ? <p className="mt-3 text-base leading-7 text-slate-600">{body}</p> : null}
    </div>
  );
}

function ChoiceButton({
  description,
  onClick,
  selected,
  title,
}: {
  description: string;
  onClick: () => void;
  selected: boolean;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border px-5 py-3.5 text-left transition-all duration-200 ease-out focus:outline-none focus:ring-4 focus:ring-indigo-100 ${
        selected
          ? "border-indigo-500 bg-indigo-50/70 text-indigo-700 shadow-[0_0_0_1px_rgba(99,102,241,0.45)]"
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      <span className="block text-base font-semibold">{title}</span>
      <span
        className={`mt-1 block text-sm ${
          selected ? "text-indigo-600" : "text-slate-500"
        }`}
      >
        {description}
      </span>
    </button>
  );
}

function WizardFooter({
  action,
  customActive,
  nextDisabled,
  nextLabel,
  onNext,
  onBack,
  step,
}: {
  action: SignAction | null;
  customActive: boolean;
  nextDisabled: boolean;
  nextLabel: string;
  onNext: () => void;
  onBack?: () => void;
  step: FlowStep;
}) {
  return (
    <div className="relative z-0 mt-8 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
      <ProgressDots action={action} customActive={customActive} step={step} />
      <div className="flex justify-end gap-2">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="h-12 rounded-xl px-4 text-base font-semibold text-slate-500 transition hover:text-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200"
          >
            Back
          </button>
        ) : null}
        <button
          type="button"
          disabled={nextDisabled}
          onClick={onNext}
          className="h-12 rounded-xl bg-indigo-600 px-6 text-base font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-white disabled:shadow-none"
        >
          {nextLabel} <span aria-hidden="true">-&gt;</span>
        </button>
      </div>
    </div>
  );
}

function WizardTopBar({
  action,
  customActive,
  nextDisabled,
  nextLabel,
  onNext,
  onReset,
  step,
}: {
  action: SignAction | null;
  customActive: boolean;
  nextDisabled: boolean;
  nextLabel: string;
  onNext: () => void;
  onReset: () => void;
  step: FlowStep;
}) {
  const labels = flowStepLabels(action, customActive);
  const activeIndex = flowStepIndex(step, action, customActive);
  const currentLabel =
    step === "thanks" ? "Complete" : labels[Math.min(activeIndex, labels.length - 1)];

  return (
    <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 px-4 py-5 sm:px-8 lg:px-12">
      <button
        type="button"
        aria-label="Reset sign on"
        onClick={onReset}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-100 text-2xl font-semibold leading-none text-slate-500 transition hover:bg-white hover:text-slate-700 focus:outline-none focus:ring-4 focus:ring-slate-200"
      >
        <span aria-hidden="true">{"\u00d7"}</span>
      </button>

      <ol className="hidden min-w-0 items-center gap-4 md:flex">
        {labels.map((label, index) => {
          const completed = step === "thanks" || index < activeIndex;
          const current = step !== "thanks" && index === activeIndex;

          return (
            <li key={label} className="flex items-center gap-4">
              <div className="flex items-center gap-2.5">
                <StepMark completed={completed} current={current} index={index} />
                <span
                  className={`text-base font-semibold ${
                    current || completed ? "text-slate-950" : "text-slate-500"
                  }`}
                >
                  {label}
                </span>
              </div>
              {index < labels.length - 1 ? (
                <span className="text-xl font-semibold text-slate-400" aria-hidden="true">
                  &gt;
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className="flex min-w-0 items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-2 md:hidden">
        <StepMark
          completed={step === "thanks"}
          current={step !== "thanks"}
          index={Math.min(activeIndex, labels.length - 1)}
        />
        <span className="truncate text-sm font-semibold text-slate-700">
          {currentLabel}
        </span>
      </div>

      <button
        type="button"
        disabled={nextDisabled}
        onClick={onNext}
        className="h-12 shrink-0 rounded-xl bg-indigo-600 px-5 text-base font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-white disabled:shadow-none"
      >
        {nextLabel} <span aria-hidden="true">-&gt;</span>
      </button>
    </header>
  );
}

function StepMark({
  completed,
  current,
  index,
}: {
  completed: boolean;
  current: boolean;
  index: number;
}) {
  if (completed) {
    return (
      <span className="grid h-6 w-6 place-items-center rounded-full bg-indigo-600 text-sm font-semibold text-white transition-all duration-300 ease-out">
        {"\u2713"}
      </span>
    );
  }

  if (current) {
    return (
      <span
        className="h-6 w-6 rounded-full border-2 border-indigo-600 bg-white transition-all duration-300 ease-out"
        aria-label={`Step ${index + 1}`}
      />
    );
  }

  return (
    <span
      className="h-6 w-6 rounded-full border border-slate-300 bg-white transition-all duration-300 ease-out"
      aria-label={`Step ${index + 1}`}
    />
  );
}

function ProgressDots({
  action,
  customActive,
  step,
}: {
  action: SignAction | null;
  customActive: boolean;
  step: FlowStep;
}) {
  const labels = flowStepLabels(action, customActive);
  const activeIndex = flowStepIndex(step, action, customActive);

  return (
    <div className="flex items-center gap-3" aria-label="Progress">
      {labels.map((label, index) => (
        <span
          key={label}
          className={`h-2.5 rounded-full transition-all duration-300 ease-out ${
            index === activeIndex ? "w-5 bg-indigo-600" : "w-2.5 bg-slate-300"
          }`}
        />
      ))}
    </div>
  );
}

function StatusPanel({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="mt-7 rounded-xl border border-slate-200 bg-slate-50/70 p-5">
      <p className="text-lg font-semibold text-slate-950">{title}</p>
      {message ? (
        <p className="mt-2 text-base font-medium text-slate-700">{message}</p>
      ) : null}
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 h-11 rounded-xl bg-indigo-600 px-5 text-base font-semibold text-white transition hover:bg-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function TimeWindowNotice({
  action,
  timeWindow,
}: {
  action: SignAction | null;
  timeWindow: SignTimeWindowStatus | null;
}) {
  if (action !== "sign_on" || !timeWindow) {
    return null;
  }

  const blocked = !timeWindow.isAcceptingSignOns;

  return (
    <div
      className={`mt-5 rounded-xl border px-4 py-3 ${
        blocked
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : "border-emerald-200 bg-emerald-50 text-emerald-900"
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold">{timeWindow.label}</p>
          <p className="mt-1 text-sm font-medium">{timeWindow.message}</p>
        </div>
      </div>
    </div>
  );
}

function StepError({ message }: { message: string }) {
  if (!message) {
    return null;
  }

  return (
    <p
      role="alert"
      className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-base font-semibold text-red-800"
    >
      {message}
    </p>
  );
}

function ConfirmRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-3.5">
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 text-base font-semibold text-slate-700">{value}</dd>
    </div>
  );
}

function actionLabel(action: SignAction | null): string {
  if (action === "sign_on") {
    return "Sign On";
  }

  if (action === "sign_off") {
    return "Sign Off";
  }

  return "Start";
}

function flowStepLabels(
  action: SignAction | null,
  customActive = false,
): string[] {
  if (action === "sign_off") {
    return ["Action", "Class", "Sailor", "Confirm"];
  }

  if (customActive) {
    return ["Action", "Class", "Sailor", "Details", "Confirm"];
  }

  return ["Action", "Class", "Sailor", "Sail Number", "Confirm"];
}

function flowStepIndex(
  step: FlowStep,
  action: SignAction | null,
  customActive = false,
): number {
  const labels = flowStepLabels(action, customActive);

  if (step === "thanks") {
    return labels.length;
  }

  if (step === "action") {
    return 0;
  }

  if (step === "class") {
    return 1;
  }

  if (step === "participant") {
    return 2;
  }

  if (step === "custom") {
    return 3;
  }

  if (step === "sail") {
    return 3;
  }

  return action === "sign_off" ? 3 : customActive ? 4 : 4;
}

function getClassOptions(participants: PublicParticipant[]): ClassOption[] {
  const counts = new Map<string, ClassOption>();

  for (const participant of participants) {
    const value = participantClassValue(participant);
    const existing = counts.get(value);

    if (existing) {
      existing.count += 1;
    } else {
      counts.set(value, {
        value,
        label: participant.className?.trim() || "Unlisted class",
        count: 1,
      });
    }
  }

  return Array.from(counts.values()).sort((left, right) =>
    left.label.localeCompare(right.label, "en-NZ", { sensitivity: "base" }),
  );
}

function participantClassValue(participant: PublicParticipant): string {
  return participant.className?.trim() || UNKNOWN_CLASS_VALUE;
}

function selectedClassLabel(
  selectedClass: string | null,
  classOptions: ClassOption[],
): string {
  return (
    classOptions.find((classOption) => classOption.value === selectedClass)?.label ||
    "your selected class"
  );
}

async function fetchParticipants(): Promise<PublicParticipant[]> {
  const response = await fetch("/api/participants", {
    cache: "no-store",
  });
  const data = (await response.json()) as ParticipantsResponse & {
    error?: string;
    searchedPaths?: string[];
  };

  if (!response.ok) {
    const searchedPaths = data.searchedPaths?.length
      ? ` Checked: ${data.searchedPaths.join(", ")}.`
      : "";

    throw new Error(
      `${data.error ||
        "The sailor list is not available. Ask the race team to check seasonal.blw."}${searchedPaths}`,
    );
  }

  return data.participants;
}

async function fetchSignStatus(): Promise<{
  timeWindow: SignTimeWindowStatus;
  settings: RoSettings;
  today: TodaySailor[];
}> {
  const response = await fetch("/api/sign", {
    cache: "no-store",
  });
  const data = (await response.json()) as SignRecordsResponse & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(data.error || "Sign-on status could not be loaded.");
  }

  return {
    timeWindow: data.timeWindow,
    settings: data.settings,
    today: data.today,
  };
}
