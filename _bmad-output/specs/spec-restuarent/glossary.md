# Glossary

- **Guest** — an unauthenticated customer. Places Orders; holds a Guest Session.
- **Guest Session** — issued when a Guest places an Order; returns them to that Order after a page refresh without re-entering the Order Reference. One Guest Session tracks one Order. Ends when that Order is Collected or 24 h after placement, whichever comes first. While active, the Guest cannot place another Order.
- **Kitchen Staff** — authenticated user who manages Orders on the Kitchen Board. The only role that logs in for the MVP.
- **Kitchen Board** — Kitchen Staff view of open Orders (not yet Collected), grouped by Order Status.
- **Menu** — the public list of Menu Items, grouped by category.
- **Menu Item** — a dish or drink with name, description, price, and category.
- **Order** — one or more Menu Items with quantities, placed by a Guest. Has exactly one Order Status.
- **Order Reference** — the identifier given to the Guest: 6 random letters and digits (e.g. `K7F29Q`). Short enough to type, not sequential, hard to guess.
- **Order Status** — one of, in order:
  - *Received* — placed, waiting to be taken by the kitchen.
  - *Preparing* — taken, in preparation.
  - *Ready* — waiting for the Guest to collect.
  - *Collected* — handed over; the Order is done (final).
