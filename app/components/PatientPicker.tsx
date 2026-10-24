"use client";

import { useEffect, useState } from "react";
import type { PatientCard } from "@/lib/api/contract";
import { fetchJSON } from "./api";

const PROGRAM: Record<string, string> = {
  hair_loss: "Hair loss",
  sexual_health: "Sexual health",
  skincare: "Skincare",
  mental_health: "Mental health",
  weight_management: "Weight management",
};

export function PatientPicker({ onStart, activePatientId }: { onStart: (p: PatientCard) => void; activePatientId: string | null }) {
  const [patients, setPatients] = useState<PatientCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetchJSON<PatientCard[]>("/api/patients")
      .then(setPatients)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">Demo patients</h2>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">Fictional people. Each one is set up for a different scenario.</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {error && <p className="p-2 text-sm text-urgent">Couldn&rsquo;t load patients: {error}</p>}
        {!patients && !error && <p className="p-2 text-sm text-muted">Loading…</p>}
        <ul className="space-y-1">
          {patients?.map((p) => {
            const isOpen = open === p.id;
            const isActive = activePatientId === p.id;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : p.id)}
                  aria-expanded={isOpen}
                  className={`w-full rounded-md px-2.5 py-2 text-left transition-colors ${
                    isOpen ? "bg-canvas" : "hover:bg-canvas"
                  } ${isActive ? "ring-1 ring-accent" : ""}`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{p.name}</span>
                    {isActive && <span className="text-[11px] text-accent">In chat</span>}
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-muted">{p.demoScenario}</span>
                </button>
                {isOpen && (
                  <div className="mx-2.5 mb-2 mt-1 space-y-2 border-l-2 border-line pl-3 text-xs">
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                      <dt className="text-faint">Email</dt>
                      <dd className="break-all">{p.email}</dd>
                      <dt className="text-faint">Date of birth</dt>
                      <dd>{p.dob}</dd>
                      <dt className="text-faint">Programs</dt>
                      <dd>{p.programs.map((x) => PROGRAM[x] ?? x).join(", ") || "None"}</dd>
                    </dl>
                    <button
                      type="button"
                      onClick={() => onStart(p)}
                      className="rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-white hover:bg-accent/90"
                    >
                      Start as {p.name.split(" ")[0]}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
