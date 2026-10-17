# PRD Quality Review — Restaurant Web App

Calibration: hobby/study project, 2-day MVP timebox, deliberately about two pages long. The PRD is not marked down for being short. The substance bar still applies, and done-ness gets the strictest reading because stories will be built from the FRs.

## Overall verdict
This PRD is tight, honest and ready to build from. The vision is specific, the scope cuts are explicit with reasons, the success criteria tie back to the two journeys, and almost every FR has testable consequences. The main risk is the Order access model. FR-4 ("Anyone holding an Order Reference can view that Order") conflicts with FR-3, FR-7 and §6.2 on whether a Guest can read another Order or a *Collected* Order. Some smaller gaps would also leave an engineer guessing: no time bound on board updates, an undefined staff session expiry, and no rule for Orders nobody collects.

## Decision-readiness — strong
The decisions are stated as decisions, and what was given up is named. §1 says "deliberately runs a single kitchen with no payment". FR-3 accepts a known hole in plain words: "a different device or cleared browser is a new Guest; acceptable for the MVP". §6.2 gives a reason for each deferral, for example kitchen sections are out because a "single kitchen keeps the MVP simple". §7 adds a counter-metric aimed at the author's own scope creep. "Open Questions: None open" is believable, because the remaining open choice (polling vs SSE vs WebSocket) is sent to architecture in the addendum.

One decision is left hanging. The addendum research recommends a "long random token in the tracking link, short number (e.g. "#A42") for display", but the PRD never adopts or rejects it. That matters because UJ-1 has Lena *type* her Order Reference on another device, and FR-4 requires it to be "not short numeric".

### Findings
- **medium** Order Reference format left undecided (§3 Order Reference, UJ-1 edge case, FR-4) — the reference must be "Hard to guess and not sequential", yet a Guest types it on another device and Kitchen Staff call Orders by name. A long token is hard to type. A short code is easy to guess. *Fix:* adopt the addendum pattern as a decision. Order Reference = long random token, delivered as a shareable tracking link. Add a separate short display number for the counter, and add it to the Glossary. Change the UJ-1 edge case to "opens her tracking link on another device".

## Substance over theater — strong
There is no furniture here. The three JTBDs (§2.1) each drive real decisions. The Builder JTBD explains why caching, a Redis-backed session store and tested auth rules are in scope at all. Two named journeys, no persona padding. The NFRs (§5) are short and specific to this product. The Tests NFR names the exact FRs to cover, not "the system shall be well tested". The Vision (§1) could not be swapped into another restaurant PRD unchanged, because it names the four-status chain and the guest-without-account bet.

No findings.

## Strategic coherence — strong
The thesis is explicit in §0 and the addendum: "features are chosen to exercise each technology for real". Scope follows from it. FR-1 caching exists to exercise Redis. FR-3 and FR-6 together exercise two session models. FR-5 exercises live delivery. The deferred work in §1 and §6.2 ("each chosen because it exercises a new piece of the stack") follows the same logic. Success (§7) checks the thesis directly: both journeys work end to end and the auth/authz tests pass. The counter-metric guards against the obvious failure mode of a timeboxed demo.

No findings.

## Done-ness clarity — adequate
Most FRs carry concrete, testable consequences. FR-2 lists the exact rejection cases ("zero items, quantity < 1, or an unknown Menu Item") and the price rule ("taken from the Menu on the server, never from the client"). FR-3 gives a 24-hour expiry and the one-open-Order rule. FR-9 spells out each transition by name. FR-5 has a 5-second bound. The gaps are where a story writer would have to invent the acceptance criteria.

### Findings
- **high** Order access rules contradict each other (FR-3, FR-4, FR-7, §6.2) — FR-4 says "Anyone holding an Order Reference can view that Order's status", with no exception for *Collected* Orders. §6.2 says "once *Collected*, an Order is not shown to the Guest again", and FR-3 says "No past Orders are kept on the device". FR-7 says "A Guest Session cannot read another Guest's Order", yet under FR-4 any Guest who holds another Guest's reference can read that Order. An engineer cannot write the authorization test for the Order read endpoint without choosing a side. *Fix:* state one rule. For example: "An Order is readable by (a) its own Guest Session, or (b) anyone presenting its Order Reference, until N hours after it becomes *Collected*. After that it returns not-found." Then reword FR-7 to "A Guest Session alone grants no access to any other Order", and align §6.2.
- **medium** Kitchen Board live updates have no bound (FR-8) — "New Orders appear on the board without a manual reload" has no time limit, unlike FR-5's "within 5 seconds". With two Kitchen Staff on the board, the PRD also never says that one person's status change must show up on the other's board. *Fix:* "New Orders and status changes made by any Kitchen Staff appear on every open Kitchen Board within 5 seconds."
- **medium** Staff session expiry undefined (FR-6) — "stays alive across page refreshes until logout or expiry", but no expiry is given, so the expiry and refresh path that §5 Tests asks to cover ("login/logout/refresh/revocation") has no target. *Fix:* give the bound, e.g. "expires after 12 hours of inactivity" (the value is a placeholder), and tag it `[ASSUMPTION]`.
- **medium** Menu cache invalidation has no trigger (FR-1) — "a change to Menu data invalidates the cache", but §6.2 rules out any Menu management UI ("seed data only"). The only way to change Menu data is to reseed, so it is unclear what a test should do. *Fix:* "Re-running the Menu seed invalidates the cache; the next request returns the new data", or cut to "The Menu is cached with a TTL of N minutes".
- **low** Vague phrasing in consequences — FR-2's "rejected with a clear error" and FR-7's "rejected (401/403)" don't say which status applies when. *Fix:* "401 when no session; 403 when a Guest Session calls a Kitchen Staff endpoint". For FR-2, name the error per case or just require a 400 with a field-level message.
- **low** Tests NFR skips FR-4 (§5) — Order Reference non-enumeration and "does not reveal whether other Orders exist" are the security properties the addendum research singles out (IDOR), but they are not in the required test list. *Fix:* add "FR-4 unknown-reference and non-enumeration" to the §5 Tests list.

## Scope honesty — adequate
§6.2 is explicit and does real work: it rules out Cancelled, Takeout, Payment, past orders, management UIs and the message queue, each one a thing a reader might otherwise assume. Assumptions are tagged inline. The open-items count is low, which fits a 2-day build.

One operational omission is assumed silently. With no Cancelled state and forward-only transitions, an Order whose Guest never shows up has no exit. FR-3 lets the Guest Session expire after 24 hours, but the Order stays *Ready* on the board indefinitely. In practice staff would have to "Mark Collected" on food nobody collected.

### Findings
- **medium** No exit for uncollected Orders (FR-3, FR-8, FR-9, §6.2 "Cancelled state") — the 24-hour Guest Session expiry ends the Guest side only. The Kitchen Board keeps the Order forever. *Fix:* add one line to §6.2 or FR-9: "`[NON-GOAL for MVP]` No-show Orders: staff mark them *Collected* to clear the board; a proper Cancelled/Expired state comes post-MVP."

## Downstream usability — adequate
A Glossary is present, and the status names (*Received / Preparing / Ready / Collected*) and action names (Take, Mark Ready, Mark Collected) are used verbatim in the UJs, FRs and §4.5. The FR IDs (FR-1 to FR-9) and UJ IDs (UJ-1, UJ-2) run without gaps, and each feature says which UJ it "Realizes". The UJ consequences match the FRs: refresh keeps the Order (FR-3), live status (FR-5), *Collected* leaves the board (FR-8), and logout revokes the session (FR-6). A few definitions drift or are incomplete in ways that will surface during story creation.

### Findings
- **medium** Guest Session glossary entry is incomplete (§3 vs FR-3) — the Glossary says a Guest Session "ends when that Order is *Collected*", but FR-3 adds a second end condition ("expires 24 hours after the Order is placed") and the one-open-Order rule. Anyone reading the Glossary on its own gets the wrong lifecycle. *Fix:* extend the entry: "…ends when that Order is *Collected* or 24 hours after placement, whichever comes first. While it is active, the Guest cannot place another Order."
- **low** "name" vs "first name" (FR-2 vs FR-4) — FR-2 collects "their name", FR-4 shows "the Guest's first name", and FR-8 shows "Guest name". *Fix:* define a Glossary term, "Guest Name — a single free-text name field", and use it in all three FRs. Alternatively, drop "first" from FR-4.
- **low** Implementation term in an FR (FR-6) — "the old session and its refresh token are rejected" brings an addendum mechanism into the what-spec. *Fix:* "After logout, the session can no longer be used or renewed."

## Shape fit — strong
This is a hobby/solo project with two real roles. Two UJs with named protagonists (Lena, Omar) is the right level: they are load-bearing for the demo script in §7 and do not inflate the document. The PRD is neither over- nor under-formalized. The stack sits in the addendum, which keeps the PRD itself free of technology choices apart from the small FR-6 slip noted above.

No findings.

## Mechanical notes
- **Assumptions Index formatting (§9, line 138):** two entries are merged onto one line: "…no phone or email.- §4.3 FR-5 — …". Split them.
- **Assumptions Index roundtrip:** the index entry "§4.1 — Menu comes from seed data; no admin UI" has no inline `[ASSUMPTION]` tag in §4.1, where it is stated as fact. The §4.4 inline tag is a bare `[ASSUMPTION]` with no text. Either tag §4.1 inline or drop it from the index, and give the §4.4 tag its text ("accounts are seeded; no sign-up").
- **Index order:** the §4.1 entry is listed last. Sort the index by section.
- **Working title:** "*Working title — confirm.*" (line 9) is an open item, yet §8 says "None open". Either confirm the title or list it in §8.
- **UJ protagonists:** both named, with role context inline. OK.
- **Cross-refs:** all FR/UJ/§ references resolve.
