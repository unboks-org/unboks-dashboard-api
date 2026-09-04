import { createPortal } from "react-dom";
import type { MermaidReservationDetail } from "@/lib/api";
import {
  formatMermaidTripDate,
  mermaidGuestCount,
} from "@/lib/mermaid-operations";

export function canPrintMermaidReceipt(
  item: MermaidReservationDetail,
): boolean {
  return (
    item.stage === "booked" && Boolean(item.bookingCode && item.receiptPublicId)
  );
}

/** A body-level print surface keeps the dashboard, chat and navigation off paper.
 * React escapes every guest-provided value; no document.write or HTML injection.
 * Uses the reservation's captured amounts, never today's catalog prices.
 */
export function MermaidPrintReceipt({
  item,
}: {
  item: MermaidReservationDetail;
}) {
  if (!canPrintMermaidReceipt(item)) return null;
  const receipt = item.documents.find(
    (doc) => doc.kind === "receipt" && doc.public_id === item.receiptPublicId,
  );

  return createPortal(
    <article
      className="mermaid-print-receipt"
      aria-label="Mermaid operator receipt"
      style={{ display: "none" }}
    >
      <style>{PRINT_CSS}</style>
      <header>
        <div>
          <p className="receipt-eyebrow">Mermaid Boat Trips Curaçao</p>
          <h1>Reservation receipt</h1>
          <p>Operator copy · Klein Curaçao Day Trip</p>
        </div>
        <div className="receipt-booking">
          <span>Booking reference</span>
          <strong>{item.bookingCode}</strong>
        </div>
      </header>

      <p className="receipt-demo">
        <strong>DEMO RECEIPT - NOT PROOF OF PAYMENT.</strong> Availability is
        assumed and checkout is simulated. No real payment is confirmed by this
        receipt.
      </p>

      <dl className="receipt-details">
        <Field label="Guest" value={item.customerName} />
        <Field
          label="Trip date"
          value={`${formatMermaidTripDate(item.tripDate)}, ${item.tripDate.slice(0, 4)}`}
        />
        <Field label="WhatsApp / conversation" value={item.conversationId} />
        <Field
          label="Guests"
          value={
            item.partyDescription ||
            `${mermaidGuestCount(item)} total: ${item.adults} ${item.adults === 1 ? "adult" : "adults"}, ${item.children} ${item.children === 1 ? "child" : "children"} (4-12), ${item.infants} ${item.infants === 1 ? "infant" : "infants"} (0-3)`
          }
        />
        <Field
          label="Transport"
          value={
            item.pickupPreference === "pier"
              ? "Arriving at Fishermen’s Pier"
              : `Pickup requested: ${item.pickupLocation || "location not recorded"}`
          }
        />
        <Field
          label="Payment reference (simulated)"
          value={item.paymentReference || "Not recorded"}
        />
      </dl>

      <table>
        <caption>Reservation charges · {item.currency}</caption>
        <thead>
          <tr>
            <th scope="col">Description</th>
            <th scope="col">Qty</th>
            <th scope="col">Unit price</th>
            <th scope="col">Amount</th>
          </tr>
        </thead>
        <tbody>
          {item.items.map((line, index) => (
            <tr key={`${line.key}-${index}`}>
              <td>{line.label}</td>
              <td>{line.quantity}</td>
              <td>{money(item.currency, line.unit_amount)}</td>
              <td>{money(item.currency, line.line_total)}</td>
            </tr>
          ))}
          {item.items.length === 0 ? (
            <tr>
              <td colSpan={4}>Itemized charges were not recorded.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <p className="receipt-total">
        <span>Reservation total (simulated)</span>
        <strong>{money(item.currency, item.total)}</strong>
      </p>
      {item.pickupPreference === "pickup_requested" ? (
        <p className="receipt-note">
          Pickup was requested; no pickup price is assumed or added to this
          total.
        </p>
      ) : null}

      {/* Accessibility/crew-assistance notes stay in authenticated dashboard
          surfaces only. They are intentionally excluded from printable PDFs. */}
      {item.dietaryRequirements || item.specialRequests ? (
        <section className="receipt-notes">
          <h2>Crew notes</h2>
          {item.dietaryRequirements ? (
            <p>
              <strong>Dietary:</strong> {item.dietaryRequirements}
            </p>
          ) : null}
          {item.specialRequests ? (
            <p>
              <strong>Special requests:</strong> {item.specialRequests}
            </p>
          ) : null}
        </section>
      ) : null}

      <footer>
        <p>
          <strong>Receipt:</strong> {item.receiptPublicId}
        </p>
        <p>
          <strong>Journey:</strong> {item.publicId} · <strong>Revision:</strong>{" "}
          {item.revision}
        </p>
        <p>
          <strong>Catalog snapshot:</strong> {item.catalogVersion}
        </p>
        {receipt ? (
          <p>
            <strong>Receipt issued:</strong> {issuedAt(receipt.created_at)}{" "}
            (Curaçao)
          </p>
        ) : null}
        <p>
          Internal operator copy from the reservation record. Not a tax invoice,
          boarding authorization or confirmation of a real payment.
        </p>
      </footer>
    </article>,
    document.body,
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function money(currency: string, amount: number): string {
  return `${currency} ${amount.toFixed(2)}`;
}

function issuedAt(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Curacao",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

const PRINT_CSS = `
@media print {
  @page { size: auto; margin: 14mm; }
  html, body { height: auto !important; overflow: visible !important; background: white !important; }
  body > :not(.mermaid-print-receipt) { display: none !important; }
  .mermaid-print-receipt { display: block !important; margin: 0; padding: 0; color: #111; background: white; font: 10pt/1.45 Arial, sans-serif; }
  .mermaid-print-receipt * { box-sizing: border-box; overflow-wrap: anywhere; }
  .mermaid-print-receipt header { display: flex; justify-content: space-between; gap: 8mm; border-bottom: 2pt solid #073b49; padding-bottom: 5mm; }
  .mermaid-print-receipt h1 { margin: 1mm 0; font-size: 23pt; line-height: 1.15; }
  .mermaid-print-receipt p { margin: 1.5mm 0; }
  .mermaid-print-receipt .receipt-eyebrow { font-weight: bold; font-size: 11pt; }
  .mermaid-print-receipt .receipt-booking { text-align: right; max-width: 75mm; }
  .mermaid-print-receipt .receipt-booking span { display: block; font-size: 9pt; }
  .mermaid-print-receipt .receipt-booking strong { display: block; font-size: 16pt; }
  .mermaid-print-receipt .receipt-demo { margin: 5mm 0; padding: 3mm; border: 1pt solid #444; font-size: 9pt; }
  .mermaid-print-receipt .receipt-demo strong { display: block; }
  .mermaid-print-receipt .receipt-details { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm 8mm; margin: 5mm 0; }
  .mermaid-print-receipt dt { font-size: 8.5pt; color: #444; }
  .mermaid-print-receipt dd { margin: 0; font-weight: bold; }
  .mermaid-print-receipt table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .mermaid-print-receipt caption { text-align: left; font-weight: bold; padding: 3mm 0; }
  .mermaid-print-receipt th, .mermaid-print-receipt td { padding: 2.5mm 1.5mm; border-bottom: 0.5pt solid #ccc; text-align: right; vertical-align: top; }
  .mermaid-print-receipt th:first-child, .mermaid-print-receipt td:first-child { width: 46%; text-align: left; }
  .mermaid-print-receipt th:nth-child(2) { width: 10%; }
  .mermaid-print-receipt thead { display: table-header-group; }
  .mermaid-print-receipt tr, .mermaid-print-receipt .receipt-details > div { break-inside: avoid; }
  .mermaid-print-receipt .receipt-total { display: flex; justify-content: space-between; gap: 5mm; padding: 4mm 0; border-bottom: 2pt solid #073b49; break-inside: avoid; }
  .mermaid-print-receipt .receipt-total strong { font-size: 15pt; white-space: nowrap; }
  .mermaid-print-receipt .receipt-note { font-size: 9pt; }
  .mermaid-print-receipt .receipt-notes { margin: 5mm 0; }
  .mermaid-print-receipt h2 { font-size: 11pt; margin: 0 0 2mm; break-after: avoid; }
  .mermaid-print-receipt footer { margin-top: 6mm; padding-top: 3mm; border-top: 0.5pt solid #aaa; font-size: 8pt; }
}
`;
