import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  ChevronDown,
  Clipboard,
  Code2,
  Copy,
  Eye,
  History,
  LogOut,
  Play,
  Plus,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Terminal,
  Trash2,
  Wand2,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const TOOL_TAGS = ["Cursor", "Claude", "GPT-4", "OpenAI"];
const TOOL_TAG_DISPLAY = { Claude: "Gemini" };

const emptyForm = {
  title: "",
  system_context: "",
  prompt_template: "",
  tool_tag: "Cursor",
  workspace_id: "",
};

const tagStyles = {
  Cursor: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  Claude: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  "GPT-4": "border-indigo-500/30 bg-indigo-500/10 text-indigo-300",
  OpenAI: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200",
};

function extractVariables(template = "") {
  const matches = [...template.matchAll(/\{\{\s*([a-zA-Z_][\w.-]*)\s*\}\}/g)];
  return [...new Set(matches.map((match) => match[1]))];
}

function compilePrompt(template = "", values = {}) {
  return template.replace(/\{\{\s*([a-zA-Z_][\w.-]*)\s*\}\}/g, (_, key) => {
    const value = values[key];
    return value?.trim() ? value : `{{${key}}}`;
  });
}

async function getErrorMessage(response) {
  const text = await response.text().catch(() => "");
  if (!text) return "Request failed";

  try {
    const body = JSON.parse(text);
    const detail = body.detail ?? body.error ?? body.message;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) return detail.map((item) => (typeof item === "string" ? item : JSON.stringify(item))).join("; ");
    if (typeof detail === "object") return JSON.stringify(detail);
    return text;
  } catch {
    return text;
  }
}

function codeSnippet(format, prompt) {
  const escaped = JSON.stringify(prompt);
  if (format === "python") {
    return `from openai import OpenAI\n\nclient = OpenAI()\nresponse = client.chat.completions.create(\n    model="gpt-4o-mini",\n    messages=[{"role": "user", "content": ${escaped}}],\n)\nprint(response.choices[0].message.content)`;
  }
  if (format === "langchain") {
    return `import { ChatOpenAI } from "@langchain/openai";\n\nconst model = new ChatOpenAI({ model: "gpt-4o-mini" });\nconst response = await model.invoke(${escaped});\nconsole.log(response.content);`;
  }
  return `curl https://api.openai.com/v1/chat/completions \\\n  -H "Authorization: Bearer $OPENAI_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":${escaped}}]}'`;
}

function displayTag(tag) {
  return TOOL_TAG_DISPLAY[tag] ?? tag;
}

function nextVersionLabel(items = []) {
  const used = new Set(items.map((item) => item.version_label));
  for (let index = items.length + 1; index < items.length + 50; index += 1) {
    const label = `v${index}.0`;
    if (!used.has(label)) return label;
  }
  return `v${Date.now()}`;
}

function TagBadge({ tag, active = false, onClick }) {
  const classes = `inline-flex h-6 items-center rounded-full border px-2 text-[11px] font-semibold ${tagStyles[tag]}`;
  if (!onClick) return <span className={classes}>{displayTag(tag)}</span>;
  return (
    <button type="button" onClick={onClick} className={`${classes} ${active ? "ring-1 ring-emerald-400/70" : ""}`}>
      {displayTag(tag)}
    </button>
  );
}

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ email: "", password: "", full_name: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const isLogin = mode === "login";
      const response = await fetch(`${API_URL}/auth/${isLogin ? "login" : "register"}`, {
        method: "POST",
        headers: isLogin ? { "Content-Type": "application/x-www-form-urlencoded" } : { "Content-Type": "application/json" },
        body: isLogin
          ? new URLSearchParams({ username: form.email, password: form.password })
          : JSON.stringify(form),
      });
      if (!response.ok) throw new Error(await getErrorMessage(response));
      onAuth(await response.json());
    } catch (caught) {
      setError(String(caught.message || caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid h-screen place-items-center bg-slate-950 px-4 text-slate-100">
      <form onSubmit={submit} className="w-full max-w-sm rounded-md border border-slate-800 bg-slate-900 p-5 shadow-glow">
        <div className="mb-5 flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-md border border-emerald-500/30 bg-emerald-500/10">
            <Sparkles className="h-4 w-4 text-emerald-300" />
          </div>
          <div>
            <h1 className="text-sm font-semibold">PromptVault Pro</h1>
            <p className="text-xs text-slate-500">{mode === "login" ? "Sign in" : "Create account"}</p>
          </div>
        </div>
        {error && <div className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>}
        {mode === "register" && (
          <input
            required
            value={form.full_name}
            onChange={(event) => setForm({ ...form, full_name: event.target.value })}
            placeholder="Full name"
            className="mb-2 h-10 w-full rounded-md border border-slate-800 bg-slate-950 px-3 text-sm outline-none focus:border-emerald-500/70"
          />
        )}
        <input
          required
          type="email"
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
          placeholder="Email"
          className="mb-2 h-10 w-full rounded-md border border-slate-800 bg-slate-950 px-3 text-sm outline-none focus:border-emerald-500/70"
        />
        <input
          required
          type="password"
          minLength={8}
          value={form.password}
          onChange={(event) => setForm({ ...form, password: event.target.value })}
          placeholder="Password"
          className="mb-3 h-10 w-full rounded-md border border-slate-800 bg-slate-950 px-3 text-sm outline-none focus:border-emerald-500/70"
        />
        <button disabled={busy} className="h-10 w-full rounded-md bg-emerald-500 text-sm font-semibold text-slate-950 disabled:opacity-60">
          {busy ? "Working..." : mode === "login" ? "Log In" : "Register"}
        </button>
        <button type="button" onClick={() => setMode(mode === "login" ? "register" : "login")} className="mt-3 w-full text-xs text-slate-400">
          {mode === "login" ? "Need an account? Register" : "Already have an account? Log in"}
        </button>
      </form>
    </div>
  );
}

function App() {
  const savedToken = localStorage.getItem("promptvault_token");
  const savedUser = localStorage.getItem("promptvault_user");
  const [token, setToken] = useState(savedToken);
  const [user, setUser] = useState(savedUser ? JSON.parse(savedUser) : null);
  const [prompts, setPrompts] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [tab, setTab] = useState("prompt");
  const [searchTerm, setSearchTerm] = useState("");
  const [tagFilter, setTagFilter] = useState(null);
  const [variables, setVariables] = useState({});
  const [form, setForm] = useState(emptyForm);
  const [draft, setDraft] = useState(emptyForm);
  const [versions, setVersions] = useState([]);
  const [versionLabel, setVersionLabel] = useState("");
  const [consoleOutput, setConsoleOutput] = useState("");
  const [snippetFormat, setSnippetFormat] = useState("python");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const activePrompt = useMemo(() => prompts.find((prompt) => prompt.id === activeId) ?? prompts[0] ?? null, [prompts, activeId]);
  const detectedVariables = useMemo(() => extractVariables(activePrompt?.prompt_template), [activePrompt?.prompt_template]);
  const compiledPrompt = useMemo(() => compilePrompt(activePrompt?.prompt_template, variables), [activePrompt?.prompt_template, variables]);
  const snippet = useMemo(() => codeSnippet(snippetFormat, compiledPrompt), [snippetFormat, compiledPrompt]);

  function authHeaders(extra = {}) {
    return { ...extra, Authorization: `Bearer ${token}` };
  }

  async function api(path, options = {}) {
    let response;
    try {
      response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: authHeaders(options.headers || {}),
      });
    } catch (caught) {
      throw new Error(`Could not reach the API at ${API_URL}. Make sure the backend server is running.`);
    }
    if (response.status === 401) logout();
    if (!response.ok) throw new Error(await getErrorMessage(response));
    if (response.status === 204) return null;
    return response.json();
  }

  function onAuth(payload) {
    localStorage.setItem("promptvault_token", payload.access_token);
    localStorage.setItem("promptvault_user", JSON.stringify(payload.user));
    setToken(payload.access_token);
    setUser(payload.user);
  }

  function logout() {
    localStorage.removeItem("promptvault_token");
    localStorage.removeItem("promptvault_user");
    setToken(null);
    setUser(null);
  }

  async function loadData() {
    if (!token) return;
    setError("");
    try {
      const params = new URLSearchParams();
      if (searchTerm.trim()) params.set("search", searchTerm.trim());
      if (tagFilter) params.set("tool_tag", tagFilter);
      const [promptData, workspaceData, analyticsData] = await Promise.all([
        api(`/prompts?${params.toString()}`),
        api("/workspaces"),
        api("/analytics"),
      ]);
      setPrompts(promptData);
      setWorkspaces(workspaceData);
      setAnalytics(analyticsData);
      setActiveId((current) => (promptData.some((prompt) => prompt.id === current) ? current : promptData[0]?.id ?? null));
    } catch (caught) {
      setError(caught.message);
    }
  }

  async function loadVersions(promptId = activePrompt?.id) {
    if (!promptId) return [];
    const data = await api(`/prompts/${promptId}/versions`);
    setVersions(data);
    setVersionLabel(nextVersionLabel(data));
    return data;
  }

  useEffect(() => {
    const timer = window.setTimeout(loadData, 160);
    return () => window.clearTimeout(timer);
  }, [token, searchTerm, tagFilter]);

  useEffect(() => {
    if (!activePrompt) return;
    setDraft({
      title: activePrompt.title,
      system_context: activePrompt.system_context || "",
      prompt_template: activePrompt.prompt_template,
      tool_tag: activePrompt.tool_tag,
      visibility: activePrompt.visibility,
      workspace_id: activePrompt.workspace_id || "",
    });
    loadVersions(activePrompt.id).catch((caught) => setError(caught.message));
    const next = {};
    extractVariables(activePrompt.prompt_template).forEach((key) => {
      next[key] = variables[key] ?? "";
    });
    setVariables(next);
  }, [activePrompt?.id]);

  async function createPrompt(event) {
    event.preventDefault();
    setBusy("create");
    try {
      const payload = { ...form, workspace_id: form.workspace_id ? Number(form.workspace_id) : null };
      const created = await api("/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setForm(emptyForm);
      setPrompts([created, ...prompts]);
      setActiveId(created.id);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy("");
    }
  }

  async function saveDraft() {
    if (!activePrompt) return;
    setBusy("save");
    try {
      const updated = await api(`/prompts/${activePrompt.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, workspace_id: draft.workspace_id ? Number(draft.workspace_id) : null }),
      });
      setPrompts(prompts.map((prompt) => (prompt.id === updated.id ? updated : prompt)));
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy("");
    }
  }

  async function saveVersion() {
    if (!activePrompt || !versionLabel.trim()) return;
    setBusy("version");
    setError("");
    try {
      const version = await api(`/prompts/${activePrompt.id}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version_label: versionLabel.trim() }),
      });
      const next = [version, ...versions];
      setVersions(next);
      setVersionLabel(nextVersionLabel(next));
    } catch (caught) {
      setError(caught.message);
      setVersionLabel(nextVersionLabel(versions));
    } finally {
      setBusy("");
    }
  }

  async function rollback(versionId) {
    setBusy("rollback");
    setError("");
    try {
      const updated = await api(`/prompts/${activePrompt.id}/versions/${versionId}/rollback`, { method: "POST" });
      setPrompts(prompts.map((prompt) => (prompt.id === updated.id ? updated : prompt)));
      setDraft({
        title: updated.title,
        system_context: updated.system_context || "",
        prompt_template: updated.prompt_template,
        tool_tag: updated.tool_tag,
        visibility: updated.visibility,
        workspace_id: updated.workspace_id || "",
      });
      await loadVersions(updated.id);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy("");
    }
  }

  async function runTest() {
    setBusy("run");
    setConsoleOutput("");
    try {
      const provider = activePrompt?.tool_tag === "Claude" ? "google" : "openai";
      const result = await api(`/prompts/${activePrompt.id}/run-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variables, provider }),
      });
      setConsoleOutput(`model: ${result.model}\n\n${result.response}`);
      loadData();
    } catch (caught) {
      setConsoleOutput(caught.message);
    } finally {
      setBusy("");
    }
  }

  async function optimizeDraft() {
    setBusy("optimize");
    try {
      const result = await api("/ai/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: draft.prompt_template, system_context: draft.system_context }),
      });
      setDraft({ ...draft, prompt_template: result.optimized_prompt });
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy("");
    }
  }

  async function copyCompiled() {
    await navigator.clipboard.writeText(compiledPrompt);
    const stats = await api(`/prompts/${activePrompt.id}/copy`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(variables),
    });
    setPrompts(prompts.map((prompt) => (prompt.id === stats.id ? { ...prompt, times_copied: stats.times_copied } : prompt)));
    loadData();
  }

  async function deletePrompt() {
    await api(`/prompts/${activePrompt.id}`, { method: "DELETE" });
    setPrompts(prompts.filter((prompt) => prompt.id !== activePrompt.id));
    setActiveId(null);
  }

  if (!token) return <AuthScreen onAuth={onAuth} />;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-950 text-slate-100">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950/95 px-5">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-md border border-emerald-500/30 bg-emerald-500/10">
            <Sparkles className="h-4 w-4 text-emerald-300" />
          </div>
          <div>
            <h1 className="text-sm font-semibold">PromptVault <span className="text-slate-500">//</span> Pro</h1>
            <p className="text-xs text-slate-500">{user?.full_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setTab("analytics")} className="grid h-9 w-9 place-items-center rounded-md border border-slate-800 text-slate-400 hover:text-emerald-300" title="Analytics">
            <BarChart3 className="h-4 w-4" />
          </button>
          <button onClick={logout} className="grid h-9 w-9 place-items-center rounded-md border border-slate-800 text-slate-400 hover:text-red-300" title="Log out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-[390px_minmax(0,1fr)] overflow-hidden">
        <aside className="flex min-h-0 flex-col border-r border-slate-800">
          <div className="space-y-3 border-b border-slate-800 p-4">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search prompts" className="h-10 w-full rounded-md border border-slate-800 bg-slate-900 pl-9 pr-3 text-sm outline-none focus:border-emerald-500/70" />
            </label>
            <div className="flex flex-wrap gap-2">
              {TOOL_TAGS.map((tag) => <TagBadge key={tag} tag={tag} active={tagFilter === tag} onClick={() => setTagFilter(tagFilter === tag ? null : tag)} />)}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="space-y-2">
              {prompts.map((prompt) => (
                <button key={prompt.id} type="button" onClick={() => { setActiveId(prompt.id); setTab("prompt"); }} className={`w-full rounded-md border p-3 text-left ${activePrompt?.id === prompt.id ? "border-emerald-500/40 bg-slate-900 shadow-glow" : "border-slate-800 bg-slate-900/70 hover:border-slate-700"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="line-clamp-2 text-sm font-semibold">{prompt.title}</h2>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-700 px-2 py-0.5 text-[11px] text-slate-400"><Clipboard className="h-3 w-3" />{prompt.times_copied}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <TagBadge tag={prompt.tool_tag} />
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                      {extractVariables(prompt.prompt_template).length} vars
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={createPrompt} className="space-y-2 border-t border-slate-800 bg-slate-950 p-3">
            <div className="flex items-center justify-between text-xs font-semibold uppercase text-slate-500"><span>New Prompt</span><ChevronDown className="h-4 w-4" /></div>
            <input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Title" className="h-9 w-full rounded-md border border-slate-800 bg-slate-900 px-3 text-sm outline-none focus:border-emerald-500/70" />
            <div className="grid grid-cols-2 gap-2">
              <select value={form.tool_tag} onChange={(event) => setForm({ ...form, tool_tag: event.target.value })} className="h-9 rounded-md border border-slate-800 bg-slate-900 px-3 text-sm outline-none">
                {TOOL_TAGS.map((tag) => <option key={tag} value={tag}>{displayTag(tag)}</option>)}
              </select>
            </div>
            <textarea value={form.system_context} onChange={(event) => setForm({ ...form, system_context: event.target.value })} placeholder="System context" rows={2} className="w-full resize-none rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm outline-none" />
            <textarea required value={form.prompt_template} onChange={(event) => setForm({ ...form, prompt_template: event.target.value })} placeholder="Prompt template with {{variables}}" rows={3} className="w-full resize-none rounded-md border border-slate-800 bg-slate-900 px-3 py-2 font-mono text-sm outline-none" />
            <button disabled={busy === "create"} className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-emerald-500 text-sm font-semibold text-slate-950 disabled:opacity-60"><Plus className="h-4 w-4" />Create</button>
          </form>
        </aside>

        <section className="min-h-0 overflow-y-auto p-5">
          {error && <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>}
          {tab === "analytics" ? (
            <div className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
                  <h2 className="mb-4 text-sm font-semibold">Copy Frequency</h2>
                  <div className="h-72"><ResponsiveContainer><LineChart data={analytics?.copies_over_time || []}><CartesianGrid stroke="#1e293b" /><XAxis dataKey="label" stroke="#64748b" /><YAxis stroke="#64748b" allowDecimals={false} /><Tooltip /><Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} /></LineChart></ResponsiveContainer></div>
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
                  <h2 className="mb-4 text-sm font-semibold">Tag Performance</h2>
                  <div className="h-72"><ResponsiveContainer><BarChart data={analytics?.tag_performance || []}><CartesianGrid stroke="#1e293b" /><XAxis dataKey="label" stroke="#64748b" /><YAxis stroke="#64748b" allowDecimals={false} /><Tooltip /><Bar dataKey="value" fill="#6366f1" /></BarChart></ResponsiveContainer></div>
                </div>
              </div>
              <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
                <h2 className="mb-4 text-sm font-semibold">Variable Usage</h2>
                <div className="h-64"><ResponsiveContainer><BarChart data={analytics?.variable_usage || []}><CartesianGrid stroke="#1e293b" /><XAxis dataKey="label" stroke="#64748b" /><YAxis stroke="#64748b" allowDecimals={false} /><Tooltip /><Bar dataKey="value" fill="#f59e0b" /></BarChart></ResponsiveContainer></div>
              </div>
            </div>
          ) : !activePrompt ? (
            <div className="grid h-full place-items-center text-sm text-slate-500">Create your first prompt.</div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {["prompt", "test", "code", "history"].map((item) => (
                    <button key={item} onClick={() => setTab(item)} className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm ${tab === item ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-200" : "border-slate-800 bg-slate-900 text-slate-400"}`}>
                      {item === "prompt" && <Eye className="h-4 w-4" />}{item === "test" && <Terminal className="h-4 w-4" />}{item === "code" && <Code2 className="h-4 w-4" />}{item === "history" && <History className="h-4 w-4" />}{item}
                    </button>
                  ))}
                </div>
                <button onClick={deletePrompt} className="grid h-9 w-9 place-items-center rounded-md border border-slate-800 text-slate-500 hover:border-red-500/40 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
              </div>

              {tab === "prompt" && (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="space-y-3 rounded-md border border-slate-800 bg-slate-900 p-4">
                    <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="h-10 w-full rounded-md border border-slate-800 bg-slate-950 px-3 text-sm font-semibold outline-none" />
                    <div className="grid grid-cols-2 gap-2">
                      <select value={draft.tool_tag} onChange={(event) => setDraft({ ...draft, tool_tag: event.target.value })} className="h-10 rounded-md border border-slate-800 bg-slate-950 px-3 text-sm outline-none">{TOOL_TAGS.map((tag) => <option key={tag} value={tag}>{displayTag(tag)}</option>)}</select>
                      <select value={draft.workspace_id} onChange={(event) => setDraft({ ...draft, workspace_id: event.target.value })} className="h-10 rounded-md border border-slate-800 bg-slate-950 px-3 text-sm outline-none"><option value="">No workspace</option>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select>
                    </div>
                    <textarea value={draft.system_context} onChange={(event) => setDraft({ ...draft, system_context: event.target.value })} rows={4} className="w-full resize-none rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm outline-none" />
                    <textarea value={draft.prompt_template} onChange={(event) => setDraft({ ...draft, prompt_template: event.target.value })} rows={11} className="w-full resize-none rounded-md border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-sm outline-none" />
                    <div className="flex justify-end gap-2">
                      <button onClick={optimizeDraft} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-700 px-3 text-sm"><Wand2 className="h-4 w-4" />Sparkle</button>
                      <button onClick={saveDraft} className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-500 px-3 text-sm font-semibold text-slate-950"><Save className="h-4 w-4" />Save</button>
                    </div>
                  </div>
                  <div className="rounded-md border border-slate-800 bg-slate-950">
                    <div className="border-b border-slate-800 px-3 py-2 text-xs font-semibold uppercase text-slate-500">Variables</div>
                    <div className="space-y-3 p-4">
                      {detectedVariables.map((key) => <label key={key} className="block"><span className="mb-1 block text-xs text-slate-400">{key}</span><input value={variables[key] ?? ""} onChange={(event) => setVariables({ ...variables, [key]: event.target.value })} className="h-10 w-full rounded-md border border-slate-800 bg-slate-900 px-3 text-sm outline-none" /></label>)}
                      {detectedVariables.length === 0 && <p className="text-sm text-slate-500">No variables detected.</p>}
                    </div>
                  </div>
                </div>
              )}

              {tab === "test" && (
                <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
                  <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
                    <h2 className="mb-3 text-sm font-semibold">Compiled Prompt</h2>
                    <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap font-mono text-sm text-slate-300">{compiledPrompt}</pre>
                    <button onClick={runTest} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-indigo-500 text-sm font-semibold"><Play className="h-4 w-4" />Run Test</button>
                  </div>
                  <pre className="min-h-[32rem] whitespace-pre-wrap rounded-md border border-slate-800 bg-black p-4 font-mono text-sm leading-6 text-emerald-200">{busy === "run" ? "Running..." : consoleOutput || "$ waiting for run"}</pre>
                </div>
              )}

              {tab === "code" && (
                <div className="rounded-md border border-slate-800 bg-slate-900">
                  <div className="flex items-center justify-between border-b border-slate-800 p-3">
                    <select value={snippetFormat} onChange={(event) => setSnippetFormat(event.target.value)} className="h-9 rounded-md border border-slate-800 bg-slate-950 px-3 text-sm outline-none">
                      <option value="python">Python OpenAI SDK</option><option value="langchain">JavaScript LangChain</option><option value="curl">cURL HTTP</option>
                    </select>
                    <button onClick={() => navigator.clipboard.writeText(snippet)} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-700 px-3 text-sm"><Copy className="h-4 w-4" />Copy</button>
                  </div>
                  <pre className="overflow-auto whitespace-pre-wrap p-4 font-mono text-sm text-slate-200">{snippet}</pre>
                </div>
              )}

              {tab === "history" && (
                <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
                  <div className="mb-4 flex gap-2">
                    <input value={versionLabel} onChange={(event) => setVersionLabel(event.target.value)} className="h-10 w-44 rounded-md border border-slate-800 bg-slate-950 px-3 text-sm outline-none" />
                    <button onClick={saveVersion} className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-500 px-3 text-sm font-semibold text-slate-950"><Save className="h-4 w-4" />Snapshot</button>
                  </div>
                  <div className="space-y-2">
                    {versions.map((version) => <div key={version.id} className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-950 p-3"><div><p className="text-sm font-semibold">{version.version_label}</p><p className="text-xs text-slate-500">{new Date(version.created_at).toLocaleString()}</p></div><button onClick={() => rollback(version.id)} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-700 px-3 text-sm"><RotateCcw className="h-4 w-4" />Rollback</button></div>)}
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <button onClick={copyCompiled} className="inline-flex h-11 items-center gap-2 rounded-md bg-indigo-500 px-5 text-sm font-semibold"><Copy className="h-4 w-4" />Copy Compiled Prompt</button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
