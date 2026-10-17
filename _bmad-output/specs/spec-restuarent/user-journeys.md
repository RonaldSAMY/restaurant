# User Journeys

The end-to-end demo script. Both run in one session with two browsers.

## UJ-1 — Lena orders lunch without an account (Guest)

1. Opens the site, browses the Menu, adds two dishes and a drink, enters her name, places the Order. (CAP-1, CAP-2)
2. Sees her Order Reference and status Received. (CAP-2)
3. Accidentally refreshes — her Order is still shown. (CAP-3)
4. Status changes to Preparing, then Ready, without reloading. (CAP-5)
5. Collects at the counter; page shows Collected; her Guest Session ends. (CAP-3)
6. Next day she returns and orders from scratch, as if for the first time. (CAP-3)
7. **Edge case:** on another device she types her Order Reference and sees the same status. (CAP-4)

## UJ-2 — Omar runs the kitchen board (Kitchen Staff)

1. Logs in as Kitchen Staff; sees Lena's Order under Received. (CAP-6, CAP-8)
2. Takes it (Preparing), marks it Ready once plated, marks it Collected when Lena picks it up — it leaves the board. (CAP-9, CAP-8)
3. At shift end logs out; his session can no longer be used. (CAP-6)
