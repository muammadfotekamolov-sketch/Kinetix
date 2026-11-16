import { useEffect, useState } from 'react';
import { getRedirectResult, onAuthStateChanged } from 'firebase/auth';
import { AiStudioModal } from './components/AiStudioModal.tsx';
import { HomeView } from './components/HomeView.tsx';
import { OnboardingFlow } from './components/OnboardingFlow.tsx';
import { PricingCheckoutModal } from './components/PricingCheckoutModal.tsx';
import { VideoEditor } from './components/VideoEditor.tsx';
import { LANGUAGES } from './data/i18n.ts';
import { apiFetch, getLocalSessionToken } from './lib/api.ts';
import { getProjectDurationMs } from './lib/canvasCompositor.ts';
import { auth } from './lib/firebase.ts';
import type {
  LanguageCode,
  ProjectRecord,
  ProjectState,
  UserProfile,
} from './types/editor.ts';

export default function App() {
  const [lang, setLang] = useState<LanguageCode>(() => {
    const saved = localStorage.getItem('kinetix_lang') as LanguageCode | null;
    return saved || 'ru';
  });
  const [user, setUser] = useState<UserProfile | null>(null);
  const [booting, setBooting] = useState(true);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);

  const [editorSession, setEditorSession] = useState<{
    projectId: number | null;
    state: ProjectState;
    openPublish?: boolean;
    autoPlay?: boolean;
  } | null>(null);

  const [showAiStudio, setShowAiStudio] = useState(false);
  const [showPricing, setShowPricing] = useState(false);

  const handleLanguageChange = (nextLang: LanguageCode) => {
    setLang(nextLang);
    localStorage.setItem('kinetix_lang', nextLang);
  };

  const loadProjects = async () => {
    try {
      const res = await apiFetch<{ projects: ProjectRecord[] }>('/api/projects');
      setProjects(res.projects || []);
    } catch {
      // ignore if unauthenticated
    }
  };

  useEffect(() => {
    let active = true;
    let unsub: (() => void) | undefined;

    const failsafeTimer = window.setTimeout(() => {
      if (active) setBooting(false);
    }, 2500);

    const syncFirebaseUser = async () => {
      try {
        const res = await apiFetch<{ user: UserProfile }>('/api/user/me');
        if (active && res.user) {
          setUser(res.user);
          if (res.user.language) setLang(res.user.language);
          await loadProjects();
          return true;
        }
      } catch {
        // fallback: ensure session row exists if user came back from redirect
        try {
          const savedProfileRaw = sessionStorage.getItem('kinetix_pending_google_profile');
          const savedProfile = savedProfileRaw ? JSON.parse(savedProfileRaw) : {};
          const sessionRes = await apiFetch<{ user: UserProfile }>('/api/auth/session', {
            method: 'POST',
            body: JSON.stringify(savedProfile),
          });
          sessionStorage.removeItem('kinetix_pending_google_profile');
          if (active && sessionRes.user) {
            setUser(sessionRes.user);
            if (sessionRes.user.language) setLang(sessionRes.user.language);
            await loadProjects();
            return true;
          }
        } catch {
          // user hasn't finished session sync
        }
      }
      return false;
    };

    const bootstrap = async () => {
      const localToken = getLocalSessionToken();
      if (localToken) {
        try {
          const res = await apiFetch<{ user: UserProfile }>('/api/user/me');
          if (active && res.user) {
            setUser(res.user);
            if (res.user.language) setLang(res.user.language);
            await loadProjects();
            if (active) setBooting(false);
            return;
          }
        } catch {
          // token invalid; fall through to Firebase check
        }
      }

      try {
        const redirectCred = await getRedirectResult(auth);
        if (active && redirectCred?.user) {
          await syncFirebaseUser();
          if (active) setBooting(false);
          return;
        }
      } catch {
        // ignore redirect result errors cleanly
      }

      if (!active) return;

      unsub = onAuthStateChanged(auth, async (fbUser) => {
        if (!active) return;
        if (fbUser) {
          await syncFirebaseUser();
        }
        if (active) setBooting(false);
      });
    };

    void bootstrap();
    return () => {
      active = false;
      window.clearTimeout(failsafeTimer);
      if (unsub) unsub();
    };
  }, []);

  const handleAuthenticated = async (authedUser: UserProfile) => {
    setUser(authedUser);
    if (authedUser.language) {
      handleLanguageChange(authedUser.language);
    }
    await loadProjects();
  };

  const handleSaveProject = async (
    state: ProjectState,
    existingId: number | null,
  ): Promise<number | null> => {
    const payload = {
      title: state.title,
      aspectRatio: state.aspectRatio,
      resolution: state.resolution,
      fps: state.fps,
      durationMs: getProjectDurationMs(state),
      thumbnailUrl: state.clips[0]?.type === 'image' ? state.clips[0].src : '',
      stateJson: state,
    };

    if (existingId) {
      const res = await apiFetch<{ project: ProjectRecord }>(
        `/api/projects/${existingId}`,
        {
          method: 'PUT',
          body: JSON.stringify(payload),
        },
      );
      setProjects((prev) =>
        prev.map((p) => (p.id === existingId ? res.project : p)),
      );
      return res.project.id;
    }

    const res = await apiFetch<{ project: ProjectRecord }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setProjects((prev) => [res.project, ...prev]);
    return res.project.id;
  };

  const handleDeleteProject = async (id: number) => {
    await apiFetch(`/api/projects/${id}`, { method: 'DELETE' });
    setProjects((prev) => prev.filter((p) => p.id !== id));
  };

  const isRtl = LANGUAGES.find((l) => l.code === lang)?.rtl;

  if (booting) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[#00E5FF] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <OnboardingFlow
        initialLanguage={lang}
        onLanguageChange={handleLanguageChange}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} className="min-h-screen bg-black text-white">
      {editorSession ? (
        <VideoEditor
          user={user}
          lang={lang}
          projectId={editorSession.projectId}
          initialState={editorSession.state}
          initialPublishOpen={editorSession.openPublish}
          autoPlay={editorSession.autoPlay}
          onBack={() => {
            setEditorSession(null);
            void loadProjects();
          }}
          onSaveProject={handleSaveProject}
          onUserUpdated={setUser}
        />
      ) : (
        <HomeView
          user={user}
          lang={lang}
          projects={projects}
          onLanguageChange={handleLanguageChange}
          onUserUpdated={setUser}
          onLoggedOut={() => {
            setUser(null);
            setProjects([]);
          }}
          onOpenEditor={(state, projectId = null) =>
            setEditorSession({ projectId, state })
          }
          onDeleteProject={handleDeleteProject}
          onOpenAiStudio={() => setShowAiStudio(true)}
          onOpenPricing={() => setShowPricing(true)}
        />
      )}

      {showAiStudio && (
        <AiStudioModal
          user={user}
          lang={lang}
          onClose={() => setShowAiStudio(false)}
          onOpenPricing={() => setShowPricing(true)}
          onOpenProjectInEditor={(state) => {
            setShowAiStudio(false);
            setEditorSession({ projectId: null, state, autoPlay: true });
          }}
        />
      )}

      {showPricing && (
        <PricingCheckoutModal
          user={user}
          lang={lang}
          onClose={() => setShowPricing(false)}
          onUpdatedUser={setUser}
        />
      )}
    </div>
  );
}
