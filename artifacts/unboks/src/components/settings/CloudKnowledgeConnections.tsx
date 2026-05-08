import { FolderOpen, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import {
  CLOUD_PROVIDERS,
  useCloudKnowledgeConnections,
  type CloudConnection,
  type CloudProvider,
} from "@/hooks/use-cloud-knowledge-connections";

/**
 * Cloud knowledge providers — compact premium-SaaS list.
 *
 * Layout reference set (via Refero): Linear integrations list, Slack
 * connected apps, Notion connections, Stripe app directory, Intercom
 * integration settings. Common pattern across all five:
 *
 *   - One bordered panel containing all providers
 *   - One row per provider, height ~60px
 *   - Brand mark on the left, name + one-line description in the middle
 *   - Right-aligned action (Connect / Manage) — small, low-emphasis
 *   - Thin row dividers, subtle hover, no bulky card per integration
 *
 * Connect / folder-pick / sync are not wired to a backend yet, so each
 * action surfaces a calm "will be connected by the Unboks team" toast
 * instead of faking success. Disconnect is a local no-op safe to call.
 */

function formatDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function metaLine(c: CloudConnection): string | null {
  if (!c.connected) return null;
  if (c.status === "syncing") return "Syncing now";
  if (c.status === "needs_reconnect") return "Reconnect required";
  if (c.status === "failed") return "Last sync failed";
  if (c.lastSyncedAt) return `Last synced ${formatDate(c.lastSyncedAt)}`;
  return "Linked";
}

// Inline brand marks. SVGs kept small (16x16 viewport scaled by parent)
// so the row stays compact. Colors are flat brand approximations — no
// official asset is shipped to keep the bundle small.
function ProviderIcon({ id }: { id: CloudProvider }) {
  switch (id) {
    case "google_drive":
      return (
        <svg viewBox="0 0 87.3 78" className="h-5 w-5" aria-hidden="true">
          <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L27.5 53H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
          <path d="M43.65 25L29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3L1.2 48.4C.4 49.8 0 51.35 0 52.9h27.5z" fill="#00ac47" />
          <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.5l5.85 11.5z" fill="#ea4335" />
          <path d="M43.65 25L57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
          <path d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
          <path d="M73.4 26.5L60.75 4.5c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25l16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
        </svg>
      );
    case "onedrive":
      return (
        <svg viewBox="0 0 32 32" className="h-5 w-5" aria-hidden="true">
          <path d="M19 11a8 8 0 0 0-15 3 6 6 0 0 0 1 11h18a5 5 0 0 0 1-10 6 6 0 0 0-5-4z" fill="#0364b8" />
        </svg>
      );
    case "dropbox":
      return (
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
          <path d="M6 2L0 6l6 4 6-4-6-4zm12 0l-6 4 6 4 6-4-6-4zM0 14l6 4 6-4-6-4-6 4zm18-4l-6 4 6 4 6-4-6-4zM6 19l6 4 6-4-6-4-6 4z" fill="#0061ff" />
        </svg>
      );
    case "sharepoint":
      return (
        <svg viewBox="0 0 32 32" className="h-5 w-5" aria-hidden="true">
          <circle cx="13" cy="11" r="8" fill="#036c70" />
          <circle cx="20" cy="18" r="7" fill="#1a9ba1" />
          <circle cx="15" cy="24" r="5" fill="#37c6d0" />
        </svg>
      );
    case "box":
      return (
        <svg viewBox="0 0 32 32" className="h-5 w-5" aria-hidden="true">
          <rect x="2" y="6" width="28" height="20" rx="3" fill="#0061d5" />
          <text
            x="16"
            y="20"
            textAnchor="middle"
            fill="#fff"
            fontSize="10"
            fontFamily="Arial, sans-serif"
            fontWeight="700"
          >
            box
          </text>
        </svg>
      );
    default:
      return <div className="h-5 w-5 rounded bg-[#e8eaed]" aria-hidden="true" />;
  }
}

export function CloudKnowledgeConnections() {
  const { list, disconnect } = useCloudKnowledgeConnections();
  const connections = list();

  function onConnect(_provider: CloudProvider, label: string) {
    toast.message(`${label} will be connected by the Unboks team.`, {
      description: "Cloud connections aren't switched on for your workspace yet.",
    });
  }

  function onChooseFolder(label: string) {
    toast.message(`Folder picker for ${label} isn't connected yet.`, {
      description: "The Unboks team will enable folder selection shortly.",
    });
  }

  function onSync(label: string) {
    toast.message(`Sync for ${label} isn't connected yet.`, {
      description: "The Unboks team will enable manual sync shortly.",
    });
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[#e8eaed] bg-white">
      <ul className="divide-y divide-[#f1f3f4]">
        {CLOUD_PROVIDERS.map((p) => {
          const c =
            connections.find((cn) => cn.provider === p.id) ?? {
              provider: p.id,
              connected: false,
            };
          const meta = metaLine(c);
          return (
            <li
              key={p.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-[#fbfbfd] sm:flex-nowrap sm:gap-4"
            >
              {/* Icon */}
              <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-[#f8f9fa]">
                <ProviderIcon id={p.id} />
              </div>

              {/* Name + description. On the smallest widths the action
                  group wraps below this block (parent is flex-wrap),
                  giving a clean stacked row with no horizontal
                  overflow. From the sm breakpoint up the row is a
                  single horizontal line. */}
              <div className="min-w-0 flex-1 basis-[60%] sm:basis-auto">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <p className="text-[13px] font-semibold text-[#202124]">
                    {p.label}
                  </p>
                  {c.connected && (
                    <span className="inline-flex items-center rounded-full bg-[#e6f4ea] px-1.5 py-0.5 text-[10px] font-medium text-[#137333]">
                      Connected
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-[12px] text-[#5f6368]">
                  {c.connected && c.folderName ? (
                    <>
                      <span className="text-[#3c4043]">{c.folderName}</span>
                      {meta && (
                        <span className="text-[#9aa0a6]">
                          {" \u00B7 "}
                          {meta}
                        </span>
                      )}
                    </>
                  ) : (
                    p.blurb
                  )}
                </p>
              </div>

              {/* Action — right aligned, small. On mobile this group
                  may wrap to its own line under the text block. */}
              <div className="flex flex-shrink-0 items-center gap-1 ml-auto sm:ml-0">
                {c.connected ? (
                  <>
                    {/* All three actions stay reachable on mobile —
                        labels collapse to icon-only below the sm
                        breakpoint so the row never overflows. */}
                    <button
                      type="button"
                      onClick={() => onSync(p.label)}
                      title="Sync now"
                      aria-label={`Sync ${p.label} now`}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-[#5f6368] hover:bg-[#f1f3f4]"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Sync</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onChooseFolder(p.label)}
                      title="Choose folder"
                      aria-label={`Choose folder for ${p.label}`}
                      className="inline-flex items-center gap-1 rounded-md border border-[#dadce0] bg-white px-2 py-1 text-[12px] text-[#3c4043] hover:bg-[#f6f8fc] sm:px-2.5"
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Folder</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => disconnect(p.id)}
                      title="Disconnect"
                      aria-label={`Disconnect ${p.label}`}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-[#5f6368] hover:bg-[#f1f3f4]"
                    >
                      <X className="h-3.5 w-3.5 sm:hidden" />
                      <span className="hidden sm:inline">Disconnect</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => onConnect(p.id, p.label)}
                    className="rounded-md border border-[#dadce0] bg-white px-3 py-1 text-[12px] font-medium text-[#1a73e8] hover:bg-[#f0f6ff] hover:border-[#c4d7f5]"
                  >
                    Connect
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
