import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { api } from "../lib/api";
import type { LlmProvider, Settings } from "../lib/types";

const DEFAULT_SETTINGS: Settings = {
  vaultFolder: null,
  llmProvider: "openai",
  silenceThresholdDb: -30,
  silenceMinSec: 0.8,
};

export default function SettingsView() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [openaiPresent, setOpenaiPresent] = useState(false);
  const [anthropicPresent, setAnthropicPresent] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [s, hasOpenai, hasAnthropic] = await Promise.all([
          api.getSettings(),
          api.hasApiKey("openai"),
          api.hasApiKey("anthropic"),
        ]);
        setSettings(s);
        setOpenaiPresent(hasOpenai);
        setAnthropicPresent(hasAnthropic);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const update = async (next: Settings) => {
    setSettings(next);
    await api.saveSettings(next);
    flash("Saved");
  };

  const flash = (msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(null), 1500);
  };

  const chooseVaultFolder = async () => {
    const result = await open({
      directory: true,
      title: "Choose Obsidian vault folder",
      defaultPath: settings.vaultFolder ?? undefined,
    });
    if (typeof result === "string") {
      update({ ...settings, vaultFolder: result });
    }
  };

  const setKey = async (provider: LlmProvider, value: string) => {
    await api.setApiKey(provider, value);
    if (provider === "openai") setOpenaiPresent(value.length > 0);
    else setAnthropicPresent(value.length > 0);
    flash(value ? "Key saved" : "Key removed");
  };

  if (loading) return <div className="p-6 text-sm text-text-dim">Loading…</div>;

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col gap-8 overflow-y-auto px-6 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        {status && <span className="text-xs text-text-dim">{status}</span>}
      </div>

      <Section title="Obsidian vault">
        <div className="flex items-center gap-3">
          <code className="flex-1 truncate rounded-md border border-border bg-bg-raised px-3 py-2 font-mono text-xs text-text-dim">
            {settings.vaultFolder ?? "(not set)"}
          </code>
          <Button onClick={chooseVaultFolder}>Choose…</Button>
        </div>
        <p className="text-xs text-text-faint">
          Exports will be saved here as <code className="font-mono">YYYY-MM-DD-name.md</code>.
        </p>
      </Section>

      <Section title="LLM provider">
        <div className="flex gap-2">
          {(["openai", "anthropic"] as const).map((p) => (
            <button
              key={p}
              onClick={() => update({ ...settings, llmProvider: p })}
              className={
                "flex-1 rounded-md border px-4 py-2.5 text-sm transition-colors " +
                (settings.llmProvider === p
                  ? "border-accent bg-accent/10 text-text"
                  : "border-border bg-bg-raised text-text-dim hover:bg-bg-elevated")
              }
            >
              {p === "openai" ? "OpenAI (gpt-5.4-mini)" : "Anthropic (Claude Haiku 4.5)"}
            </button>
          ))}
        </div>
        <p className="text-xs text-text-faint">Used for filename suggestions.</p>
      </Section>

      <Section title="API keys">
        <ApiKeyField
          label="OpenAI"
          present={openaiPresent}
          placeholder="sk-…"
          onSave={(v) => setKey("openai", v)}
        />
        <ApiKeyField
          label="Anthropic"
          present={anthropicPresent}
          placeholder="sk-ant-…"
          onSave={(v) => setKey("anthropic", v)}
        />
        <p className="text-xs text-text-faint">
          Stored in the macOS Keychain, not on disk.
        </p>
      </Section>

      <Section title="Silence detection defaults">
        <div className="grid grid-cols-2 gap-4">
          <LabeledNumber
            label="Threshold (dB)"
            value={settings.silenceThresholdDb}
            step={1}
            onChange={(v) => update({ ...settings, silenceThresholdDb: v })}
          />
          <LabeledNumber
            label="Min duration (s)"
            value={settings.silenceMinSec}
            step={0.1}
            onChange={(v) => update({ ...settings, silenceMinSec: v })}
          />
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium uppercase tracking-wider text-text-dim">{title}</h2>
      {children}
    </section>
  );
}

function Button({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-md border border-border bg-bg-raised px-4 py-2 text-sm text-text transition-colors hover:bg-bg-elevated"
    >
      {children}
    </button>
  );
}

function ApiKeyField({
  label,
  present,
  placeholder,
  onSave,
}: {
  label: string;
  present: boolean;
  placeholder: string;
  onSave: (value: string) => void | Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [editing, setEditing] = useState(!present);

  if (!editing) {
    return (
      <div className="flex items-center justify-between rounded-md border border-border bg-bg-raised px-3 py-2">
        <span className="text-sm">{label}</span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-dim">••••••••</span>
          <button
            onClick={() => {
              setValue("");
              setEditing(true);
            }}
            className="text-xs text-text-dim hover:text-text"
          >
            Replace
          </button>
          <button
            onClick={() => {
              onSave("");
              setEditing(true);
            }}
            className="text-xs text-danger hover:underline"
          >
            Remove
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <label className="w-24 text-sm">{label}</label>
      <input
        type="password"
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="flex-1 rounded-md border border-border bg-bg-raised px-3 py-2 font-mono text-sm placeholder:text-text-faint focus:border-border-strong"
      />
      <Button
        onClick={async () => {
          if (!value) return;
          await onSave(value);
          setValue("");
          setEditing(false);
        }}
      >
        Save
      </Button>
    </div>
  );
}

function LabeledNumber({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-text-dim">{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="rounded-md border border-border bg-bg-raised px-3 py-2 font-mono text-sm focus:border-border-strong"
      />
    </label>
  );
}
