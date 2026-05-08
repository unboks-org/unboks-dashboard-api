import { Cloud, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  CLOUD_PROVIDERS,
  useCloudKnowledgeConnections,
  type CloudConnection,
  type CloudProvider,
} from "@/hooks/use-cloud-knowledge-connections";

function formatDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusLine(c: CloudConnection): string {
  if (!c.connected) return "Click Connect to link a folder.";
  if (c.status === "syncing") return "Syncing now…";
  if (c.status === "needs_reconnect") return "Reconnect to keep syncing.";
  if (c.status === "failed") return "Last sync failed.";
  if (c.lastSyncedAt) return `Last synced ${formatDate(c.lastSyncedAt)}.`;
  return "Linked.";
}

/**
 * Cloud knowledge providers. Connect flows are not wired to a backend
 * yet, so clicking Connect surfaces a calm "will be connected by the
 * Unboks team" toast instead of faking success. Disconnect is a local
 * no-op safe to call (clears any placeholder state we may have stored
 * from a future preview build).
 */
export function CloudKnowledgeConnections() {
  const { list, disconnect } = useCloudKnowledgeConnections();
  const connections = list();

  function onConnect(provider: CloudProvider, label: string) {
    toast.message(`${label} will be connected by the Unboks team.`, {
      description:
        "Cloud connections aren't switched on for your workspace yet.",
    });
  }

  function onChooseFolder(label: string) {
    toast.message(`Folder picker for ${label} isn't connected yet.`, {
      description: "The Unboks team will enable folder selection shortly.",
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-[#5f6368]">
        Connect folders with documents, price lists, FAQs, menus, and policies
        your AI should use.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {CLOUD_PROVIDERS.map((p) => {
          const c = connections.find((cn) => cn.provider === p.id) ?? {
            provider: p.id,
            connected: false,
          };
          return (
            <div
              key={p.id}
              className="flex flex-col gap-3 rounded-xl border border-[#e8eaed] bg-white p-4"
            >
              <div className="flex items-start gap-3">
                <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-[#f1f3f4] text-[#5f6368]">
                  <Cloud className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-semibold text-[#202124]">
                      {p.label}
                    </p>
                    {c.connected && (
                      <span className="inline-flex items-center rounded-full bg-[#e6f4ea] px-2 py-0.5 text-[10px] font-medium text-[#137333]">
                        Linked
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-[#5f6368]">{p.blurb}</p>
                  {c.connected && c.folderName && (
                    <p className="mt-1 truncate text-[11px] text-[#3c4043]">
                      Folder: {c.folderName}
                    </p>
                  )}
                  <p className="mt-1 text-[11px] text-[#9aa0a6]">
                    {statusLine(c)}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {c.connected ? (
                  <>
                    <button
                      type="button"
                      onClick={() => onChooseFolder(p.label)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#dadce0] bg-white px-3 py-1.5 text-[12px] text-[#3c4043] hover:bg-[#f6f8fc]"
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      Choose folder
                    </button>
                    <button
                      type="button"
                      onClick={() => disconnect(p.id)}
                      className="rounded-lg px-3 py-1.5 text-[12px] text-[#5f6368] hover:bg-[#f1f3f4]"
                    >
                      Disconnect
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => onConnect(p.id, p.label)}
                    className="rounded-lg bg-[#1a73e8] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#1765c1]"
                  >
                    Connect
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
