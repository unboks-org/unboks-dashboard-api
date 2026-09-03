# Mermaid reservation dashboard

Implements issue #152 as a Mermaid-only extension of the premium operations
shell. The five destinations are Today, Reservations, Conversations, Trip &
pricing, and Settings. Reservation detail follows the server-owned
Details -> Quote -> Payment -> Booked stage and displays conversation,
customer and guest details, immutable catalog pricing, artifact delivery,
the demo booking code, and the event timeline.

Every payment surface is marked as simulated. The frontend does not infer
workflow transitions, display reminder controls, or expose this navigation to
another tenant. Disabling Mermaid's dashboard projection returns the tenant to
the pre-existing capability gate without deleting data.
