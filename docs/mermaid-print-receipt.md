# Mermaid operator receipt printing

The booked-reservation `view_receipt` action now displays **Print receipt** with a printer icon and invokes the browser print dialog instead of navigating back to the same reservation.

Receipt printing remains available for booked journeys when a human handover replaces the primary action, or when no primary action is supplied. The existing Continue as human action remains available alongside printing.

The paper surface is a React portal attached directly to the document body. It stays hidden on screen; print CSS shows only the receipt and suppresses dashboard navigation, chat history, toasts and other application controls. It is removed when the reservation page unmounts. Guest values are escaped by React; no raw HTML, new popup, third-party service or new dependency is used.

The operator copy contains the booking and receipt references, guest/contact, full trip date including year, party breakdown, transport, captured line items and total, relevant crew notes and catalog/revision provenance. Amounts come from the reservation snapshot, not current catalog prices. Demo checkout is explicitly labelled **not proof of payment**. Printing creates no booking, payment, message or receipt record. It is unavailable for unfinished/cancelled reservations or missing booking/receipt references.

## Verification

- Ten regression tests cover printing/reprinting without navigation, exact captured data, no chat on paper, unavailable receipt guards, booked handovers, preserving other actions, escaped guest input and portal cleanup.
- Actual reservation page tested in a localhost-only harness with synthetic data and external network calls disabled. Desktop and 390px mobile expose Print receipt; instrumented click called `window.print()` once.
- Chromium print rendering: standard operator receipt one Letter page; oversized crew notes continue over three pages without clipping. PDF pages rendered and visually reviewed. No dashboard controls or private chat content appeared in print output.
- Temporary harness removed before production build. Synthetic fixtures live only under the test directory and are not imported by production code.
- No physical printer was used; printer choice and the final Print confirmation belong to the operator.
