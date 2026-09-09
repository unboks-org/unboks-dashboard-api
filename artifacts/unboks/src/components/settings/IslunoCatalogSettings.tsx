import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getClientSlug } from "@/lib/tenant";
import { tenantKey } from "@/lib/query-keys";
import { ApiError } from "@/lib/error";
import {
  fetchIslunoCapabilities,
  fetchIslunoCatalog,
  publishIslunoCatalog,
  fetchIslunoImage,
  type Product,
  type Asset,
} from "@/lib/isluno-catalog";
import { IslunoRulesEditor, TextField, buttonStyle } from "./IslunoRulesEditor";

function sourceNote(value: unknown): string {
  if (value == null) return "Not recorded";
  if (Array.isArray(value)) return value.map(sourceNote).join(" · ");
  if (typeof value === "object")
    return Object.entries(value)
      .map(([key, item]) => `${key.replaceAll("_", " ")}: ${sourceNote(item)}`)
      .join(" · ");
  return String(value);
}

export function IslunoCatalogGate({ legacy }: { legacy: ReactNode }) {
  const query = useQuery({
    queryKey: tenantKey("isluno-capabilities"),
    queryFn: fetchIslunoCapabilities,
    retry: false,
  });
  if (query.isPending) return <p role="status">Loading trip workspace…</p>;
  if (query.error) {
    if (query.error instanceof ApiError && query.error.status === 404)
      return legacy;
    return (
      <div role="alert">
        Trip workspace could not be loaded.{" "}
        <button className={buttonStyle} onClick={() => void query.refetch()}>
          Try again
        </button>
      </div>
    );
  }
  return query.data?.enabled &&
    query.data.tenant_slug === getClientSlug() &&
    query.data.capabilities.catalog_editor ? (
    <IslunoCatalogSettings key={getClientSlug()} />
  ) : (
    legacy
  );
}

function Preview({ asset }: { asset: Asset }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    let objectUrl: string | undefined;
    setUrl(null);
    setFailed(false);
    if (!asset.sha256 || asset.validation_status !== "verified") {
      setFailed(true);
      return;
    }
    fetchIslunoImage(asset.sha256)
      .then((blob) => {
        if (alive) {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        }
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [asset.sha256, asset.validation_status]);
  return url ? (
    <img
      src={url}
      alt={asset.caption || "Trip gallery image"}
      className="aspect-[4/3] w-full rounded-lg object-cover"
    />
  ) : (
    <div className="flex aspect-[4/3] items-center justify-center rounded-lg bg-slate-100 p-3 text-sm text-slate-600">
      {failed ? "Image unavailable" : "Loading image…"}
    </div>
  );
}

export function IslunoCatalogSettings() {
  const client = useQueryClient();
  const key = tenantKey("isluno-catalog");
  const query = useQuery({
    queryKey: key,
    queryFn: fetchIslunoCatalog,
    retry: false,
  });
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<{
    product: Product;
    initial: Product;
    revision: string;
  } | null>(null);
  const [tab, setTab] = useState("Facts");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty =
    !!draft && JSON.stringify(draft.product) !== JSON.stringify(draft.initial);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function edit(update: (product: Product) => void) {
    setDraft((current) => {
      if (!current) return current;
      const product = structuredClone(current.product);
      update(product);
      return { ...current, product };
    });
    setSaved(false);
    if (!conflict) setError(null);
  }
  function open(product: Product) {
    if (dirty && !window.confirm("Discard unsaved changes to this product?"))
      return;
    setDraft({
      product: structuredClone(product),
      initial: structuredClone(product),
      revision: query.data!.revision,
    });
    setTab("Facts");
    setError(null);
    setConflict(false);
    setSaved(false);
  }
  async function reload() {
    if (
      dirty &&
      !window.confirm(
        "Discard your unsaved changes and load the latest catalog?",
      )
    )
      return;
    setDraft(null);
    setError(null);
    setConflict(false);
    await query.refetch();
  }
  async function save() {
    if (!draft || saving || conflict) return;
    setSaving(true);
    setError(null);
    try {
      const data = await publishIslunoCatalog(draft.revision, draft.product);
      client.setQueryData(key, data);
      const product = data.catalog.products.find(
        (p) => p.id === draft.product.id,
      )!;
      setDraft({
        product: structuredClone(product),
        initial: structuredClone(product),
        revision: data.revision,
      });
      setSaved(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setConflict(true);
        setError(
          "Another operator published changes. Your draft is preserved. Copy any edits you need, then load the latest catalog before saving again.",
        );
      } else {
        const details =
          err instanceof ApiError
            ? (err.details as { detail?: { message?: string } })
            : undefined;
        setError(
          details?.detail?.message ||
            (err instanceof Error
              ? err.message
              : "Save failed. Your draft is preserved."),
        );
      }
    } finally {
      setSaving(false);
    }
  }
  const catalog = query.data;
  if (!catalog)
    return (
      <section className="rounded-2xl border bg-white p-6">
        <h2 className="text-xl font-semibold">Isluno product catalog</h2>
        <p role={query.isError ? "alert" : "status"} className="my-4">
          {query.isError
            ? "Catalog could not be loaded. No changes were made."
            : "Loading products and booking rules…"}
        </p>
        {query.isError && (
          <button className={buttonStyle} onClick={() => void query.refetch()}>
            Try again
          </button>
        )}
      </section>
    );
  const products = catalog.catalog.products.filter((p) =>
    `${p.name} ${p.category} ${p.id}`
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase()),
  );
  const product = draft?.product;
  return (
    <section className="min-w-0 space-y-6 text-slate-900">
      <header className="rounded-2xl bg-[#073b49] p-6 text-white">
        <p className="text-sm font-semibold text-teal-200">
          ISLUNO · DEMO WORKSPACE
        </p>
        <h2 className="mt-2 text-2xl font-semibold">Product catalog</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-200">
          Manage trip information, booking rules and the photos guests see in
          WhatsApp. Published changes apply to new recommendations and quotes;
          existing bookings keep their original details.
        </p>
        <p className="mt-4 text-sm">
          {catalog.catalog.products.length} products · Demo availability · No
          real supplier bookings
        </p>
      </header>
      {query.isError && (
        <p role="alert" className="rounded-lg bg-red-50 p-4">
          The latest catalog could not be loaded. The last loaded version is
          shown.{" "}
          <button
            type="button"
            className={buttonStyle}
            onClick={() => void query.refetch()}
          >
            Try again
          </button>
        </p>
      )}
      {query.isFetching && <p role="status">Refreshing catalog…</p>}
      <div className="grid min-w-0 gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-3">
          <TextField
            label="Search products"
            value={search}
            onChange={setSearch}
          />
          <p className="text-sm text-slate-500" role="status">
            {products.length} products shown
          </p>
          <div className="max-h-72 space-y-2 overflow-y-auto xl:max-h-[70vh]">
            {products.map((p) => (
              <button
                type="button"
                key={p.id}
                aria-pressed={product?.id === p.id}
                disabled={saving}
                onClick={() => open(p)}
                className={`min-h-16 w-full rounded-xl border p-3 text-left focus-visible:outline-2 focus-visible:outline-teal-600 ${product?.id === p.id ? "border-teal-700 bg-teal-50" : "border-slate-200 bg-white"}`}
              >
                <span className="block font-semibold">{p.name}</span>
                <span className="text-xs text-slate-600">
                  {p.category} · {p.enabled ? "Visible" : "Hidden"} ·{" "}
                  {p.readiness.quotable ? "Demo ready" : "Rules incomplete"}
                </span>
              </button>
            ))}
            {!products.length && (
              <p className="rounded-lg bg-slate-100 p-4">
                No products match your search. Try a different name or category.
              </p>
            )}
          </div>
        </aside>
        <div className="min-w-0">
          {!product ? (
            <div className="rounded-2xl border border-dashed p-10 text-center text-slate-600">
              Select a product to review its facts, rules and gallery.
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
              className="min-w-0 space-y-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6"
            >
              <div>
                <p className="text-sm text-teal-700">{product.category}</p>
                <h3 className="break-words text-xl font-semibold">
                  {product.name}
                </h3>
                <a
                  href={product.source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-sm text-teal-700 underline"
                >
                  View original source
                </a>
                <p className="mt-1 text-xs text-slate-500">
                  Source observed {product.source.observed_at.slice(0, 10)}
                </p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
                <p className="font-semibold">
                  {product.demo_rules?.label ??
                    "Demo booking using catalog rules"}
                </p>
                <p className="mt-1">
                  Missing supplier facts:{" "}
                  {product.readiness.source_unresolved.length
                    ? product.readiness.source_unresolved
                        .map((v) => v.replaceAll("_", " "))
                        .join(", ")
                    : "none recorded"}
                  .
                </p>
                {product.readiness.unresolved.length > 0 && (
                  <p className="mt-2">
                    Booking gaps: {product.readiness.unresolved.join(", ")}.
                  </p>
                )}
              </div>
              <nav
                aria-label="Product sections"
                className="flex flex-wrap gap-2"
              >
                {[
                  "Facts",
                  "Supplier rules",
                  ...(product.demo_rules ? ["Demo rules"] : []),
                  "Gallery",
                ].map((name) => (
                  <button
                    type="button"
                    key={name}
                    aria-pressed={tab === name}
                    className={`${buttonStyle} ${tab === name ? "bg-teal-50 border-teal-600" : ""}`}
                    onClick={() => setTab(name)}
                  >
                    {name}
                  </button>
                ))}
              </nav>
              <fieldset
                disabled={saving || !catalog.editable}
                className="min-w-0 space-y-4"
              >
                {tab === "Facts" && (
                  <>
                    <TextField
                      label="Product name"
                      maxLength={200}
                      value={product.name}
                      onChange={(v) =>
                        edit((p) => {
                          p.name = v;
                        })
                      }
                    />
                    <TextField
                      label="Category"
                      maxLength={100}
                      value={product.category}
                      onChange={(v) =>
                        edit((p) => {
                          p.category = v;
                        })
                      }
                    />
                    <TextField
                      label="Trip description"
                      maxLength={3000}
                      multiline
                      value={product.summary}
                      onChange={(v) =>
                        edit((p) => {
                          p.summary = v;
                        })
                      }
                    />
                    <TextField
                      label="Inclusions (one per line)"
                      multiline
                      maxLength={20000}
                      value={product.inclusions.join("\n")}
                      onChange={(v) =>
                        edit((p) => {
                          p.inclusions = v.split("\n");
                        })
                      }
                    />
                    <label className="flex min-h-11 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={product.enabled}
                        onChange={(e) =>
                          edit((p) => {
                            p.enabled = e.target.checked;
                          })
                        }
                      />
                      Show in trip discovery
                    </label>
                    {product.source_claims && (
                      <details className="rounded-lg bg-slate-50 p-3">
                        <summary className="cursor-pointer font-medium">
                          Original source notes
                        </summary>
                        <dl className="mt-3 space-y-3">
                          {Object.entries(product.source_claims).map(
                            ([key, value]) => (
                              <div key={key}>
                                <dt className="text-xs font-semibold uppercase text-slate-500">
                                  {key.replaceAll("_", " ")}
                                </dt>
                                <dd className="break-words text-sm">
                                  {typeof value === "string"
                                    ? value
                                    : sourceNote(value)}
                                </dd>
                              </div>
                            ),
                          )}
                        </dl>
                      </details>
                    )}
                  </>
                )}
                {tab === "Supplier rules" && (
                  <>
                    <p className="text-sm text-slate-600">
                      Source rules remain separate from demo samples. Missing
                      supplier information stays unconfirmed.
                    </p>
                    <IslunoRulesEditor
                      rules={product}
                      change={(update) => edit((p) => update(p))}
                    />
                  </>
                )}
                {tab === "Demo rules" && product.demo_rules && (
                  <>
                    <p className="rounded-lg bg-amber-50 p-3 text-sm">
                      {product.demo_rules.label} · Sample rules never confirm
                      supplier availability or eligibility for real bookings.
                    </p>
                    <IslunoRulesEditor
                      rules={product.demo_rules.rules}
                      change={(update) =>
                        edit((p) => update(p.demo_rules!.rules))
                      }
                    />
                  </>
                )}
                {tab === "Gallery" && (
                  <>
                    <p className="text-sm text-slate-600">
                      Photos appear in this order. Move buttons work with
                      keyboard and touch. Captions are shared with guests.
                    </p>
                    {!product.gallery.length && (
                      <p>No catalog images available for this product.</p>
                    )}
                    <div className="grid gap-4 sm:grid-cols-2">
                      {product.gallery.map((asset, i) => (
                        <div
                          key={asset.id}
                          className="min-w-0 space-y-3 rounded-xl border p-3"
                        >
                          <Preview asset={asset} />
                          <TextField
                            label={`Photo ${i + 1} caption`}
                            value={asset.caption}
                            maxLength={500}
                            onChange={(v) =>
                              edit((p) => {
                                p.gallery[i].caption = v;
                              })
                            }
                          />
                          <div className="flex gap-2">
                            {[-1, 1].map((direction) => (
                              <button
                                type="button"
                                key={direction}
                                aria-label={`Move photo ${i + 1} ${direction < 0 ? "up" : "down"}`}
                                disabled={
                                  i + direction < 0 ||
                                  i + direction >= product.gallery.length
                                }
                                className={buttonStyle}
                                onClick={() =>
                                  edit((p) => {
                                    [p.gallery[i], p.gallery[i + direction]] = [
                                      p.gallery[i + direction],
                                      p.gallery[i],
                                    ];
                                    p.gallery.forEach((a, index) => {
                                      a.order = index;
                                    });
                                  })
                                }
                              >
                                {direction < 0 ? "Move up" : "Move down"}
                              </button>
                            ))}
                          </div>
                          <p className="text-xs text-slate-500">
                            {i + 1} of {product.gallery.length} ·{" "}
                            {asset.validation_status}
                          </p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </fieldset>
              {error && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm"
                >
                  {error}
                </div>
              )}
              {saved && (
                <p
                  role="status"
                  className="rounded-lg bg-teal-50 p-3 text-sm text-teal-900"
                >
                  Published. New recommendations and quotes use these details.
                </p>
              )}
              <footer className="flex flex-wrap items-center gap-3 border-t pt-4">
                <button
                  type="submit"
                  disabled={!dirty || saving || conflict || !catalog.editable}
                  className={`${buttonStyle} bg-[#073b49] text-white`}
                >
                  {saving ? "Publishing…" : "Publish changes"}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  className={buttonStyle}
                  onClick={() => void reload()}
                >
                  {conflict ? "Load latest catalog" : "Reload catalog"}
                </button>
                <span className="text-xs text-slate-500">
                  {dirty ? "Unsaved changes" : "No unsaved changes"}
                </span>
              </footer>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
