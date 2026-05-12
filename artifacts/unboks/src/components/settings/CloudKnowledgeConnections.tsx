import { AlertCircle, Loader2 } from "lucide-react";

import {
  useCloudKnowledgeConnections,
  type CloudConnectionProvider,
  type CloudConnectionProviderId,
} from "@/hooks/use-cloud-knowledge-connections";
import { getClientSlug } from "@/lib/tenant";

/**
 * Cloud knowledge providers — backend-driven.
 *
 * Renders the providers returned by
 * `GET /knowledge/cloud-connections` (issue
 * unboks-org/unboks-dashboard-api#29) with no static fallback list. The
 * product surface is intentionally limited to Google Drive, OneDrive,
 * and Dropbox; SharePoint and Box are no longer offered, so we don't
 * draw rows for them and don't show fake Connect buttons.
 *
 * Status drives the action:
 *   - "connected"      → green Connected badge, folder + last synced.
 *   - "setup_required" → "Setup required" line + Connect button. The
 *                        button is disabled when the provider still
 *                        needs an app registration we don't have an
 *                        OAuth route for yet (no fake redirects).
 *   - "not_configured" → "Setup pending" + a calm "Contact Unboks team"
 *                        hint, Connect always disabled.
 *
 * No secrets are rendered. The hook does not flip status on its own
 * — every state shown here came from the backend.
 */

function formatDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

// Inline brand marks. SVGs kept small so the row stays compact. Colors
// are flat brand approximations — no official asset is shipped to keep
// the bundle small.
function ProviderIcon({ id }: { id: CloudConnectionProviderId }) {
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
    default:
      return <div className="h-5 w-5 rounded bg-[#e8eaed]" aria-hidden="true" />;
  }
}

function ConnectedMeta({ p }: { p: CloudConnectionProvider }) {
  const synced = formatDate(p.last_synced_at);
  if (p.folder_name && synced) {
    return (
      <>
        <span className="text-[#3c4043]">{p.folder_name}</span>
        <span className="text-[#9aa0a6]">{" \u00B7 Last synced "}{synced}</span>
      </>
    );
  }
  if (p.folder_name) return <span className="text-[#3c4043]">{p.folder_name}</span>;
  if (synced) return <span className="text-[#9aa0a6]">Last synced {synced}</span>;
  return <span className="text-[#5f6368]">Linked</span>;
}

function StatusLine({ p }: { p: CloudConnectionProvider }) {
  if (p.status === "connected") return <ConnectedMeta p={p} />;
  if (p.status === "setup_required") {
    // When the provider still needs an app registration on the Unboks
    // side, surface that inline so an operator on a screen reader (or
    // who can't see the disabled-button tooltip) understands why the
    // Connect button is greyed out.
    if (p.needs_provider_app_registration) {
      return (
        <span className="text-[#5f6368]">
          Setup required
          <span className="text-[#9aa0a6]">
            {" \u00B7 Contact the Unboks team to enable."}
          </span>
        </span>
      );
    }
    return (
      <span className="text-[#5f6368]">
        Setup required
        {p.blurb ? <span className="text-[#9aa0a6]">{" \u00B7 "}{p.blurb}</span> : null}
      </span>
    );
  }
  return (
    <span className="text-[#5f6368]">
      Setup pending
      <span className="text-[#9aa0a6]">{" \u00B7 Contact the Unboks team to enable."}</span>
    </span>
  );
}

function ProviderRow({ p }: { p: CloudConnectionProvider }) {
  const isConnected = p.status === "connected";
  // Connect is actionable when the backend reports `setup_required`
  // AND it does NOT need a provider app registration we don't yet
  // ship. The mapping is the same for Google Drive, OneDrive, and
  // Dropbox — only the destination URL differs, and that's the
  // backend's concern. We just hand the user off to the per-provider
  // OAuth start route under the existing tenant-routed dashboard
  // path; the backend issues the redirect to Google / Microsoft /
  // Dropbox and handles the callback. If the backend hasn't shipped
  // a particular provider's OAuth route yet, it must surface that by
  // setting `needs_provider_app_registration: true`, which collapses
  // this back to a disabled button — never a fake / 404 redirect.
  const canConnect =
    p.status === "setup_required" && !p.needs_provider_app_registration;

  const connectHref = canConnect
    ? `/api/${getClientSlug()}/dashboard/api/knowledge/cloud-connections/${p.provider}/connect`
    : null;

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-[#fbfbfd] sm:flex-nowrap sm:gap-4">
      {/* Icon */}
      <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-[#f8f9fa]">
        <ProviderIcon id={p.provider} />
      </div>

      {/* Name + status. Wraps below the action group on the smallest
          widths (parent is flex-wrap). */}
      <div className="min-w-0 flex-1 basis-[60%] sm:basis-auto">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <p className="text-[13px] font-semibold text-[#202124]">{p.label}</p>
          {isConnected && (
            <span className="inline-flex items-center rounded-full bg-[#e6f4ea] px-1.5 py-0.5 text-[10px] font-medium text-[#137333]">
              Connected
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-[12px]">
          <StatusLine p={p} />
        </p>
      </div>

      {/* Action — right aligned, small. */}
      <div className="flex flex-shrink-0 items-center gap-1 ml-auto sm:ml-0">
        {isConnected ? (
          <span className="rounded-md px-2 py-1 text-[12px] text-[#5f6368]">
            Linked
          </span>
        ) : connectHref ? (
          <a
            href={connectHref}
            className="rounded-md border border-[#dadce0] bg-white px-3 py-1 text-[12px] font-medium text-[#1a73e8] hover:bg-[#f0f6ff] hover:border-[#c4d7f5]"
          >
            Connect
          </a>
        ) : (
          <button
            type="button"
            disabled
            title={
              p.status === "not_configured"
                ? "Contact the Unboks team to enable this connection."
                : "Connect flow is not enabled for this provider yet."
            }
            className="cursor-not-allowed rounded-md border border-[#e8eaed] bg-[#f8f9fa] px-3 py-1 text-[12px] font-medium text-[#9aa0a6]"
          >
            Connect
          </button>
        )}
      </div>
    </li>
  );
}

export function CloudKnowledgeConnections() {
  const { data, isLoading, isError, refetch, isFetching } =
    useCloudKnowledgeConnections();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[#e8eaed] bg-white px-4 py-6 text-[12px] text-[#5f6368]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading cloud connections…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#fbe5e5] bg-[#fef7f7] px-4 py-3 text-[12px] text-[#a8071a]">
        <AlertCircle className="h-4 w-4 flex-shrink-0" />
        <span className="flex-1">
          Could not load cloud connections. Please try again.
        </span>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="rounded-md border border-[#f5c6c6] bg-white px-2.5 py-1 text-[12px] font-medium text-[#a8071a] hover:bg-[#fdf2f2] disabled:opacity-60"
        >
          {isFetching ? "Retrying…" : "Retry"}
        </button>
      </div>
    );
  }

  const providers = data?.providers ?? [];

  if (providers.length === 0) {
    return (
      <div className="rounded-xl border border-[#e8eaed] bg-white px-4 py-6 text-[12px] text-[#5f6368]">
        No cloud providers are available for your workspace yet. Contact the
        Unboks team to enable Google Drive, OneDrive, or Dropbox.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[#e8eaed] bg-white">
      <ul className="divide-y divide-[#f1f3f4]">
        {providers.map((p) => (
          <ProviderRow key={p.provider} p={p} />
        ))}
      </ul>
    </div>
  );
}
