import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactElement } from "react";
import QRCode from "qrcode";
import type { Session } from "@supabase/supabase-js";
import { mytLocalToUtcIso } from "./myt.js";
import { getBrowserSupabase } from "./supabase-client.js";

const ACTIVE_PROJECT_STORAGE_KEY = "nmcas-active-project-id";

type HealthResponse = {
  ok: boolean;
  queue: string;
  sessionPathExample: string;
};

type WaStatusResponse = {
  state: "disconnected" | "connecting" | "connected";
  hasQr: boolean;
};

type WaGroup = { jid: string; name: string };

type ScheduledMessage = {
  id: string;
  groupJid: string;
  groupName: string;
  type: string;
  copyText: string | null;
  imageUrl: string | null;
  pollQuestion: string | null;
  pollOptions: string[];
  pollMultiSelect: boolean;
  scheduledAt: string;
  status: string;
  sentAt: string | null;
  error: string | null;
};

type MessageKind = "POST" | "POLL";

type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
};

function readStoredProjectId(): string | null {
  try {
    const v = window.sessionStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY);
    if (typeof v === "string" && v.length > 0) {
      return v;
    }
  } catch {
    /* ignore private mode / blocked storage */
  }
  return null;
}

function apiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_URL;
  if (typeof fromEnv === "string" && fromEnv.trim().length > 0) {
    return fromEnv.replace(/\/$/, "");
  }
  return "";
}

function apiPath(path: string): string {
  const base = apiBaseUrl();
  const p = path.startsWith("/") ? path : `/${path}`;
  if (base.length > 0) {
    return `${base}${p}`;
  }
  return `/api${p}`;
}

/**
 * P2/P3 UI with Supabase Auth + per-project API scope (`X-Project-Id`).
 */
export function App(): ReactElement {
  const supabase = useMemo(() => getBrowserSupabase(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"signIn" | "signUp">("signIn");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authFormError, setAuthFormError] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [createProjectSubmitting, setCreateProjectSubmitting] = useState(false);
  const [createProjectError, setCreateProjectError] = useState<string | null>(null);

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [waState, setWaState] = useState<WaStatusResponse | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [groups, setGroups] = useState<WaGroup[]>([]);
  const [messages, setMessages] = useState<ScheduledMessage[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [groupJid, setGroupJid] = useState("");
  const [groupName, setGroupName] = useState("");
  const [messageKind, setMessageKind] = useState<MessageKind>("POST");
  const [copyText, setCopyText] = useState("");
  const [scheduledLocal, setScheduledLocal] = useState("");
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [pollMultiSelect, setPollMultiSelect] = useState(false);
  const [sessionResetting, setSessionResetting] = useState(false);

  const authorizedFetch = useCallback(
    async (path: string, init?: RequestInit & { skipProjectHeader?: boolean }) => {
      const headers = new Headers(init?.headers);
      const token = session?.access_token;
      if (typeof token === "string" && token.length > 0) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      if (init?.skipProjectHeader !== true && selectedProjectId.length > 0) {
        headers.set("X-Project-Id", selectedProjectId);
      }
      return fetch(apiPath(path), { ...init, headers });
    },
    [session, selectedProjectId],
  );

  useEffect(() => {
    if (supabase === null) {
      setAuthReady(true);
      return;
    }
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) {
        setSession(data.session);
      }
      if (!cancelled) {
        setAuthReady(true);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  const loadProjects = useCallback(async () => {
    if (session === null) {
      return;
    }
    setProjectsLoading(true);
    setProjectsError(null);
    try {
      const res = await fetch(apiPath("/projects"), {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setProjectsError(body.error ?? `Failed to load projects (${String(res.status)})`);
        setProjects([]);
        return;
      }
      const json = (await res.json()) as { projects?: ProjectRow[] };
      const list = Array.isArray(json.projects) ? json.projects : [];
      setProjects(list);
    } finally {
      setProjectsLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (supabase === null || session === null) {
      setProjects([]);
      setProjectsError(null);
      setProjectsLoading(false);
      return;
    }
    void loadProjects();
  }, [supabase, session, loadProjects]);

  useEffect(() => {
    if (projects.length === 0) {
      return;
    }
    setSelectedProjectId((current) => {
      if (current.length > 0 && projects.some((p) => p.id === current)) {
        return current;
      }
      const stored = readStoredProjectId();
      if (stored !== null && projects.some((p) => p.id === stored)) {
        return stored;
      }
      const first = projects[0];
      return first !== undefined ? first.id : "";
    });
  }, [projects]);

  useEffect(() => {
    if (selectedProjectId.length === 0) {
      return;
    }
    try {
      window.sessionStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, selectedProjectId);
    } catch {
      /* ignore */
    }
  }, [selectedProjectId]);

  const refreshHealth = useCallback(() => {
    void fetch(apiPath("/health"))
      .then((r) => r.json() as Promise<HealthResponse>)
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  const refreshWa = useCallback(() => {
    if (session === null || selectedProjectId.length === 0) {
      setWaState(null);
      return;
    }
    void authorizedFetch("/wa/status")
      .then((r) => r.json() as Promise<WaStatusResponse>)
      .then(setWaState)
      .catch(() => setWaState(null));
  }, [authorizedFetch, session, selectedProjectId]);

  const refreshQrFromServer = useCallback(async () => {
    if (session === null || selectedProjectId.length === 0) {
      setQrDataUrl(null);
      return;
    }
    const res = await authorizedFetch("/wa/qr");
    if (res.status === 204) {
      setQrDataUrl(null);
      return;
    }
    if (!res.ok) {
      setQrDataUrl(null);
      return;
    }
    const body = (await res.json()) as { qr?: string };
    if (typeof body.qr === "string" && body.qr.length > 0) {
      const url = await QRCode.toDataURL(body.qr, { margin: 1, width: 280 });
      setQrDataUrl(url);
    } else {
      setQrDataUrl(null);
    }
  }, [authorizedFetch, session, selectedProjectId]);

  const refreshGroups = useCallback(() => {
    if (session === null || selectedProjectId.length === 0) {
      setGroups([]);
      return;
    }
    void authorizedFetch("/wa/groups")
      .then((r) => r.json() as Promise<{ groups: WaGroup[] }>)
      .then((j) => setGroups(j.groups))
      .catch(() => setGroups([]));
  }, [authorizedFetch, session, selectedProjectId]);

  const refreshMessages = useCallback(() => {
    if (session === null || selectedProjectId.length === 0) {
      setMessages([]);
      return;
    }
    void authorizedFetch("/messages")
      .then((r) => r.json() as Promise<{ messages: ScheduledMessage[] }>)
      .then((j) => setMessages(j.messages))
      .catch(() => setMessages([]));
  }, [authorizedFetch, session, selectedProjectId]);

  const resetWaSession = useCallback(async () => {
    if (session === null || selectedProjectId.length === 0) {
      return;
    }
    setSessionResetting(true);
    try {
      const res = await authorizedFetch("/wa/session/reset", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || body.ok !== true) {
        const msg = typeof body.error === "string" ? body.error : `Reset failed (${String(res.status)})`;
        window.alert(msg);
        return;
      }
      await refreshQrFromServer();
      refreshWa();
    } finally {
      setSessionResetting(false);
    }
  }, [authorizedFetch, refreshQrFromServer, refreshWa, session, selectedProjectId]);

  const onClickResetSession = () => {
    const ok = window.confirm(
      "Delete the saved WhatsApp session in Supabase Storage for this project and start fresh? You will need to scan a new QR code on your phone.",
    );
    if (!ok) {
      return;
    }
    void resetWaSession();
  };

  useEffect(() => {
    refreshHealth();
  }, [refreshHealth]);

  useEffect(() => {
    refreshWa();
    const t = window.setInterval(refreshWa, 3000);
    return () => window.clearInterval(t);
  }, [refreshWa]);

  useEffect(() => {
    void refreshQrFromServer();
    const t = window.setInterval(() => {
      void refreshQrFromServer();
    }, 2500);
    return () => window.clearInterval(t);
  }, [refreshQrFromServer]);

  useEffect(() => {
    if (waState?.state === "connected") {
      refreshGroups();
    } else {
      setGroups([]);
    }
  }, [waState?.state, refreshGroups]);

  useEffect(() => {
    refreshMessages();
    const t = window.setInterval(refreshMessages, 8000);
    return () => window.clearInterval(t);
  }, [refreshMessages]);

  const onGroupSelect = (jid: string) => {
    setGroupJid(jid);
    const g = groups.find((x) => x.jid === jid);
    setGroupName(g !== undefined ? g.name : "");
  };

  const onUploadImage = (file: File | undefined) => {
    setFormError(null);
    if (file === undefined) {
      return;
    }
    if (session === null || selectedProjectId.length === 0) {
      setFormError("Sign in and pick a project before uploading.");
      return;
    }
    void (async () => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await authorizedFetch("/uploads/post-image", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setFormError(err.error ?? `Upload failed (${String(res.status)})`);
        setImagePath(null);
        return;
      }
      const j = (await res.json()) as { path: string };
      setImagePath(j.path);
    })();
  };

  const onSchedule = () => {
    setFormError(null);
    if (session === null || selectedProjectId.length === 0) {
      setFormError("Sign in and pick a project.");
      return;
    }
    if (waState?.state !== "connected") {
      setFormError("WhatsApp is not connected. Link with the QR code above, wait until status is connected, then try again.");
      return;
    }
    if (groupJid.length === 0 || groupName.length === 0) {
      setFormError("Pick a WhatsApp group.");
      return;
    }
    let scheduledAt: string;
    try {
      scheduledAt = mytLocalToUtcIso(scheduledLocal);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Invalid time");
      return;
    }

    let body: Record<string, unknown>;
    if (messageKind === "POST") {
      if (copyText.trim().length === 0 && (imagePath === null || imagePath.length === 0)) {
        setFormError("Enter message text and/or upload an image.");
        return;
      }
      body = {
        type: "POST",
        groupJid,
        groupName,
        copyText: copyText.trim().length > 0 ? copyText.trim() : undefined,
        imageUrl: imagePath ?? undefined,
        scheduledAt,
      };
    } else {
      const trimmedQ = pollQuestion.trim();
      const trimmedOpts = pollOptions.map((o) => o.trim()).filter((o) => o.length > 0);
      if (trimmedQ.length === 0) {
        setFormError("Enter a poll question.");
        return;
      }
      if (trimmedOpts.length < 2) {
        setFormError("Add at least two non-empty poll options (up to 12).");
        return;
      }
      if (trimmedOpts.length > 12) {
        setFormError("WhatsApp allows at most 12 poll options.");
        return;
      }
      body = {
        type: "POLL",
        groupJid,
        groupName,
        pollQuestion: trimmedQ,
        pollOptions: trimmedOpts,
        pollMultiSelect,
        scheduledAt,
      };
    }

    setSubmitting(true);
    void (async () => {
      const res = await authorizedFetch("/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setSubmitting(false);
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setFormError(err.error ?? `Schedule failed (${String(res.status)})`);
        return;
      }
      setCopyText("");
      setScheduledLocal("");
      setImagePath(null);
      setPollQuestion("");
      setPollOptions(["", ""]);
      setPollMultiSelect(false);
      refreshMessages();
    })();
  };

  const onSubmitAuth = (ev: FormEvent) => {
    ev.preventDefault();
    setAuthFormError(null);
    if (supabase === null) {
      setAuthFormError("Supabase is not configured in the web app.");
      return;
    }
    const trimmedEmail = email.trim();
    if (trimmedEmail.length === 0 || password.length < 6) {
      setAuthFormError("Enter email and password (at least 6 characters).");
      return;
    }
    setAuthSubmitting(true);
    void (async () => {
      if (authMode === "signIn") {
        const { error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });
        setAuthSubmitting(false);
        if (error !== null) {
          setAuthFormError(error.message);
          return;
        }
        setPassword("");
        return;
      }
      const { error } = await supabase.auth.signUp({ email: trimmedEmail, password });
      setAuthSubmitting(false);
      if (error !== null) {
        setAuthFormError(error.message);
        return;
      }
      setAuthFormError("Check your email to confirm the account if your project requires it, then sign in.");
    })();
  };

  const onSignOut = () => {
    if (supabase === null) {
      return;
    }
    void supabase.auth.signOut();
    setProjects([]);
    setSelectedProjectId("");
    setWaState(null);
    setMessages([]);
  };

  const onCreateProject = (ev: FormEvent) => {
    ev.preventDefault();
    setCreateProjectError(null);
    if (session === null) {
      return;
    }
    const name = newProjectName.trim();
    if (name.length === 0) {
      setCreateProjectError("Enter a project name.");
      return;
    }
    const descTrimmed = newProjectDescription.trim();
    setCreateProjectSubmitting(true);
    void (async () => {
      const res = await fetch(apiPath("/projects"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          ...(descTrimmed.length > 0 ? { description: descTrimmed } : {}),
        }),
      });
      setCreateProjectSubmitting(false);
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string; details?: unknown };
        const detail =
          err.details !== undefined && typeof err.details === "object"
            ? JSON.stringify(err.details)
            : "";
        setCreateProjectError(
          [err.error ?? `Create failed (${String(res.status)})`, detail].filter((s) => s.length > 0).join(" "),
        );
        return;
      }
      const json = (await res.json()) as { project?: ProjectRow };
      if (json.project === undefined) {
        setCreateProjectError("Unexpected response from server.");
        return;
      }
      setNewProjectName("");
      setNewProjectDescription("");
      await loadProjects();
      setSelectedProjectId(json.project.id);
    })();
  };

  const waConnected = waState?.state === "connected";
  const waConnecting = waState?.state === "connecting";
  const showLinkHelp = waState !== null && !waConnected;
  const waStatusUnavailable = waState === null;

  const canUseApiRoutes =
    supabase !== null && session !== null && selectedProjectId.length > 0 && projectsError === null;

  return (
    <div>
      <h1>NMCAS</h1>
      <p>
        Schedule WhatsApp <strong>posts</strong> or <strong>polls</strong> (P2–P3). Times below are entered in{" "}
        <strong>Malaysia (MYT, UTC+8)</strong>.
      </p>

      {supabase === null ? (
        <section
          role="status"
          style={{
            marginBottom: "1.5rem",
            padding: "1rem 1.25rem",
            borderRadius: 10,
            border: "2px solid #94a3b8",
            background: "#f8fafc",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Supabase Auth not configured in the web app</h2>
          <p style={{ marginBottom: 0 }}>
            Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (same project as the API) in{" "}
            <code>apps/web/.env</code> or the repo root env file Vite loads, then restart Vite. The API still needs{" "}
            <code>SUPABASE_ANON_KEY</code> for JWT verification.
          </p>
        </section>
      ) : !authReady ? (
        <p>Loading session…</p>
      ) : session === null ? (
        <section style={{ marginBottom: "1.5rem", maxWidth: "28rem" }}>
          <h2>Sign in</h2>
          <p style={{ fontSize: "0.95rem", color: "#475569" }}>
            The API requires a Supabase session (<code>Authorization: Bearer</code>) and a project scope (
            <code>X-Project-Id</code>). After sign-in, your user is auto-joined to the default project when{" "}
            <code>AUTH_AUTO_JOIN_DEFAULT_PROJECT</code> is enabled on the API.
          </p>
          <div style={{ marginBottom: "0.75rem" }}>
            <button type="button" disabled={authMode === "signIn"} onClick={() => setAuthMode("signIn")}>
              Sign in
            </button>{" "}
            <button type="button" disabled={authMode === "signUp"} onClick={() => setAuthMode("signUp")}>
              Create account
            </button>
          </div>
          <form onSubmit={onSubmitAuth}>
            <label style={{ display: "block", marginBottom: "0.5rem" }}>
              Email
              <input
                type="email"
                value={email}
                autoComplete="email"
                onChange={(e) => {
                  setEmail(e.target.value);
                }}
                style={{ display: "block", width: "100%" }}
              />
            </label>
            <label style={{ display: "block", marginBottom: "0.5rem" }}>
              Password
              <input
                type="password"
                value={password}
                autoComplete={authMode === "signIn" ? "current-password" : "new-password"}
                onChange={(e) => {
                  setPassword(e.target.value);
                }}
                style={{ display: "block", width: "100%" }}
              />
            </label>
            {authFormError !== null ? <p style={{ color: "crimson" }}>{authFormError}</p> : null}
            <button type="submit" disabled={authSubmitting}>
              {authSubmitting ? "Please wait…" : authMode === "signIn" ? "Sign in" : "Sign up"}
            </button>
          </form>
        </section>
      ) : (
        <section style={{ marginBottom: "1.5rem" }}>
          <p style={{ marginBottom: "0.5rem" }}>
            Signed in as <strong>{session.user.email ?? session.user.id}</strong>{" "}
            <button type="button" onClick={() => void onSignOut()}>
              Sign out
            </button>
          </p>
          {projectsLoading ? (
            <p>Loading projects…</p>
          ) : projectsError !== null ? (
            <p style={{ color: "crimson" }}>{projectsError}</p>
          ) : projects.length === 0 ? (
            <p style={{ color: "#b45309" }}>
              No projects yet. Create one below, or ensure the API default project exists (<code>npm run db:seed</code>)
              and that <code>AUTH_AUTO_JOIN_DEFAULT_PROJECT</code> is not disabled.
            </p>
          ) : (
            <label style={{ display: "block", maxWidth: "28rem" }}>
              Active project
              <select
                value={selectedProjectId}
                onChange={(e) => {
                  setSelectedProjectId(e.target.value);
                }}
                style={{ display: "block", width: "100%", marginTop: "0.25rem" }}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.id})
                  </option>
                ))}
              </select>
            </label>
          )}
          {!projectsLoading && session !== null ? (
            <div style={{ marginTop: "1.25rem", maxWidth: "28rem" }}>
              <h3 style={{ marginTop: 0, marginBottom: "0.5rem" }}>New project</h3>
              <p style={{ marginTop: 0, fontSize: "0.9rem", color: "#475569" }}>
                Creates a new WhatsApp workspace (own session folder in Storage). Link that account from the QR flow
                after switching to the new project.
              </p>
              <form onSubmit={onCreateProject}>
                <label style={{ display: "block", marginBottom: "0.5rem" }}>
                  Name
                  <input
                    type="text"
                    value={newProjectName}
                    maxLength={256}
                    onChange={(e) => {
                      setNewProjectName(e.target.value);
                    }}
                    style={{ display: "block", width: "100%", marginTop: "0.25rem" }}
                  />
                </label>
                <label style={{ display: "block", marginBottom: "0.5rem" }}>
                  Description (optional)
                  <textarea
                    value={newProjectDescription}
                    maxLength={2000}
                    rows={2}
                    onChange={(e) => {
                      setNewProjectDescription(e.target.value);
                    }}
                    style={{ display: "block", width: "100%", marginTop: "0.25rem" }}
                  />
                </label>
                {createProjectError !== null ? <p style={{ color: "crimson" }}>{createProjectError}</p> : null}
                <button type="submit" disabled={createProjectSubmitting}>
                  {createProjectSubmitting ? "Creating…" : "Create project"}
                </button>
              </form>
            </div>
          ) : null}
        </section>
      )}

      <section style={{ marginBottom: "1.5rem" }}>
        <h2>API</h2>
        {health === null ? (
          <p>Health check failed.</p>
        ) : (
          <p>
            OK — queue <code>{health.queue}</code>
          </p>
        )}
      </section>

      {!canUseApiRoutes ? null : waStatusUnavailable ? (
        <div
          role="alert"
          style={{
            marginBottom: "1.5rem",
            padding: "1rem 1.25rem",
            borderRadius: 10,
            border: "2px solid #64748b",
            background: "#f1f5f9",
            color: "#1e293b",
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: "0.75rem" }}>WhatsApp status could not be loaded</h2>
          <p style={{ marginTop: 0 }}>
            The browser did not get a response from <code>/api/wa/status</code>. That often happens when the{" "}
            <strong>API process crashed</strong> — for example after{" "}
            <strong>Storage upload failed … fetch failed</strong> on <code>creds.json</code> (uncaught errors used to
            kill the whole server). <strong>Restart</strong> <code>npm run dev</code>, fix Supabase reachability (
            <code>SUPABASE_URL</code>, network, VPN), then use Retry.
          </p>
          <p style={{ marginBottom: 0 }}>
            <button type="button" onClick={() => void refreshHealth()}>
              Retry health
            </button>{" "}
            <button type="button" onClick={() => void refreshWa()}>
              Retry WhatsApp status
            </button>
          </p>
        </div>
      ) : null}

      {!canUseApiRoutes ? null : showLinkHelp ? (
        <div
          role="alert"
          style={{
            marginBottom: "1.5rem",
            padding: "1rem 1.25rem",
            borderRadius: 10,
            border: "2px solid #f59e0b",
            background: "#fffbeb",
            color: "#78350f",
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: "0.75rem" }}>WhatsApp is not linked</h2>
          <p style={{ marginTop: 0 }}>
            You cannot pick groups or schedule until the session is <strong>connected</strong>. Do this on your phone:
          </p>
          <ol style={{ marginBottom: "1rem", paddingLeft: "1.25rem" }}>
            <li>Open <strong>WhatsApp</strong> → <strong>Settings</strong> (or menu) → <strong>Linked devices</strong>.</li>
            <li>Tap <strong>Link a device</strong>.</li>
            <li>Point the camera at the <strong>QR code</strong> below when it appears (it can take a few seconds after a disconnect).</li>
            <li>When status flips to <strong>connected</strong>, your groups load automatically.</li>
          </ol>
          {waConnecting ? (
            <p style={{ marginBottom: "0.75rem" }}>
              <strong>Connecting…</strong> After you scan the QR, WhatsApp often closes the socket once (restart) before showing{" "}
              <strong>connected</strong> — that is normal. If it never reaches connected, check the API terminal for Storage or auth errors, then restart the API once.
            </p>
          ) : (
            <p style={{ marginBottom: "0.75rem" }}>
              <strong>Disconnected.</strong> The server will try to reconnect; a new QR appears if you need to link again. If you see no QR for a long time, restart the API once.
            </p>
          )}
          {qrDataUrl !== null ? (
            <figure style={{ margin: 0 }}>
              <img src={qrDataUrl} alt="WhatsApp link QR code" width={280} height={280} style={{ display: "block" }} />
              <figcaption style={{ fontSize: "0.9rem", marginTop: "0.5rem" }}>
                Scan with WhatsApp → Linked devices → Link a device.
              </figcaption>
            </figure>
          ) : (
            <div style={{ marginBottom: "0.75rem", fontSize: "0.95rem" }}>
              <p style={{ marginTop: 0 }}>
                <strong>No QR yet.</strong> That usually means an old, invalid session is still stored (for example after WhatsApp returns 401 logged out). The server can clear it automatically on some errors; if you stay stuck here, use the button below.
              </p>
              <p style={{ marginBottom: 0 }}>
                Keep this tab open — we poll every few seconds — or use refresh, then{" "}
                <strong>Clear saved session &amp; new QR</strong> if needed.
              </p>
            </div>
          )}
          <p style={{ marginBottom: 0 }}>
            <button type="button" onClick={() => void refreshWa()}>
              Refresh status
            </button>{" "}
            <button type="button" onClick={() => void refreshQrFromServer()}>
              Refresh QR
            </button>{" "}
            <button type="button" onClick={() => void refreshGroups()}>
              Try load groups
            </button>{" "}
            <button type="button" disabled={sessionResetting} onClick={() => void onClickResetSession()}>
              {sessionResetting ? "Clearing session…" : "Clear saved session & new QR"}
            </button>
          </p>
        </div>
      ) : null}

      {!canUseApiRoutes ? null : (
        <section style={{ marginBottom: "1.5rem" }}>
          <h2>WhatsApp</h2>
          {waState === null ? (
            <p>
              Status unavailable. Is the API running?{" "}
              <button type="button" onClick={() => void refreshWa()}>
                Retry
              </button>
            </p>
          ) : (
            <p>
              State: <strong>{waState.state}</strong>
              {waState.hasQr && !waConnected ? " — QR available (see banner above)" : null}
              {waConnected ? " — ready to schedule." : null}
            </p>
          )}
          {!showLinkHelp && qrDataUrl !== null ? (
            <p>
              <img src={qrDataUrl} alt="WhatsApp QR" width={240} height={240} />
            </p>
          ) : null}
          <p>
            <button type="button" onClick={() => void refreshGroups()} disabled={!waConnected}>
              Refresh groups
            </button>
          </p>
          {!waConnected ? (
            <p style={{ color: "#64748b" }}>Groups load only while connected.</p>
          ) : groups.length === 0 ? (
            <p>No groups returned yet — tap refresh, or confirm this account is in at least one group.</p>
          ) : (
            <p>{groups.length} group(s) available — use picker below.</p>
          )}
        </section>
      )}

      {!canUseApiRoutes ? null : (
        <section
          style={{
            marginBottom: "1.5rem",
            opacity: waConnected ? 1 : 0.55,
            pointerEvents: waConnected ? "auto" : "none",
          }}
          aria-disabled={!waConnected}
        >
          <h2>Schedule message</h2>
          {!waConnected ? (
            <p role="status" style={{ color: "#b45309", fontWeight: 600 }}>
              {waStatusUnavailable
                ? "Scheduling is off until the API is running again and WhatsApp status loads (see the gray notice above)."
                : "Scheduling is turned off until WhatsApp is connected (see the yellow notice above)."}
            </p>
          ) : null}
          {formError !== null ? <p style={{ color: "crimson" }}>{formError}</p> : null}
          <fieldset style={{ marginBottom: "0.75rem", border: "none", padding: 0 }}>
            <legend style={{ marginBottom: "0.35rem" }}>Message type</legend>
            <label style={{ marginRight: "1rem" }}>
              <input
                type="radio"
                name="msgKind"
                checked={messageKind === "POST"}
                disabled={!waConnected}
                onChange={() => {
                  setMessageKind("POST");
                  setFormError(null);
                }}
              />{" "}
              Post (text / image)
            </label>
            <label>
              <input
                type="radio"
                name="msgKind"
                checked={messageKind === "POLL"}
                disabled={!waConnected}
                onChange={() => {
                  setMessageKind("POLL");
                  setFormError(null);
                }}
              />{" "}
              Poll
            </label>
          </fieldset>
          <label style={{ display: "block", marginBottom: "0.5rem" }}>
            Group
            <select
              value={groupJid}
              onChange={(e) => {
                onGroupSelect(e.target.value);
              }}
              disabled={!waConnected}
              style={{ display: "block", width: "100%", maxWidth: "28rem" }}
            >
              <option value="">Select…</option>
              {groups.map((g) => (
                <option key={g.jid} value={g.jid}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          {messageKind === "POST" ? (
            <>
              <label style={{ display: "block", marginBottom: "0.5rem" }}>
                Message
                <textarea
                  value={copyText}
                  onChange={(e) => {
                    setCopyText(e.target.value);
                  }}
                  disabled={!waConnected}
                  rows={4}
                  style={{ display: "block", width: "100%", maxWidth: "28rem" }}
                />
              </label>
              <label style={{ display: "block", marginBottom: "0.5rem" }}>
                Image (optional)
                <input
                  type="file"
                  accept="image/*"
                  disabled={!waConnected}
                  onChange={(e) => {
                    onUploadImage(e.target.files?.[0]);
                  }}
                  style={{ display: "block" }}
                />
                {imagePath !== null ? <small>Uploaded: {imagePath}</small> : null}
              </label>
            </>
          ) : (
            <>
              <label style={{ display: "block", marginBottom: "0.5rem" }}>
                Poll question
                <input
                  type="text"
                  value={pollQuestion}
                  onChange={(e) => {
                    setPollQuestion(e.target.value);
                  }}
                  disabled={!waConnected}
                  maxLength={4096}
                  style={{ display: "block", width: "100%", maxWidth: "28rem" }}
                />
              </label>
              <div style={{ marginBottom: "0.5rem" }}>
                <span style={{ display: "block", marginBottom: "0.35rem" }}>Options (2–12)</span>
                {pollOptions.map((opt, idx) => (
                  <div key={idx} style={{ display: "flex", gap: "0.35rem", marginBottom: "0.35rem", maxWidth: "28rem" }}>
                    <input
                      type="text"
                      value={opt}
                      placeholder={`Option ${String(idx + 1)}`}
                      disabled={!waConnected}
                      onChange={(e) => {
                        const next = [...pollOptions];
                        next[idx] = e.target.value;
                        setPollOptions(next);
                      }}
                      style={{ flex: 1, minWidth: 0 }}
                    />
                    <button
                      type="button"
                      disabled={!waConnected || pollOptions.length <= 2}
                      onClick={() => {
                        setPollOptions(pollOptions.filter((_, i) => i !== idx));
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  disabled={!waConnected || pollOptions.length >= 12}
                  onClick={() => {
                    setPollOptions([...pollOptions, ""]);
                  }}
                >
                  Add option
                </button>
              </div>
              <label style={{ display: "block", marginBottom: "0.5rem" }}>
                <input
                  type="checkbox"
                  checked={pollMultiSelect}
                  disabled={!waConnected}
                  onChange={(e) => {
                    setPollMultiSelect(e.target.checked);
                  }}
                />{" "}
                Allow multiple answers
              </label>
            </>
          )}
          <label style={{ display: "block", marginBottom: "0.5rem" }}>
            Send at (MYT)
            <input
              type="datetime-local"
              value={scheduledLocal}
              onChange={(e) => {
                setScheduledLocal(e.target.value);
              }}
              disabled={!waConnected}
              style={{ display: "block" }}
            />
          </label>
          <button type="button" disabled={submitting || !waConnected} onClick={() => void onSchedule()}>
            {submitting ? "Scheduling…" : "Schedule"}
          </button>
        </section>
      )}

      {!canUseApiRoutes ? null : (
        <section>
          <h2>Scheduled messages</h2>
          <button type="button" onClick={() => void refreshMessages()}>
            Refresh list
          </button>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {messages.map((m) => (
              <li
                key={m.id}
                style={{
                  border: "1px solid #cbd5e1",
                  borderRadius: 8,
                  padding: "0.75rem",
                  marginTop: "0.5rem",
                }}
              >
                <div>
                  <strong>{m.groupName}</strong>{" "}
                  <span
                    style={{
                      padding: "0.1rem 0.4rem",
                      borderRadius: 4,
                      fontSize: "0.85rem",
                      background: "#e0e7ff",
                      color: "#3730a3",
                      marginRight: "0.35rem",
                    }}
                  >
                    {m.type === "POLL" ? "Poll" : "Post"}
                  </span>
                  <span
                    style={{
                      padding: "0.1rem 0.4rem",
                      borderRadius: 4,
                      fontSize: "0.85rem",
                      background:
                        m.status === "SENT"
                          ? "#dcfce7"
                          : m.status === "FAILED"
                            ? "#fee2e2"
                            : "#fef9c3",
                    }}
                  >
                    {m.status}
                  </span>
                </div>
                <div style={{ fontSize: "0.9rem", color: "#475569" }}>
                  {new Date(m.scheduledAt).toLocaleString(undefined, { timeZone: "Asia/Kuala_Lumpur" })}{" "}
                  MYT
                </div>
                {m.type === "POLL" && m.pollQuestion !== null && m.pollQuestion.length > 0 ? (
                  <>
                    <p style={{ fontWeight: 600 }}>{m.pollQuestion}</p>
                    <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.25rem" }}>
                      {(m.pollOptions ?? []).map((o, i) => (
                        <li key={`${m.id}-opt-${String(i)}`}>{o}</li>
                      ))}
                    </ul>
                    {m.pollMultiSelect === true ? <small>Multi-select poll</small> : <small>Single-select poll</small>}
                  </>
                ) : null}
                {m.type !== "POLL" && m.copyText !== null && m.copyText.length > 0 ? <p>{m.copyText}</p> : null}
                {m.type !== "POLL" && m.imageUrl !== null ? <small>Image: {m.imageUrl}</small> : null}
                {m.error !== null ? <p style={{ color: "crimson" }}>{m.error}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
