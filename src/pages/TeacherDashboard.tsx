import { useEffect, useState } from "react";
import { Plus, Settings as SettingsIcon, ChevronLeft } from "lucide-react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { studentRepo } from "@/db/studentRepo";
import { DomainId, DOMAIN_LABELS, StudentProfile } from "@/engine/types";
import { AddStudentModal } from "./AddStudentModal";
import { StudentDetail } from "./StudentDetail";

interface Props {
  onOpenSettings: () => void;
  onStartSession: (student: StudentProfile, domain: DomainId) => void;
  refreshKey: number;
}

export function TeacherDashboard({ onOpenSettings, onStartSession, refreshKey }: Props) {
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    studentRepo.list().then(setStudents);
  }, [refreshKey]);

  const reload = () => studentRepo.list().then(setStudents);

  const selected = students.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-white/70 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {selected && (
              <button
                onClick={() => setSelectedId(null)}
                className="text-muted hover:text-ink inline-flex items-center gap-1 text-sm"
              >
                <ChevronLeft size={18} /> Back
              </button>
            )}
            <h1 className="text-lg font-semibold tracking-tight">
              {selected ? selected.name : "Adaptive DTL"}
            </h1>
            {!selected && (
              <span className="text-xs text-muted hidden sm:inline">
                Teacher Dashboard
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!selected && (
              <Button size="sm" onClick={() => setShowAdd(true)}>
                <Plus size={16} /> Add student
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onOpenSettings} aria-label="Settings">
              <SettingsIcon size={18} />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {selected ? (
          <StudentDetail
            student={selected}
            onStartSession={(d) => onStartSession(selected, d)}
          />
        ) : (
          <StudentList
            students={students}
            onSelect={(s) => setSelectedId(s.id)}
            onStart={onStartSession}
          />
        )}
      </main>

      <AddStudentModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSave={async (s) => {
          await studentRepo.upsert(s);
          await reload();
        }}
      />
    </div>
  );
}

function StudentList({
  students,
  onSelect,
  onStart,
}: {
  students: StudentProfile[];
  onSelect: (s: StudentProfile) => void;
  onStart: (s: StudentProfile, d: DomainId) => void;
}) {
  if (students.length === 0) {
    return (
      <Card className="p-10 text-center">
        <p className="text-muted">No students yet. Add one to get started.</p>
      </Card>
    );
  }
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {students.map((s) => (
        <Card key={s.id} className="p-5 hover:shadow-card transition-shadow">
          <button
            onClick={() => onSelect(s)}
            className="text-left w-full"
            aria-label={`Open ${s.name}`}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="text-4xl">{s.avatar}</div>
              <div>
                <div className="font-semibold text-ink">{s.name}</div>
                <div className="text-xs text-muted">
                  {s.grade} · reads at {s.readingLevel}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {s.goals.map((g) => (
                <span
                  key={g}
                  className="text-xs px-2 py-0.5 rounded-full bg-sage-50 text-sage-600 border border-sage-100"
                >
                  {DOMAIN_LABELS[g]}
                </span>
              ))}
            </div>
          </button>
          <div className="flex flex-wrap gap-2">
            {s.goals.map((g) => (
              <Button
                key={g}
                size="sm"
                variant="secondary"
                onClick={() => onStart(s, g)}
              >
                Start: {DOMAIN_LABELS[g]}
              </Button>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
