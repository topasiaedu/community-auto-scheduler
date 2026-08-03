/**
 * Application state, effects, and handlers for NMCAS — single orchestration hook
 * so `App.tsx` stays a thin composition layer.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import type { Session } from "@supabase/supabase-js";
import { isUtcIsoAtLeastSecondsAhead, mytLocalToUtcIso, utcIsoToDatetimeLocalMyt } from "../myt.js";
import { getBrowserSupabase } from "../supabase-client.js";
import {
  ACTIVE_PROJECT_STORAGE_KEY,
  apiPath,
  readStoredProjectId,
} from "../lib/api.js";
import { buildNewScheduleBody, buildPatchDraftBody, type ScheduleFormFields } from "../lib/scheduleBuilders.js";
import {
  dedupeWaGroupsByJid,
  defaultScheduleTime,
  formatRelativeTime,
  formatWaGroupPickerLabel,
  normalizeWaGroupRow,
  waGroupDuplicateListKeySet,
} from "../lib/format.js";
import {
  MIN_LEAD_SECONDS,
  type HealthResponse,
  type MessageKind,
  type ProjectRow,
  type ScheduledMessage,
  type WaGroup,
  type WaStatusResponse,
} from "../types/models.js";

export function useNmcasApp() {
  const supabase = useMemo(() => getBrowserSupabase(), []);
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;
  /** Stable signed-in identity — ignore TOKEN_REFRESHED object churn. */
  const userId = session?.user.id ?? null;
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
  /** Raw WhatsApp multi-device QR payload from `GET /wa/qr` (rendered as SVG in the UI). */
  const [qrPayload, setQrPayload] = useState<string | null>(null);
  const [groups, setGroups] = useState<WaGroup[]>([]);
  /** True while a groups fetch is in flight (or connected with empty list still auto-retrying). */
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [messages, setMessages] = useState<ScheduledMessage[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterType, setFilterType] = useState("");
  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(null);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [prefsApplied, setPrefsApplied] = useState(false);

  const [groupJid, setGroupJid] = useState("");
  const [groupName, setGroupName] = useState("");
  const [messageKind, setMessageKind] = useState<MessageKind>("POST");
  const [copyText, setCopyText] = useState("");
  const [scheduledLocal, setScheduledLocal] = useState(() => defaultScheduleTime());
  const [imagePath, setImagePath] = useState<string | null>(null);
  /** True while POST /uploads/post-image is in flight. */
  const [imageUploading, setImageUploading] = useState(false);
  /** Local blob URL for a file the user just picked (before/while uploading). */
  const [imagePreviewObjectUrl, setImagePreviewObjectUrl] = useState<string | null>(null);
  /** Blob URL for `imagePath` loaded from the API (private bucket). */
  const [imageResolvedUrl, setImageResolvedUrl] = useState<string | null>(null);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [pollMultiSelect, setPollMultiSelect] = useState(false);
  const [sessionResetting, setSessionResetting] = useState(false);
  const [resetSessionConfirming, setResetSessionConfirming] = useState(false);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);

  const scheduleFields = useCallback((): ScheduleFormFields => {
    return {
      messageKind,
      scheduledLocal,
      groupJid,
      groupName,
      copyText,
      imagePath,
      pollQuestion,
      pollOptions,
      pollMultiSelect,
    };
  }, [
    messageKind,
    scheduledLocal,
    groupJid,
    groupName,
    copyText,
    imagePath,
    pollQuestion,
    pollOptions,
    pollMultiSelect,
  ]);

  const clearPostImage = useCallback(() => {
    setImageUploading(false);
    setImagePreviewObjectUrl((prev) => {
      if (prev !== null) {
        URL.revokeObjectURL(prev);
      }
      return null;
    });
    setImageResolvedUrl((prev) => {
      if (prev !== null) {
        URL.revokeObjectURL(prev);
      }
      return null;
    });
    setImagePath(null);
  }, []);

  const authorizedFetch = useCallback(
    async (path: string, init?: RequestInit & { skipProjectHeader?: boolean }) => {
      const headers = new Headers(init?.headers);
      const token = sessionRef.current?.access_token;
      if (typeof token === "string" && token.length > 0) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      if (init?.skipProjectHeader !== true && selectedProjectId.length > 0) {
        headers.set("X-Project-Id", selectedProjectId);
      }
      return fetch(apiPath(path), { ...init, headers });
    },
    [selectedProjectId],
  );

  const fetchPostImageObjectUrl = useCallback(
    async (storagePath: string): Promise<string | null> => {
      if (storagePath.length === 0) {
        return null;
      }
      const res = await authorizedFetch(`/uploads/post-media?path=${encodeURIComponent(storagePath)}`);
      if (!res.ok) {
        return null;
      }
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    },
    [authorizedFetch],
  );

  const fetchMediaObjectUrl = useCallback(
    async (storagePath: string): Promise<string | null> => {
      if (storagePath.length === 0) {
        return null;
      }
      const res = await authorizedFetch(`/uploads/media?path=${encodeURIComponent(storagePath)}`);
      if (!res.ok) {
        return null;
      }
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    },
    [authorizedFetch],
  );

  const composeImageDisplayUrl = useMemo(
    () => imagePreviewObjectUrl ?? imageResolvedUrl,
    [imagePreviewObjectUrl, imageResolvedUrl],
  );

  useEffect(() => {
    if (imagePath === null || imagePath.length === 0) {
      setImageResolvedUrl((prev) => {
        if (prev !== null) {
          URL.revokeObjectURL(prev);
        }
        return null;
      });
      return;
    }
    if (imagePreviewObjectUrl !== null) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await authorizedFetch(`/uploads/post-media?path=${encodeURIComponent(imagePath)}`);
      if (!res.ok || cancelled) {
        return;
      }
      const blob = await res.blob();
      if (cancelled) {
        return;
      }
      const next = URL.createObjectURL(blob);
      setImageResolvedUrl((prev) => {
        if (prev !== null) {
          URL.revokeObjectURL(prev);
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [imagePath, imagePreviewObjectUrl, authorizedFetch]);

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
    const token = sessionRef.current?.access_token;
    if (typeof token !== "string" || token.length === 0) {
      return;
    }
    setProjectsLoading(true);
    setProjectsError(null);
    try {
      const res = await fetch(apiPath("/projects"), {
        headers: { Authorization: `Bearer ${token}` },
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
    } catch {
      setProjectsError("Could not reach the API. Check VITE_API_URL and try again.");
      setProjects([]);
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (supabase === null || userId === null) {
      setProjects([]);
      setProjectsError(null);
      setProjectsLoading(false);
      return;
    }
    void loadProjects();
  }, [supabase, userId, loadProjects]);

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
      /* ignore private mode / blocked storage */
    }
  }, [selectedProjectId]);

  useEffect(() => {
    clearPostImage();
    setEditingDraftId(null);
    setPrefsApplied(false);
    setGroupJid("");
    setGroupName("");
  }, [selectedProjectId, clearPostImage]);

  const refreshHealth = useCallback(() => {
    void fetch(apiPath("/health"))
      .then((r) => r.json() as Promise<HealthResponse>)
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  const refreshWa = useCallback(() => {
    if (sessionRef.current === null || selectedProjectId.length === 0) {
      setWaState(null);
      return;
    }
    void authorizedFetch("/wa/status")
      .then((r) => r.json() as Promise<WaStatusResponse>)
      .then(setWaState)
      .catch(() => setWaState(null));
  }, [authorizedFetch, selectedProjectId]);

  const refreshQrFromServer = useCallback(async () => {
    if (sessionRef.current === null || selectedProjectId.length === 0) {
      setQrPayload(null);
      return;
    }
    try {
      const res = await authorizedFetch("/wa/qr");
      if (res.status === 204) {
        setQrPayload(null);
        return;
      }
      if (!res.ok) {
        setQrPayload(null);
        return;
      }
      const body = (await res.json()) as { qr?: string };
      if (typeof body.qr === "string" && body.qr.length > 0) {
        setQrPayload(body.qr);
      } else {
        setQrPayload(null);
      }
    } catch {
      setQrPayload(null);
    }
  }, [authorizedFetch, selectedProjectId]);

  const refreshGroups = useCallback(
    (forceRefresh = false) => {
      if (sessionRef.current === null || selectedProjectId.length === 0) {
        setGroups([]);
        setGroupsLoading(false);
        return;
      }
      const path = forceRefresh ? "/wa/groups?refresh=1" : "/wa/groups";
      setGroupsLoading(true);
      void authorizedFetch(path)
        .then((r) => r.json() as Promise<{ groups: WaGroup[] }>)
        .then((j) => {
          setGroups(dedupeWaGroupsByJid(j.groups.map((row) => normalizeWaGroupRow(row))));
          setGroupsLoading(false);
        })
        .catch(() => {
          setGroups([]);
          setGroupsLoading(false);
        });
    },
    [authorizedFetch, selectedProjectId],
  );

  const refreshMessages = useCallback(() => {
    if (sessionRef.current === null || selectedProjectId.length === 0) {
      setMessages([]);
      return;
    }
    const params = new URLSearchParams();
    if (filterStatus.length > 0) {
      params.set("status", filterStatus);
    }
    if (filterType.length > 0) {
      params.set("type", filterType);
    }
    const q = params.toString();
    const path = q.length > 0 ? `/messages?${q}` : "/messages";
    void authorizedFetch(path)
      .then((r) => r.json() as Promise<{ messages: ScheduledMessage[] }>)
      .then((j) => setMessages(j.messages))
      .catch(() => setMessages([]));
  }, [authorizedFetch, selectedProjectId, filterStatus, filterType]);

  const loadPreferencesAndApply = useCallback(async () => {
    if (sessionRef.current === null || selectedProjectId.length === 0) {
      return;
    }
    const res = await authorizedFetch("/preferences");
    if (!res.ok) {
      return;
    }
    const j = (await res.json()) as {
      preference?: { lastGroupJid: string | null; lastGroupName: string | null } | null;
    };
    const pref = j.preference;
    if (
      pref !== null &&
      pref !== undefined &&
      pref.lastGroupJid !== null &&
      pref.lastGroupJid.length > 0
    ) {
      setGroupJid(pref.lastGroupJid);
      setGroupName(pref.lastGroupName ?? "");
    }
    setPrefsApplied(true);
  }, [authorizedFetch, selectedProjectId]);

  useEffect(() => {
    if (userId === null || selectedProjectId.length === 0) {
      return;
    }
    void loadPreferencesAndApply();
  }, [userId, selectedProjectId, loadPreferencesAndApply]);

  useEffect(() => {
    if (!prefsApplied || groups.length === 0 || groupJid.length === 0) {
      return;
    }
    const g = groups.find((x) => x.jid === groupJid);
    if (g !== undefined && groupName.length === 0) {
      setGroupName(g.label ?? g.name);
    }
  }, [prefsApplied, groups, groupJid, groupName.length]);

  const groupDuplicateNames = useMemo(() => waGroupDuplicateListKeySet(groups), [groups]);

  /** Disambiguated label for UI (preview, etc.) when multiple groups share the same WhatsApp title. */
  const groupPickerLabel = useMemo(() => {
    if (groupJid.length === 0) {
      return "";
    }
    const g = groups.find((x) => x.jid === groupJid);
    if (g !== undefined) {
      return formatWaGroupPickerLabel(g, groupDuplicateNames);
    }
    return groupName.length > 0 ? groupName : "";
  }, [groups, groupJid, groupName, groupDuplicateNames]);

  const persistGroupPreference = useCallback(
    (jid: string, name: string) => {
      if (sessionRef.current === null || selectedProjectId.length === 0 || jid.length === 0) {
        return;
      }
      void authorizedFetch("/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastGroupJid: jid, lastGroupName: name }),
      });
    },
    [authorizedFetch, selectedProjectId],
  );

  const resetWaSession = useCallback(async () => {
    if (sessionRef.current === null || selectedProjectId.length === 0) {
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
  }, [authorizedFetch, refreshQrFromServer, refreshWa, selectedProjectId]);

  const onClickResetSession = () => {
    setResetSessionConfirming(true);
  };

  const onConfirmResetSession = () => {
    setResetSessionConfirming(false);
    void resetWaSession();
  };

  const onDismissResetSession = () => {
    setResetSessionConfirming(false);
  };

  useEffect(() => {
    refreshHealth();
  }, [refreshHealth]);

  /**
   * Poll WA status sparingly when linked — constant 3s polls mirror OpenClaw's anti-pattern (HTTP churn
   * against a gateway-owned socket). Fast while pairing; slow when connected to cut API/Baileys load.
   */
  useEffect(() => {
    refreshWa();
    const pollMs = waState?.state === "connected" ? 20_000 : 4000;
    const t = window.setInterval(refreshWa, pollMs);
    return () => window.clearInterval(t);
  }, [refreshWa, waState?.state]);

  useEffect(() => {
    if (waState?.state === "connected") {
      setQrPayload(null);
      return undefined;
    }
    void refreshQrFromServer();
    const pollMs =
      waState?.hasQr === true && qrPayload === null ? 1000 : 3000;
    const t = window.setInterval(() => {
      void refreshQrFromServer();
    }, pollMs);
    return () => window.clearInterval(t);
  }, [refreshQrFromServer, waState?.state, waState?.hasQr, qrPayload]);

  useEffect(() => {
    if (waState?.state === "connected") {
      refreshGroups();
    } else {
      setGroups([]);
      setGroupsLoading(false);
    }
  }, [waState?.state, refreshGroups]);

  // Belt-and-suspenders: re-load groups whenever project changes while WA is connected.
  // This fixes the race where waState becomes "connected" before selectedProjectId is set.
  useEffect(() => {
    if (userId !== null && selectedProjectId.length > 0 && waState?.state === "connected") {
      refreshGroups();
    }
  }, [userId, selectedProjectId, waState?.state, refreshGroups]);

  /**
   * While connected with an empty catalog, auto-retry a few times so Schedule destinations
   * populate without requiring a WhatsApp "Load groups" click (cold cache / race after connect).
   */
  useEffect(() => {
    if (userId === null || selectedProjectId.length === 0 || waState?.state !== "connected") {
      return undefined;
    }
    if (groups.length > 0) {
      return undefined;
    }
    let attempts = 0;
    const maxAttempts = 6;
    const retryMs = 5_000;
    const t = window.setInterval(() => {
      attempts += 1;
      refreshGroups(true);
      if (attempts >= maxAttempts) {
        window.clearInterval(t);
      }
    }, retryMs);
    return () => window.clearInterval(t);
  }, [userId, selectedProjectId, waState?.state, groups.length, refreshGroups]);

  useEffect(() => {
    refreshMessages();
    const t = window.setInterval(refreshMessages, 8000);
    return () => window.clearInterval(t);
  }, [refreshMessages]);

  const loadFormFromMessage = useCallback((m: ScheduledMessage) => {
    setMessageKind(m.type === "POLL" ? "POLL" : "POST");
    setGroupJid(m.groupJid);
    setGroupName(m.groupName);
    setCopyText(m.copyText ?? "");
    setScheduledLocal(utcIsoToDatetimeLocalMyt(m.scheduledAt));
    setImagePreviewObjectUrl((prev) => {
      if (prev !== null) {
        URL.revokeObjectURL(prev);
      }
      return null;
    });
    setImageResolvedUrl((prev) => {
      if (prev !== null) {
        URL.revokeObjectURL(prev);
      }
      return null;
    });
    setImagePath(m.imageUrl);
    setPollQuestion(m.pollQuestion ?? "");
    const opts = m.pollOptions ?? [];
    setPollOptions(opts.length >= 2 ? [...opts] : [...opts, "", ""].slice(0, 12));
    setPollMultiSelect(m.pollMultiSelect);
    setFormError(null);
  }, []);

  const clearScheduleForm = useCallback(() => {
    setCopyText("");
    setScheduledLocal(defaultScheduleTime());
    clearPostImage();
    setPollQuestion("");
    setPollOptions(["", ""]);
    setPollMultiSelect(false);
    setEditingDraftId(null);
    setFormError(null);
  }, [clearPostImage]);

  const onGroupSelect = (jid: string) => {
    setGroupJid(jid);
    const g = groups.find((x) => x.jid === jid);
    const display = g !== undefined ? (g.label ?? g.name) : "";
    setGroupName(display);
    if (jid.length > 0) {
      persistGroupPreference(jid, display);
    }
  };

  const clearImagePreviewBlob = useCallback(() => {
    setImagePreviewObjectUrl((prev) => {
      if (prev !== null) {
        URL.revokeObjectURL(prev);
      }
      return null;
    });
  }, []);

  const onUploadImage = (file: File | undefined) => {
    if (file === undefined) {
      return;
    }
    if (session === null || selectedProjectId.length === 0) {
      setFormError("Sign in and pick a project before uploading.");
      return;
    }
    /** Matches API `MAX_BYTES` (16 MB). Larger files never leave the browser. */
    const maxUploadBytes = 16 * 1024 * 1024;
    if (file.size > maxUploadBytes) {
      setFormError("Image exceeds 16 MB. Compress or resize it, then try again.");
      return;
    }
    setFormError(null);
    clearImagePreviewBlob();
    setImagePreviewObjectUrl(URL.createObjectURL(file));
    setImageUploading(true);
    void (async () => {
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await authorizedFetch("/uploads/post-image", {
          method: "POST",
          body: fd,
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          clearImagePreviewBlob();
          if (res.status === 413) {
            setFormError(
              "Image rejected as too large by the upload proxy (413). On the API host set nginx client_max_body_size 16m and reload, or use a smaller image.",
            );
            return;
          }
          setFormError(err.error ?? `Image upload failed (${String(res.status)}). Try again.`);
          return;
        }
        const j = (await res.json()) as { path?: string };
        if (typeof j.path !== "string" || j.path.length === 0) {
          clearImagePreviewBlob();
          setFormError("Image upload failed — server did not return a storage path. Try again.");
          return;
        }
        clearImagePreviewBlob();
        setImagePath(j.path);
      } catch (e) {
        clearImagePreviewBlob();
        // nginx 413 HTML often lacks CORS headers → browser throws "Failed to fetch".
        if (file.size > 1024 * 1024) {
          setFormError(
            "Upload failed — likely nginx 413 (body too large; default limit is 1 MB). Set client_max_body_size 16m on nmcas-server and reload nginx, or try a smaller image.",
          );
          return;
        }
        setFormError(e instanceof Error ? e.message : "Image upload failed. Try again.");
      } finally {
        setImageUploading(false);
      }
    })();
  };

  const buildScheduleOrDraftBody = (): Record<string, unknown> | null => {
    const result = buildNewScheduleBody(scheduleFields());
    if (!result.ok) {
      setFormError(result.error);
      return null;
    }
    return result.body;
  };

  const buildPatchDraftBodyInner = (publish: boolean): Record<string, unknown> | null => {
    const result = buildPatchDraftBody(scheduleFields(), publish);
    if (!result.ok) {
      setFormError(result.error);
      return null;
    }
    return result.body;
  };

  const onSaveDraftOnly = () => {
    if (editingDraftId === null) {
      return;
    }
    setFormError(null);
    const body = buildPatchDraftBodyInner(false);
    if (body === null) {
      return;
    }
    setSubmitting(true);
    void (async () => {
      const res = await authorizedFetch(`/messages/${editingDraftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setSubmitting(false);
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setFormError(err.error ?? `Save failed (${String(res.status)})`);
        return;
      }
      toast("Draft saved.");
      refreshMessages();
    })();
  };

  const onSchedule = () => {
    setFormError(null);
    if (session === null || selectedProjectId.length === 0) {
      setFormError("Sign in and pick a project.");
      return;
    }
    if (waState?.state !== "connected") {
      setFormError("Connect WhatsApp first (see Link WhatsApp).");
      return;
    }
    if (groupJid.length === 0 || groupName.length === 0) {
      setFormError("Pick a WhatsApp group.");
      return;
    }

    let scheduledAtIso: string;
    try {
      scheduledAtIso = mytLocalToUtcIso(scheduledLocal);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Invalid time");
      return;
    }
    if (!isUtcIsoAtLeastSecondsAhead(scheduledAtIso, MIN_LEAD_SECONDS)) {
      setFormError(`Choose a send time at least ${String(MIN_LEAD_SECONDS)} seconds from now (Malaysia time).`);
      return;
    }

    if (editingDraftId !== null) {
      const patchBody = buildPatchDraftBodyInner(true);
      if (patchBody === null) {
        return;
      }
      setSubmitting(true);
      void (async () => {
        const res = await authorizedFetch(`/messages/${editingDraftId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patchBody),
        });
        setSubmitting(false);
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          setFormError(err.error ?? `Schedule failed (${String(res.status)})`);
          return;
        }
        const scheduledAtPatch = patchBody.scheduledAt;
        if (typeof scheduledAtPatch === "string") {
          toast(`Scheduled for ${formatRelativeTime(scheduledAtPatch)} MYT`);
        } else {
          toast("Message scheduled.");
        }
        clearScheduleForm();
        refreshMessages();
      })();
      return;
    }

    const body = buildScheduleOrDraftBody();
    if (body === null) {
      return;
    }
    const scheduledAtVal = body.scheduledAt;
    if (typeof scheduledAtVal !== "string" || !isUtcIsoAtLeastSecondsAhead(scheduledAtVal, MIN_LEAD_SECONDS)) {
      setFormError(`Choose a send time at least ${String(MIN_LEAD_SECONDS)} seconds from now (Malaysia time).`);
      return;
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
      if (typeof scheduledAtVal === "string") {
        toast(`Scheduled for ${formatRelativeTime(scheduledAtVal)} MYT`);
      } else {
        toast("Message scheduled.");
      }
      clearScheduleForm();
      refreshMessages();
    })();
  };

  const onStartEditPending = (m: ScheduledMessage) => {
    if (m.status !== "PENDING") {
      return;
    }
    void (async () => {
      const res = await authorizedFetch(`/messages/${m.id}/draft`, { method: "POST" });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setFormError(err.error ?? "Could not move to draft");
        return;
      }
      loadFormFromMessage(m);
      setEditingDraftId(m.id);
      refreshMessages();
    })();
  };

  const requestCancelMessage = (id: string) => {
    setCancelConfirmId(id);
  };

  const dismissCancelConfirm = () => {
    setCancelConfirmId(null);
  };

  const onCancelMessage = (m: ScheduledMessage) => {
    if (m.status !== "PENDING" && m.status !== "DRAFT") {
      return;
    }
    void (async () => {
      const res = await authorizedFetch(`/messages/${m.id}/cancel`, { method: "POST" });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setFormError(err.error ?? "Cancel failed");
        setCancelConfirmId(null);
        return;
      }
      if (editingDraftId === m.id) {
        clearScheduleForm();
      }
      setCancelConfirmId(null);
      toast("Send cancelled.");
      refreshMessages();
    })();
  };

  /** Enqueue (or replace) pg-boss job — required after manual DB edits or stuck SENDING. */
  const onRequeueMessage = (m: ScheduledMessage) => {
    if (m.status !== "PENDING" && m.status !== "SENDING" && m.status !== "FAILED") {
      return;
    }
    void (async () => {
      const res = await authorizedFetch(`/messages/${m.id}/requeue`, { method: "POST" });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setFormError(err.error ?? "Re-queue failed");
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { fireAt?: string };
      const fireAtIso = typeof body.fireAt === "string" ? body.fireAt : null;
      if (fireAtIso !== null) {
        toast(`Send job re-queued (${formatRelativeTime(fireAtIso)} MYT)`);
      } else {
        toast("Send job re-queued.");
      }
      refreshMessages();
    })();
  };

  const onContinueDraft = (m: ScheduledMessage) => {
    if (m.status !== "DRAFT") {
      return;
    }
    loadFormFromMessage(m);
    setEditingDraftId(m.id);
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
    clearPostImage();
    void supabase.auth.signOut();
    setProjects([]);
    setSelectedProjectId("");
    setWaState(null);
    setMessages([]);
    setEditingDraftId(null);
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

  const waConnected = waState?.state === "connected" && waState?.hasQr !== true;
  const waConnecting = waState?.state === "connecting" || waState?.hasQr === true;
  const showLinkHelp = waState !== null && !waConnected;
  const waStatusUnavailable = waState === null;

  const canUseApiRoutes =
    supabase !== null && session !== null && selectedProjectId.length > 0 && projectsError === null;

  const selectedProjectName = projects.find((p) => p.id === selectedProjectId)?.name ?? "";

  return {
    supabase,
    session,
    authReady,
    projects,
    projectsLoading,
    projectsError,
    selectedProjectId,
    setSelectedProjectId,
    email,
    setEmail,
    password,
    setPassword,
    authMode,
    setAuthMode,
    authSubmitting,
    authFormError,
    newProjectName,
    setNewProjectName,
    newProjectDescription,
    setNewProjectDescription,
    createProjectSubmitting,
    createProjectError,
    health,
    refreshHealth,
    waState,
    qrPayload,
    groups,
    groupsLoading,
    messages,
    formError,
    submitting,
    filterStatus,
    setFilterStatus,
    filterType,
    setFilterType,
    expandedMessageId,
    setExpandedMessageId,
    editingDraftId,
    groupJid,
    groupName,
    groupPickerLabel,
    groupDuplicateNames,
    messageKind,
    setMessageKind,
    copyText,
    setCopyText,
    scheduledLocal,
    setScheduledLocal,
    imagePath,
    imageUploading,
    composeImageDisplayUrl,
    clearPostImage,
    fetchPostImageObjectUrl,
    fetchMediaObjectUrl,
    pollQuestion,
    setPollQuestion,
    pollOptions,
    setPollOptions,
    pollMultiSelect,
    setPollMultiSelect,
    sessionResetting,
    resetSessionConfirming,
    cancelConfirmId,
    requestCancelMessage,
    dismissCancelConfirm,
    waConnected,
    waConnecting,
    showLinkHelp,
    waStatusUnavailable,
    canUseApiRoutes,
    selectedProjectName,
    authorizedFetch,
    refreshWa,
    refreshQrFromServer,
    refreshGroups,
    refreshMessages,
    onClickResetSession,
    onConfirmResetSession,
    onDismissResetSession,
    onGroupSelect,
    onUploadImage,
    setFormError,
    onSaveDraftOnly,
    onSchedule,
    onStartEditPending,
    onCancelMessage,
    onRequeueMessage,
    onContinueDraft,
    clearScheduleForm,
    onSubmitAuth,
    onSignOut,
    onCreateProject,
    loadProjects,
    MIN_LEAD_SECONDS,
  };
}

export type NmcasViewModel = ReturnType<typeof useNmcasApp>;
