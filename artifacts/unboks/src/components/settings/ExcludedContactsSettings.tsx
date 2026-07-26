import { useMemo, useRef, useState } from "react";
import { Loader2, ShieldMinus, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import {
  useAddIgnoredContact,
  useDeleteIgnoredContact,
  useIgnoredContacts,
  useImportIgnoredContacts,
  useValidateIgnoredContactsImport,
} from "@/hooks/use-ignored-contacts";
import type {
  IgnoredContactImportPreview,
  IgnoredContactImportPreviewContact,
  IgnoredContactPayload,
} from "@/lib/api";
import { ApiError } from "@/lib/error";
import { cn } from "@/lib/utils";
import { getTenantUiConfig, tenantText } from "@/lib/tenant-ui";

const LABELS = [
  "Owner",
  "Staff",
  "VIP",
  "Supplier",
  "Private",
  "Family",
  "Lawyer / Accountant",
  "Test Contact",
  "Other",
] as const;

const CHANNELS = [
  { value: "", label: "Any / unknown" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
] as const;

function contactLabel(label: (typeof LABELS)[number]): string {
  return label === "Owner"
    ? tenantText(label, "Propietario")
    : label === "Staff"
      ? tenantText(label, "Personal")
      : label === "Supplier"
        ? tenantText(label, "Proveedor")
        : label === "Private"
          ? tenantText(label, "Privado")
          : label === "Family"
            ? tenantText(label, "Familia")
            : label === "Lawyer / Accountant"
              ? tenantText(label, "Abogado / asesor")
              : label === "Test Contact"
                ? tenantText(label, "Contacto de prueba")
                : label === "Other"
                  ? tenantText(label, "Otro")
                  : label;
}

const EMPTY_FORM: IgnoredContactPayload = {
  name: "",
  phone: "",
  email: "",
  channel: "",
  external_sender_id: "",
  label: "",
  note: "",
};

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message || `Backend returned ${err.status}.`;
  if (err instanceof Error) return err.message;
  return fallback;
}

function formatDate(iso: string): string {
  if (!iso) return "-";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Date(ms).toLocaleString(getTenantUiConfig().dateLocale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function contactKey(c: IgnoredContactImportPreviewContact): string {
  return c.clientId || `${c.name}:${c.phone}:${c.email}:${c.externalSenderId}`;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[#edf0f3] bg-white px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5f6368]">
        {label}
      </p>
      <p className="mt-1 text-[18px] font-semibold text-[#202124]">{value}</p>
    </div>
  );
}

export function ExcludedContactsSettings() {
  const { data, isLoading, isError, error } = useIgnoredContacts();
  const addContact = useAddIgnoredContact();
  const deleteContact = useDeleteIgnoredContact();
  const validateImport = useValidateIgnoredContactsImport();
  const importContacts = useImportIgnoredContacts();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<IgnoredContactPayload>(EMPTY_FORM);
  const [preview, setPreview] = useState<IgnoredContactImportPreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const contacts = data?.contacts ?? [];
  const manualValid = Boolean(
    (form.phone ?? "").trim() ||
    (form.email ?? "").trim() ||
    ((form.channel ?? "").trim() && (form.external_sender_id ?? "").trim()),
  );
  const selectedPreviewContacts = useMemo(() => {
    if (!preview) return [];
    return preview.contacts.filter((c) => selected.has(contactKey(c)) && c.valid && !c.duplicate && !c.alreadyIgnored);
  }, [preview, selected]);

  const updateForm = (key: keyof IgnoredContactPayload, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleAdd = async () => {
    try {
      await addContact.mutateAsync(form);
      setForm(EMPTY_FORM);
      toast.success(tenantText("Contact added to Ignore List", "Contacto añadido a la lista de exclusión"), {
        description: tenantText(
          "Inbound messages from this contact will be ignored before Marina or escalations run.",
          "Los mensajes entrantes de este contacto se ignorarán antes de que actúe Marina o se cree un seguimiento.",
        ),
      });
    } catch (err) {
      toast.error(tenantText("Couldn't add contact", "No se pudo añadir el contacto"), {
        description: errorMessage(
          err,
          tenantText(
            "Please check the phone, email, or sender id.",
            "Comprueba el teléfono, el correo o el identificador del remitente.",
          ),
        ),
      });
    }
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;
    try {
      const result = await validateImport.mutateAsync(file);
      setPreview(result);
      setSelected(new Set(
        result.contacts
          .filter((c) => c.selected && c.valid && !c.duplicate && !c.alreadyIgnored)
          .map(contactKey),
      ));
      toast.success(tenantText("Import preview ready", "Vista previa de importación lista"));
    } catch (err) {
      setPreview(null);
      setSelected(new Set());
      toast.error(tenantText("Couldn't preview import", "No se pudo previsualizar la importación"), {
        description: errorMessage(
          err,
          tenantText("Upload a CSV or VCF file.", "Sube un archivo CSV o VCF."),
        ),
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const toggleImportRow = (row: IgnoredContactImportPreviewContact, checked: boolean) => {
    const key = contactKey(row);
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const handleImport = async () => {
    try {
      const result = await importContacts.mutateAsync(selectedPreviewContacts);
      setPreview(null);
      setSelected(new Set());
      toast.success(tenantText("Ignore List imported", "Lista de exclusión importada"), {
        description: tenantText(
          `${result.added.length} contact${result.added.length === 1 ? "" : "s"} added.`,
          `${result.added.length} ${result.added.length === 1 ? "contacto añadido" : "contactos añadidos"}.`,
        ),
      });
    } catch (err) {
      toast.error(tenantText("Couldn't import contacts", "No se pudieron importar los contactos"), {
        description: errorMessage(
          err,
          tenantText(
            "Please review the selected contacts and try again.",
            "Revisa los contactos seleccionados e inténtalo de nuevo.",
          ),
        ),
      });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteContact.mutateAsync(id);
      toast.success(tenantText("Contact removed", "Contacto eliminado"), {
        description: tenantText(
          "Future messages from this contact can flow normally again.",
          "Los próximos mensajes de este contacto volverán a procesarse con normalidad.",
        ),
      });
    } catch (err) {
      toast.error(tenantText("Couldn't remove contact", "No se pudo eliminar el contacto"), {
        description: errorMessage(
          err,
          tenantText("Please try again.", "Inténtalo de nuevo."),
        ),
      });
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-[#e8eaed] bg-white">
      <div className="border-b border-[#f1f3f4] px-5 py-4 sm:px-6">
        <h3 className="flex items-center gap-2 text-[14px] font-semibold text-[#202124]">
          <ShieldMinus className="h-4 w-4 text-[#5f6368]" aria-hidden="true" />
          {tenantText("Excluded Contacts / Ignore List", "Contactos excluidos")}
        </h3>
        <p className="mt-1 text-[13px] leading-5 text-[#5f6368]">
          {tenantText(
            "Add contacts that Unboks should completely ignore. Messages from these contacts will not receive Marina replies, will not create escalations, and will not trigger notifications.",
            "Añade contactos que Unboks debe ignorar por completo. Sus mensajes no recibirán respuestas de Marina, no crearán seguimientos ni enviarán notificaciones.",
          )}
        </p>
      </div>

      <div className="space-y-6 px-5 py-4 sm:px-6">
        <div className="rounded-xl border border-[#edf0f3] bg-[#fbfcfe] px-4 py-3 text-[12px] leading-5 text-[#5f6368]">
          {tenantText(
            "This is a full ignore list. Matched messages stop before Marina, before LLM/API calls, before escalations, before drafts, and before notifications. Only an internal log event is kept.",
            "Esta es una lista de exclusión completa. Los mensajes coincidentes se detienen antes de Marina, de las llamadas a la IA, de los seguimientos, de los borradores y de las notificaciones. Solo se conserva un registro interno.",
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.8fr)]">
          <div className="rounded-xl border border-[#edf0f3] px-4 py-4">
            <p className="text-[13px] font-semibold text-[#202124]">
              {tenantText("Add manually", "Añadir manualmente")}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-[12px] font-medium text-[#3c4043]">
                {tenantText("Name", "Nombre")}
                <input
                  value={form.name ?? ""}
                  onChange={(e) => updateForm("name", e.target.value)}
                  placeholder={tenantText("Optional display name", "Nombre visible opcional")}
                  className="mt-1.5 w-full rounded-lg border border-[#dadce0] px-3 py-2 text-[13px] outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
                />
              </label>
              <label className="text-[12px] font-medium text-[#3c4043]">
                {tenantText("Phone number", "Número de teléfono")}
                <input
                  value={form.phone ?? ""}
                  onChange={(e) => updateForm("phone", e.target.value)}
                  placeholder="+34..."
                  className="mt-1.5 w-full rounded-lg border border-[#dadce0] px-3 py-2 text-[13px] outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
                />
              </label>
              <label className="text-[12px] font-medium text-[#3c4043]">
                Email
                <input
                  value={form.email ?? ""}
                  onChange={(e) => updateForm("email", e.target.value)}
                  placeholder="name@example.com"
                  className="mt-1.5 w-full rounded-lg border border-[#dadce0] px-3 py-2 text-[13px] outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
                />
              </label>
              <label className="text-[12px] font-medium text-[#3c4043]">
                {tenantText("Channel", "Canal")}
                <select
                  value={form.channel ?? ""}
                  onChange={(e) => updateForm("channel", e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-[#dadce0] bg-white px-3 py-2 text-[13px] outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
                >
                  {CHANNELS.map((channel) => (
                    <option key={channel.value} value={channel.value}>
                      {channel.value
                        ? channel.label
                        : tenantText("Any / unknown", "Cualquiera / desconocido")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[12px] font-medium text-[#3c4043]">
                {tenantText("Sender ID", "ID del remitente")}
                <input
                  value={form.external_sender_id ?? ""}
                  onChange={(e) => updateForm("external_sender_id", e.target.value)}
                  placeholder={tenantText(
                    "Exact channel sender id",
                    "Identificador exacto del remitente en el canal",
                  )}
                  className="mt-1.5 w-full rounded-lg border border-[#dadce0] px-3 py-2 text-[13px] outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
                />
              </label>
              <label className="text-[12px] font-medium text-[#3c4043]">
                {tenantText("Label", "Etiqueta")}
                <select
                  value={form.label ?? ""}
                  onChange={(e) => updateForm("label", e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-[#dadce0] bg-white px-3 py-2 text-[13px] outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
                >
                  <option value="">{tenantText("Choose label", "Elegir etiqueta")}</option>
                  {LABELS.map((label) => (
                    <option key={label} value={label}>{contactLabel(label)}</option>
                  ))}
                </select>
              </label>
              <label className="sm:col-span-2 text-[12px] font-medium text-[#3c4043]">
                {tenantText("Note / reason", "Nota / motivo")}
                <textarea
                  value={form.note ?? ""}
                  onChange={(e) => updateForm("note", e.target.value)}
                  rows={3}
                  placeholder={tenantText(
                    "Why this contact should be ignored",
                    "Por qué debe ignorarse este contacto",
                  )}
                  className="mt-1.5 w-full resize-y rounded-lg border border-[#dadce0] px-3 py-2 text-[13px] outline-none focus:border-[#1a73e8] focus:ring-1 focus:ring-[#1a73e8]"
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                disabled={!manualValid || addContact.isPending}
                onClick={handleAdd}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#1a73e8] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#1765c1] disabled:cursor-not-allowed disabled:bg-[#c8d4e6]"
              >
                {addContact.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
                {tenantText("Add to Ignore List", "Añadir a la lista de exclusión")}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-[#edf0f3] px-4 py-4">
            <p className="text-[13px] font-semibold text-[#202124]">
              {tenantText("Import contacts", "Importar contactos")}
            </p>
            <p className="mt-1 text-[12px] leading-5 text-[#5f6368]">
              {tenantText(
                "Upload a CSV with name, phone, email, label, note, channel, or upload a VCF exported from your contacts.",
                "Sube un CSV con nombre, teléfono, correo, etiqueta, nota y canal, o un VCF exportado desde tus contactos.",
              )}
            </p>
            <div className="mt-3 rounded-lg border border-dashed border-[#cbd5e1] bg-[#f8fafc] px-3 py-3 text-[12px] text-[#5f6368]">
              {tenantText(
                "Phone contact import is not supported in this browser. Use VCF, CSV, or manual add.",
                "Este navegador no permite importar directamente los contactos del teléfono. Usa VCF, CSV o la entrada manual.",
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.vcf,.vcard,text/csv,text/vcard"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              className="sr-only"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={validateImport.isPending}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#dadce0] bg-white px-4 py-2 text-[13px] font-medium text-[#202124] hover:border-[#1a73e8] hover:text-[#1a73e8] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {validateImport.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <UploadCloud className="h-4 w-4" aria-hidden="true" />}
              {tenantText("Upload CSV or VCF", "Subir CSV o VCF")}
            </button>
          </div>
        </div>

        {preview && (
          <div className="rounded-xl border border-[#edf0f3] px-4 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[13px] font-semibold text-[#202124]">
                  {tenantText("Import preview", "Vista previa de importación")}
                </p>
                <p className="mt-1 text-[12px] text-[#5f6368]">
                  {tenantText(
                    "Review contacts before saving. Deselect anything you do not want to add.",
                    "Revisa los contactos antes de guardar y desmarca los que no quieras añadir.",
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={handleImport}
                disabled={selectedPreviewContacts.length === 0 || importContacts.isPending}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#1a73e8] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#1765c1] disabled:cursor-not-allowed disabled:bg-[#c8d4e6]"
              >
                {importContacts.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
                {tenantText("Save selected contacts", "Guardar contactos seleccionados")}
              </button>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label={tenantText("Total", "Total")} value={preview.summary.total} />
              <Stat label={tenantText("Valid", "Válidos")} value={preview.summary.valid} />
              <Stat label={tenantText("Duplicates", "Duplicados")} value={preview.summary.duplicates} />
              <Stat label={tenantText("Invalid", "No válidos")} value={preview.summary.invalid} />
              <Stat label={tenantText("Already ignored", "Ya excluidos")} value={preview.summary.alreadyIgnored} />
              <Stat label={tenantText("To add", "Para añadir")} value={selectedPreviewContacts.length} />
            </div>
            <ul className="mt-4 max-h-[360px] divide-y divide-[#f1f3f4] overflow-y-auto rounded-xl border border-[#edf0f3]">
              {preview.contacts.map((row) => {
                const key = contactKey(row);
                const canSelect = row.valid && !row.duplicate && !row.alreadyIgnored;
                return (
                  <li key={key} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-start sm:justify-between">
                    <label className="flex min-w-0 gap-3">
                      <input
                        type="checkbox"
                        checked={selected.has(key)}
                        disabled={!canSelect}
                        onChange={(e) => toggleImportRow(row, e.target.checked)}
                        className="mt-1 h-4 w-4 rounded border-[#cfd4dc] text-[#1a73e8] focus:ring-[#1a73e8]/30 disabled:opacity-40"
                      />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium text-[#202124]">
                          {row.name || row.email || row.phone ||
                            tenantText("Unnamed contact", "Contacto sin nombre")}
                        </span>
                        <span className="mt-0.5 block break-words text-[12px] text-[#5f6368]">
                          {[row.phone, row.email, row.channel, row.label].filter(Boolean).join(" · ") ||
                            tenantText("No contact details", "Sin datos de contacto")}
                        </span>
                        {row.errors.length > 0 && (
                          <span className="mt-1 block text-[12px] text-[#b3261e]">{row.errors.join(" ")}</span>
                        )}
                      </span>
                    </label>
                    <span
                      className={cn(
                        "self-start rounded-full px-2 py-0.5 text-[11px] font-medium",
                        canSelect ? "bg-[#e6f4ea] text-[#137333]" : "bg-[#fce8e6] text-[#a50e0e]",
                      )}
                    >
                      {canSelect
                        ? tenantText("Ready", "Listo")
                        : row.alreadyIgnored
                          ? tenantText("Already ignored", "Ya excluido")
                          : row.duplicate
                            ? tenantText("Duplicate", "Duplicado")
                            : tenantText("Invalid", "No válido")}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="rounded-xl border border-[#edf0f3] px-4 py-4">
          <p className="text-[13px] font-semibold text-[#202124]">
            {tenantText("Current Ignore List", "Lista de exclusión actual")}
          </p>
          {isLoading ? (
            <div className="mt-3 flex items-center gap-2 text-[13px] text-[#5f6368]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {tenantText("Loading excluded contacts...", "Cargando contactos excluidos...")}
            </div>
          ) : isError ? (
            <p className="mt-3 text-[13px] text-[#c5221f]">
              {error instanceof Error && error.message
                ? tenantText(
                    `Couldn't load excluded contacts: ${error.message}`,
                    `No se pudieron cargar los contactos excluidos: ${error.message}`,
                  )
                : tenantText(
                    "Couldn't load excluded contacts.",
                    "No se pudieron cargar los contactos excluidos.",
                  )}
            </p>
          ) : contacts.length === 0 ? (
            <p className="mt-3 text-[13px] text-[#5f6368]">
              {tenantText("No contacts are excluded yet.", "Todavía no hay contactos excluidos.")}
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-[#f1f3f4]">
              {contacts.map((contact) => {
                const deleting = deleteContact.isPending && deleteContact.variables === contact.id;
                return (
                  <li key={contact.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-[#202124]">
                        {contact.name || contact.email || contact.phone || contact.externalSenderId ||
                          tenantText("Excluded contact", "Contacto excluido")}
                      </p>
                      <p className="mt-0.5 break-words text-[12px] text-[#5f6368]">
                        {[contact.phone, contact.email, contact.channel, contact.externalSenderId, contact.label].filter(Boolean).join(" · ") ||
                          tenantText("No contact details", "Sin datos de contacto")}
                      </p>
                      {contact.note && <p className="mt-1 text-[12px] text-[#5f6368]">{contact.note}</p>}
                      <p className="mt-1 text-[11px] text-[#80868b]">
                        {tenantText("Updated", "Actualizado el")} {formatDate(contact.updatedAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(contact.id)}
                      disabled={deleting}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#f4c7c3] bg-white px-3 py-1.5 text-[12px] font-medium text-[#b3261e] hover:bg-[#fce8e6] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
                      {tenantText("Remove", "Eliminar")}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
