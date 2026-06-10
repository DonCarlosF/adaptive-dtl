import { lazy, Suspense, useEffect, useState } from "react";
import { LoadingScreen } from "@/components/LoadingScreen";
import { Login } from "@/pages/Login";
import { seedIfEmpty } from "@/db/seed";
import { DomainId, StudentProfile } from "@/engine/types";
import { isCloudEnabled } from "@/api/client";
import { currentUser, AuthUser } from "@/api/auth";

// Each top-level view is its own lazy chunk. This means a user landing
// on the dashboard does not download the session page or the settings
// page until they navigate to them. See BUNDLE.md.
const TeacherDashboard = lazy(() =>
  import("@/pages/TeacherDashboard").then((m) => ({
    default: m.TeacherDashboard,
  })),
);
const StudentSession = lazy(() =>
  import("@/pages/StudentSession").then((m) => ({ default: m.StudentSession })),
);
const Settings = lazy(() =>
  import("@/pages/Settings").then((m) => ({ default: m.Settings })),
);

type View =
  | { kind: "dashboard" }
  | { kind: "session"; student: StudentProfile; domain: DomainId }
  | { kind: "settings" };

export default function App() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [view, setView] = useState<View>({ kind: "dashboard" });
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    (async () => {
      if (isCloudEnabled()) {
        // Cloud mode: data lives per-account on the server, so don't seed
        // the local DB. Resolve the logged-in user (if any) first.
        setUser(await currentUser());
      } else {
        await seedIfEmpty();
      }
      setReady(true);
    })();
  }, []);

  if (!ready) {
    return <LoadingScreen />;
  }

  // Cloud mode requires a logged-in teacher before anything else.
  if (isCloudEnabled() && !user) {
    return <Login onAuthed={setUser} />;
  }

  if (view.kind === "session") {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <StudentSession
          student={view.student}
          domain={view.domain}
          onExit={() => {
            setRefreshKey((k) => k + 1);
            setView({ kind: "dashboard" });
          }}
        />
      </Suspense>
    );
  }

  if (view.kind === "settings") {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <Settings
          onBack={() => setView({ kind: "dashboard" })}
          onLogout={() => {
            setUser(null);
            setView({ kind: "dashboard" });
          }}
        />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<LoadingScreen />}>
      <TeacherDashboard
        refreshKey={refreshKey}
        onOpenSettings={() => setView({ kind: "settings" })}
        onStartSession={(student, domain) =>
          setView({ kind: "session", student, domain })
        }
      />
    </Suspense>
  );
}
