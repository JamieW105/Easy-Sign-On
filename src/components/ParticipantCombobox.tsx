"use client";

import { useId, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import type { PublicParticipant } from "@/types";
import { normalizeSearchText } from "@/lib/validation";

type ParticipantComboboxProps = {
  participants: PublicParticipant[];
  value: PublicParticipant | null;
  onChange: (participant: PublicParticipant | null) => void;
  disabled?: boolean;
  disabledReason?: (participant: PublicParticipant) => string | null;
};

const MAX_VISIBLE_OPTIONS = 12;

export function ParticipantCombobox({
  participants,
  value,
  onChange,
  disabled = false,
  disabledReason,
}: ParticipantComboboxProps) {
  const inputId = useId();
  const listboxId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const filteredParticipants = useMemo(() => {
    const normalizedQuery = normalizeSearchText(query);
    const list = normalizedQuery
      ? participants.filter((participant) =>
          participantSearchText(participant).includes(normalizedQuery),
        )
      : participants;

    return list.slice(0, MAX_VISIBLE_OPTIONS);
  }, [participants, query]);

  const activeOptionId =
    open && filteredParticipants[activeIndex]
      ? `${listboxId}-${filteredParticipants[activeIndex].id}`
      : undefined;

  function selectParticipant(participant: PublicParticipant) {
    if (disabledReason?.(participant)) {
      return;
    }

    onChange(participant);
    setQuery(participantLabel(participant));
    setOpen(false);
    setActiveIndex(0);
  }

  function handleInputChange(nextQuery: string) {
    setQuery(nextQuery);
    setOpen(true);
    setActiveIndex(0);

    if (value) {
      onChange(null);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) =>
        Math.min(current + 1, Math.max(filteredParticipants.length - 1, 0)),
      );
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    }

    if (
      event.key === "Enter" &&
      open &&
      filteredParticipants[activeIndex] &&
      !disabledReason?.(filteredParticipants[activeIndex])
    ) {
      event.preventDefault();
      selectParticipant(filteredParticipants[activeIndex]);
    }

    if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative z-[1000]">
      <label
        htmlFor={inputId}
        className="mb-2 block text-sm font-semibold text-slate-700"
      >
        Sailor name
      </label>
      <div className="relative">
        <input
          id={inputId}
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={open}
          aria-activedescendant={activeOptionId}
          autoComplete="off"
          disabled={disabled}
          value={query}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => handleInputChange(event.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Start typing a name"
          className="h-14 w-full rounded-xl border border-slate-200 bg-white px-4 pr-24 text-lg font-medium text-slate-950 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100"
        />
        {value ? (
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onChange(null);
              setQuery("");
              setOpen(true);
            }}
            className="absolute right-2.5 top-2.5 h-9 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600 focus:outline-none focus:ring-4 focus:ring-indigo-100"
          >
            Clear
          </button>
        ) : null}
      </div>

      {open ? (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-[1000] mt-2 max-h-80 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg shadow-slate-900/10"
        >
          {filteredParticipants.length > 0 ? (
            filteredParticipants.map((participant, index) => {
              const selected = value?.id === participant.id;
              const active = index === activeIndex;
              const reason = disabledReason?.(participant) ?? null;

              return (
                <button
                  id={`${listboxId}-${participant.id}`}
                  key={participant.id}
                  role="option"
                  aria-selected={selected}
                  aria-disabled={Boolean(reason)}
                  type="button"
                  disabled={Boolean(reason)}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectParticipant(participant)}
                  className={`mb-1 flex min-h-16 w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition last:mb-0 focus:outline-none focus:ring-4 focus:ring-indigo-100 ${
                    reason
                      ? "cursor-not-allowed bg-slate-50 text-slate-400"
                      : active || selected
                      ? "bg-indigo-50 text-indigo-950"
                      : "bg-white text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  <span>
                    <span className="block text-base font-semibold">
                      {participant.helmName}
                    </span>
                    <span className="mt-1 block text-sm font-normal text-slate-600">
                      {participantDetails(participant)}
                    </span>
                    {reason ? (
                      <span className="mt-1 block text-sm font-semibold text-slate-400">
                        {reason}
                      </span>
                    ) : null}
                  </span>
                  {participant.sailNo ? (
                    <span
                      className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] ${
                        reason
                          ? "bg-slate-100 text-slate-400"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {participant.sailNo}
                    </span>
                  ) : null}
                </button>
              );
            })
          ) : (
            <div className="px-4 py-5 text-base font-medium text-slate-600">
              No matching sailors found.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function participantLabel(participant: PublicParticipant): string {
  return participant.helmName;
}

function participantDetails(participant: PublicParticipant): string {
  return [
    participant.className,
    participant.sailNo ? `Sail ${participant.sailNo}` : null,
    participant.altSailNo ? `Alt ${participant.altSailNo}` : null,
    participant.club,
  ]
    .filter(Boolean)
    .join(" - ");
}

function participantSearchText(participant: PublicParticipant): string {
  return normalizeSearchText(
    [
      participant.helmName,
      participant.className,
      participant.sailNo,
      participant.altSailNo,
      participant.club,
    ]
      .filter(Boolean)
      .join(" "),
  );
}
