import { useMemo, useState } from "react";
import { BookOpen, CheckCircle2, Copy, ExternalLink, MessageCircle, Search, Settings, Sparkles, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/inbox/DashboardShell";
import { cn } from "@/lib/utils";

type HelpSection = {
  id: string;
  title: string;
  summary: string;
  icon: typeof BookOpen;
  steps: string[];
  tips?: string[];
};

const SECTIONS: HelpSection[] = [
  {
    id: "first-login",
    title: "First login",
    summary: "Sign in, check your workspace, and know where the main tools are.",
    icon: CheckCircle2,
    steps: [
      "Open the dashboard link from your welcome email.",
      "Enter your workspace name and temporary password.",
      "Confirm the business name in the left sidebar is yours.",
      "Open Settings when you want to update company information or your Agent style.",
    ],
    tips: [
      "If the login link opens the wrong workspace, sign out and use the workspace name from the welcome email.",
      "Keep the temporary password private until you change it.",
    ],
  },
  {
    id: "connect-whatsapp",
    title: "Connect WhatsApp",
    summary: "Authorize your WhatsApp Business number so Unboks can receive and reply to messages.",
    icon: MessageCircle,
    steps: [
      "Open the dashboard and look for Connect WhatsApp.",
      "Click the secure connection link.",
      "Log in with your own Meta account.",
      "Select the correct Business Portfolio and WhatsApp number.",
      "Finish the Meta approval flow and return to Unboks.",
      "Send one test message from another phone and confirm it appears in Inbox.",
    ],
    tips: [
      "Use the real Meta account that manages the WhatsApp Business number.",
      "If Meta says the number is already connected somewhere else, contact Unboks before disconnecting anything.",
    ],
  },
  {
    id: "company-knowledge",
    title: "Add company knowledge",
    summary: "Teach your Agent your services, prices, policies, files, links, and important answers.",
    icon: UploadCloud,
    steps: [
      "Go to Settings.",
      "Open Company knowledge.",
      "Add short facts, website links, PDFs, menus, price lists, policies, or screenshots.",
      "Use clear titles such as Pricing, Opening hours, Services, or Cancellation policy.",
      "Ask your Agent a real customer question in WhatsApp to test whether the answer is correct.",
    ],
    tips: [
      "Write facts exactly as you want customers to hear them.",
      "If something is temporary, mention the date or deadline in the note.",
    ],
  },
  {
    id: "agent-personality",
    title: "Tune your Agent style",
    summary: "Set how your Agent should sound, how direct it should be, and when it should suggest appointments.",
    icon: Sparkles,
    steps: [
      "Go to Settings.",
      "Open Agent Personality.",
      "Use the wizard to answer each style question.",
      "Test the sample replies before saving.",
      "Save and then test in a real WhatsApp conversation.",
    ],
    tips: [
      "If replies feel too robotic, make the style warmer and ask it to answer first before suggesting appointments.",
      "For regulated businesses, do not ask the Agent to give professional advice beyond your approved information.",
    ],
  },
  {
    id: "inbox-escalations",
    title: "Inbox and escalations",
    summary: "Understand where customer conversations appear and when your team needs to step in.",
    icon: BookOpen,
    steps: [
      "Use Inbox for normal customer conversations.",
      "Use Escalations for messages that need your attention.",
      "Open an escalation to see why the Agent needs help.",
      "Reply directly when human takeover is needed.",
      "Resolve the escalation when your team has handled it.",
    ],
    tips: [
      "If an escalation was resolved by mistake, use Unresolve to reopen it.",
      "Use internal notes for your team, not for customer-facing answers.",
    ],
  },
  {
    id: "appointments",
    title: "Appointments",
    summary: "See appointment or booking requests that the system detected from conversations.",
    icon: CheckCircle2,
    steps: [
      "Open Appointments from the sidebar or bottom navigation.",
      "Review detected appointments and pending confirmations.",
      "Open the related conversation if you need more context.",
      "Confirm or follow up with the customer according to your own process.",
    ],
    tips: [
      "Appointments are only useful when the customer clearly gave enough details.",
      "If a message is still negotiation or unclear, handle it from Inbox or Escalations first.",
    ],
  },
  {
    id: "settings-safety",
    title: "Safety and blocking",
    summary: "Control blocked senders, abusive messages, alerts, and data retention.",
    icon: Settings,
    steps: [
      "Go to Settings.",
      "Use Alerts to choose where notifications are sent.",
      "Use Auto-block to block severe abuse and repeated profanity.",
      "Use Blocked senders to review or unblock someone.",
      "Use Data retention to manage archive behavior.",
    ],
    tips: [
      "Auto-block always creates a review path so your team can check what happened.",
      "Unblock a sender if the block was a false positive.",
    ],
  },
];

function copySectionLink(sectionId: string) {
  const url = `${window.location.origin}${window.location.pathname}#${sectionId}`;
  navigator.clipboard?.writeText(url).then(
    () => toast.success("Help link copied."),
    () => toast.error("Could not copy the link."),
  );
}

export default function Help() {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!normalized) return SECTIONS;
    return SECTIONS.filter((section) => {
      const haystack = [
        section.title,
        section.summary,
        ...section.steps,
        ...(section.tips ?? []),
      ].join(" ").toLowerCase();
      return haystack.includes(normalized);
    });
  }, [normalized]);

  return (
    <DashboardShell
      activeNav="help"
      pageTitle="Help"
      pageSubtitle="Find simple instructions whenever you need to set up, change, or check something."
      hideRefresh
    >
      <div className="min-h-full bg-[#f8f9fb]">
        <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 sm:py-8">
          <section className="mb-5 overflow-hidden rounded-[20px] border border-[#e8eaed] bg-white shadow-sm">
            <div className="grid gap-5 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_360px] sm:px-6">
              <div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#e8f0fe] px-3 py-1 text-[12px] font-medium text-[#174ea6]">
                  <BookOpen className="h-3.5 w-3.5" />
                  Unboks manual
                </div>
                <h2 className="text-[24px] font-semibold tracking-tight text-[#202124]">
                  What do you want to do?
                </h2>
                <p className="mt-2 max-w-[720px] text-[15px] leading-6 text-[#5f6368]">
                  Use this page as your always-available guide. Each section has a direct link, so the Unboks team can send you straight to the right instructions.
                </p>
              </div>
              <label className="relative block self-start">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9aa0a6]" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search help..."
                  className="h-11 w-full rounded-xl border border-[#dadce0] bg-white pl-10 pr-3 text-[14px] text-[#202124] outline-none transition focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
                />
              </label>
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="hidden lg:block">
              <div className="sticky top-5 rounded-[18px] border border-[#e8eaed] bg-white p-3 shadow-sm">
                <p className="px-2 pb-2 text-[12px] font-medium uppercase tracking-wide text-[#5f6368]">
                  Sections
                </p>
                <nav className="grid gap-1" aria-label="Help sections">
                  {SECTIONS.map((section) => (
                    <a
                      key={section.id}
                      href={`#${section.id}`}
                      className="rounded-xl px-3 py-2 text-[13px] font-medium text-[#3c4043] transition hover:bg-[#f1f3f4] hover:text-[#202124]"
                    >
                      {section.title}
                    </a>
                  ))}
                </nav>
              </div>
            </aside>

            <main className="grid gap-4">
              {filtered.map((section) => {
                const Icon = section.icon;
                return (
                  <section
                    key={section.id}
                    id={section.id}
                    className="scroll-mt-6 overflow-hidden rounded-[20px] border border-[#e8eaed] bg-white shadow-sm"
                  >
                    <header className="flex flex-col gap-4 border-b border-[#e8eaed] px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
                      <div className="flex min-w-0 gap-3">
                        <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-2xl bg-[#f1f3f4] text-[#1a73e8]">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-[17px] font-semibold text-[#202124]">{section.title}</h3>
                          <p className="mt-1 text-[14px] leading-5 text-[#5f6368]">{section.summary}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => copySectionLink(section.id)}
                        className="inline-flex h-9 flex-shrink-0 items-center justify-center gap-2 rounded-xl border border-[#dadce0] bg-white px-3 text-[13px] font-medium text-[#3c4043] transition hover:border-[#cbd5e1] hover:bg-[#f8fafd]"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy link
                      </button>
                    </header>
                    <div className="grid gap-5 px-5 py-5 sm:px-6 md:grid-cols-[minmax(0,1fr)_280px]">
                      <div>
                        <p className="mb-3 text-[12px] font-medium uppercase tracking-wide text-[#5f6368]">
                          Steps
                        </p>
                        <ol className="grid gap-3">
                          {section.steps.map((step, index) => (
                            <li key={step} className="flex gap-3 text-[14px] leading-6 text-[#3c4043]">
                              <span className="mt-0.5 grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-[#e8f0fe] text-[12px] font-semibold text-[#174ea6]">
                                {index + 1}
                              </span>
                              <span>{step}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                      <div className={cn("rounded-2xl border border-[#e8eaed] bg-[#fbfcfe] p-4", !section.tips?.length && "hidden md:block")}>
                        <p className="mb-2 text-[12px] font-medium uppercase tracking-wide text-[#5f6368]">
                          Good to know
                        </p>
                        {section.tips?.length ? (
                          <ul className="grid gap-2 text-[13px] leading-5 text-[#5f6368]">
                            {section.tips.map((tip) => (
                              <li key={tip} className="flex gap-2">
                                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#137333]" />
                                <span>{tip}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-[13px] leading-5 text-[#5f6368]">
                            This section is a reference guide. Contact Unboks if the screen does not match what you see.
                          </p>
                        )}
                      </div>
                    </div>
                  </section>
                );
              })}

              {filtered.length === 0 && (
                <section className="rounded-[20px] border border-dashed border-[#dadce0] bg-white px-6 py-10 text-center">
                  <p className="text-[15px] font-medium text-[#202124]">No help section found</p>
                  <p className="mt-1 text-[14px] text-[#5f6368]">
                    Try searching for WhatsApp, knowledge, style, inbox, appointments, or settings.
                  </p>
                </section>
              )}

              <section className="rounded-[20px] border border-[#e8eaed] bg-white px-5 py-5 shadow-sm sm:px-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-[16px] font-semibold text-[#202124]">Still stuck?</h3>
                    <p className="mt-1 text-[14px] text-[#5f6368]">
                      Send Unboks the section link and a screenshot of what you see.
                    </p>
                  </div>
                  <a
                    href="/settings"
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#1a73e8] px-4 text-[14px] font-medium text-white transition hover:bg-[#1765cc]"
                  >
                    Open Settings
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </section>
            </main>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
