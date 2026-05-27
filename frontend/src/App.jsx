import React, { useState, useEffect, useMemo } from 'react';



import {
  ChevronDown,
  ChevronUp,
  Clipboard,
  Copy,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const TOOL_TAGS = ["Cursor", "Claude", "GPT-4", "OpenAI"];

const tagStyles = {
  Cursor: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  Claude: "border-orange-400/30 bg-orange-400/10 text-orange-200",
  "GPT-4": "border-indigo-500/30 bg-indigo-500/10 text-indigo-300",
  OpenAI: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200",
};

const emptyForm = {
  title: "",
  system_context: "",
  prompt_template: "",
  tool_tag: "Cursor",
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

function TagBadge({ tag, active = false, onClick }) {
  const classes = `inline-flex h-6 items-center rounded-full border px-2 text-[11px] font-semibold ${tagStyles[tag]}`;
  if (!onClick) {
    return <span className={classes}>{tag}</span>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${classes} transition hover:border-slate-500 hover:bg-slate-800 ${
        active ? "ring-1 ring-emerald-400/70" : ""
      }`}
    >
      {tag}
    </button>
  );
}

function App() {
  const [prompts, setPrompts] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [tagFilter, setTagFilter] = useState(null);
  const [variables, setVariables] = useState({});
  const [form, setForm] = useState(emptyForm);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copyState, setCopyState] = useState("idle");
  const [saving, setSaving] = useState(false);

  async function loadPrompts() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (searchTerm.trim()) params.set("search", searchTerm.trim());
      if (tagFilter) params.set("tool_tag", tagFilter);

      const response = await fetch(`${API_URL}/prompts?${params.toString()}`);
      if (!response.ok) throw new Error("Unable to load prompts");
      const data = await response.json();
      setPrompts(data);
      setActiveId((current) => {
        if (data.some((prompt) => prompt.id === current)) return current;
        return data[0]?.id ?? null;
      });
    } catch (caught) {
      setError(caught.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(loadPrompts, 140);
    return () => window.clearTimeout(timer);
  }, [searchTerm, tagFilter]);

  const activePrompt = useMemo(
    () => prompts.find((prompt) => prompt.id === activeId) ?? prompts[0] ?? null,
    [prompts, activeId]
  );

  const detectedVariables = useMemo(
    () => extractVariables(activePrompt?.prompt_template),
    [activePrompt?.prompt_template]
  );

  const compiledPrompt = useMemo(
    () => compilePrompt(activePrompt?.prompt_template, variables),
    [activePrompt?.prompt_template, variables]
  );

  const totals = useMemo(
    () => ({
      prompts: prompts.length,
      copies: prompts.reduce((sum, prompt) => sum + prompt.times_copied, 0),
    }),
    [prompts]
  );

  useEffect(() => {
    const next = {};
    detectedVariables.forEach((key) => {
      next[key] = variables[key] ?? "";
    });
    setVariables(next);
  }, [activePrompt?.id, detectedVariables.join("|")]);

  async function handleCreate(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/prompts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          system_context: form.system_context.trim() || null,
        }),
      });
      if (!response.ok) throw new Error("Prompt validation failed");
      const created = await response.json();
      setPrompts((current) => [created, ...current]);
      setActiveId(created.id);
      setForm(emptyForm);
      setIsCreating(false);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!activePrompt) return;
    const deletingId = activePrompt.id;
    setPrompts((current) => current.filter((prompt) => prompt.id !== deletingId));
    setActiveId((current) => (current === deletingId ? null : current));
    try {
      const response = await fetch(`${API_URL}/prompts/${deletingId}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Delete failed");
    } catch (caught) {
      setError(caught.message);
      loadPrompts();
    }
  }

  async function handleCopy() {
    if (!activePrompt) return;
    await navigator.clipboard.writeText(compiledPrompt);
    setCopyState("copied");
    window.setTimeout(() => setCopyState("idle"), 2000);

    fetch(`${API_URL}/prompts/${activePrompt.id}/copy`, { method: "PUT" })
      .then((response) => {
        if (!response.ok) throw new Error("Copy counter failed");
        return response.json();
      })
      .then((stats) => {
        setPrompts((current) =>
          current.map((prompt) =>
            prompt.id === stats.id ? { ...prompt, times_copied: stats.times_copied } : prompt
          )
        );
      })
      .catch((caught) => setError(caught.message));
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-950 text-slate-100">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950/90 px-5 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-md border border-emerald-500/30 bg-emerald-500/10">
            <Sparkles className="h-4 w-4 text-emerald-300" />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-normal text-slate-50">
              PromptVault <span className="text-slate-500">//</span> Pro
            </h1>
            <p className="text-xs text-slate-500">Engineering prompt workspace</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-400">
          <span className="font-semibold text-slate-100">{totals.prompts}</span> prompts
          <span className="h-3 w-px bg-slate-700" />
          <span className="font-semibold text-emerald-300">{totals.copies}</span> copies
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-[390px_minmax(0,1fr)] overflow-hidden">
        <aside className="flex min-h-0 flex-col border-r border-slate-800 bg-slate-950/72">
          <div className="space-y-3 border-b border-slate-800 p-4">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search title, content, system context"
                className="h-10 w-full rounded-md border border-slate-800 bg-slate-900 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/70 focus:outline-none"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {TOOL_TAGS.map((tag) => (
                <TagBadge
                  key={tag}
                  tag={tag}
                  active={tagFilter === tag}
                  onClick={() => setTagFilter((current) => (current === tag ? null : tag))}
                />
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {loading && <p className="px-2 py-6 text-sm text-slate-500">Loading prompts...</p>}
            {!loading && prompts.length === 0 && (
              <div className="rounded-md border border-dashed border-slate-800 p-5 text-sm text-slate-500">
                No prompts match this workspace view.
              </div>
            )}
            <div className="space-y-2">
              {prompts.map((prompt) => (
                <button
                  key={prompt.id}
                  type="button"
                  onClick={() => setActiveId(prompt.id)}
                  className={`w-full rounded-md border p-3 text-left transition ${
                    activePrompt?.id === prompt.id
                      ? "border-emerald-500/40 bg-slate-900 shadow-glow"
                      : "border-slate-800 bg-slate-900/70 hover:border-slate-700 hover:bg-slate-900"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="line-clamp-2 text-sm font-semibold text-slate-100">
                      {prompt.title}
                    </h2>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-700 px-2 py-0.5 text-[11px] text-slate-400">
                      <Clipboard className="h-3 w-3" />
                      {prompt.times_copied}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <TagBadge tag={prompt.tool_tag} />
                    <span className="text-[11px] text-slate-600">
                      {extractVariables(prompt.prompt_template).length} vars
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-800 bg-slate-950 p-3">
            <button
              type="button"
              onClick={() => setIsCreating((current) => !current)}
              className="flex h-10 w-full items-center justify-between rounded-md border border-slate-800 bg-slate-900 px-3 text-sm font-medium text-slate-100 transition hover:border-emerald-500/40"
            >
              <span className="inline-flex items-center gap-2">
                <Plus className="h-4 w-4 text-emerald-300" />
                New Prompt
              </span>
              {isCreating ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </button>

            {isCreating && (
              <form onSubmit={handleCreate} className="mt-3 space-y-2">
                <input
                  required
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  placeholder="Title"
                  className="h-9 w-full rounded-md border border-slate-800 bg-slate-900 px-3 text-sm focus:border-emerald-500/70 focus:outline-none"
                />
                <select
                  value={form.tool_tag}
                  onChange={(event) => setForm({ ...form, tool_tag: event.target.value })}
                  className="h-9 w-full rounded-md border border-slate-800 bg-slate-900 px-3 text-sm focus:border-emerald-500/70 focus:outline-none"
                >
                  {TOOL_TAGS.map((tag) => (
                    <option key={tag}>{tag}</option>
                  ))}
                </select>
                <textarea
                  value={form.system_context}
                  onChange={(event) => setForm({ ...form, system_context: event.target.value })}
                  placeholder="System context"
                  rows={3}
                  className="w-full resize-none rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm focus:border-emerald-500/70 focus:outline-none"
                />
                <textarea
                  required
                  value={form.prompt_template}
                  onChange={(event) => setForm({ ...form, prompt_template: event.target.value })}
                  placeholder="Prompt template with {{variables}}"
                  rows={4}
                  className="w-full resize-none rounded-md border border-slate-800 bg-slate-900 px-3 py-2 font-mono text-sm focus:border-emerald-500/70 focus:outline-none"
                />
                <button
                  disabled={saving}
                  className="h-9 w-full rounded-md bg-emerald-500 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Create Prompt"}
                </button>
              </form>
            )}
          </div>
        </aside>

        <section className="min-h-0 overflow-y-auto p-5">
          {error && (
            <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          )}

          {!activePrompt ? (
            <div className="grid h-full place-items-center">
              <div className="max-w-md text-center">
                <h2 className="text-lg font-semibold text-slate-100">Create your first prompt</h2>
                <p className="mt-2 text-sm text-slate-500">
                  Use the sidebar composer to add a reusable template.
                </p>
              </div>
            </div>
          ) : (
            <div className="relative min-h-full rounded-md border border-slate-800 bg-slate-900/74 p-5 shadow-glow">
              <button
                type="button"
                aria-label="Delete prompt"
                onClick={handleDelete}
                className="absolute right-5 top-5 grid h-9 w-9 place-items-center rounded-md border border-slate-800 text-slate-500 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300"
              >
                <Trash2 className="h-4 w-4" />
              </button>

              <div className="pr-12">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-semibold text-slate-50">{activePrompt.title}</h2>
                  <TagBadge tag={activePrompt.tool_tag} />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {activePrompt.times_copied} successful copies
                </p>
              </div>

              <div className="mt-6 rounded-md border border-slate-800 bg-slate-950">
                <div className="border-b border-slate-800 px-3 py-2 text-xs font-semibold uppercase text-slate-500">
                  System
                </div>
                <pre className="max-h-44 overflow-auto whitespace-pre-wrap p-4 font-mono text-sm leading-6 text-slate-300">
                  {activePrompt.system_context || "No system context configured."}
                </pre>
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
                <div className="rounded-md border border-slate-800 bg-slate-950">
                  <div className="border-b border-slate-800 px-3 py-2 text-xs font-semibold uppercase text-slate-500">
                    Variables
                  </div>
                  <div className="space-y-3 p-4">
                    {detectedVariables.length === 0 ? (
                      <p className="text-sm text-slate-500">No dynamic variables detected.</p>
                    ) : (
                      detectedVariables.map((key) => (
                        <label key={key} className="block">
                          <span className="mb-1 block text-xs font-medium text-slate-400">{key}</span>
                          <input
                            value={variables[key] ?? ""}
                            onChange={(event) =>
                              setVariables((current) => ({ ...current, [key]: event.target.value }))
                            }
                            placeholder={`Value for ${key}`}
                            className="h-10 w-full rounded-md border border-slate-800 bg-slate-900 px-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-500/70 focus:outline-none"
                          />
                        </label>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-md border border-slate-800 bg-slate-950">
                  <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
                    <span className="text-xs font-semibold uppercase text-slate-500">Compiled Prompt</span>
                    <span className="text-xs text-slate-600">{compiledPrompt.length} chars</span>
                  </div>
                  <pre className="min-h-[19rem] whitespace-pre-wrap p-4 font-mono text-sm leading-6 text-slate-200">
                    {compiledPrompt}
                  </pre>
                </div>
              </div>

              <div className="mt-5 flex justify-end border-t border-slate-800 pt-4">
                <button
                  type="button"
                  onClick={handleCopy}
                  className={`inline-flex h-11 items-center gap-2 rounded-md px-5 text-sm font-semibold transition ${
                    copyState === "copied"
                      ? "bg-emerald-500 text-slate-950"
                      : "bg-indigo-500 text-white hover:bg-indigo-400"
                  }`}
                >
                  <Copy className="h-4 w-4" />
                  {copyState === "copied" ? "Copied to Clipboard!" : "Copy Compiled Prompt"}
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
