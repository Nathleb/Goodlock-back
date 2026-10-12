# Decks — design

Date: 2026-10-12
Status: validated, ready for planning
Slice: **B** of three (A: catalog + collection — done, B: decks, C: match entry). Items stay out of scope.

## Problem

Players own characters (slice A) but cannot say which ones they want to play. Slice C will add
**team preview**: both decks are revealed before a match and each player secretly keeps 5 of their 7
(in the spirit of the competitive Pokémon format: bring 6, see the opponent's 6, keep 4). That needs a persisted, validated deck to
exist first. This slice adds decks and nothing about matches.

## Decisions

1. **Decision:** a deck is **7 distinct owned characters**, unordered, rather than a 5-character team,
   because the match pick (keep 5, drop 2 after seeing the opponent's deck) is the point of having a deck.
   Team size in a match stays 5; nothing in the combat or placement rules changes.
2. **Decision:** at most **5 decks per user**, each with a name, and the last deck cannot be deleted,
   because slice C must always find a deck to play and the mobile UI needs a bounded list.
3. **Decision:** persisted as **`Deck` + `DeckSlot`** tables rather than an id array on `Deck`, because
   items will attach to a deck slot later and must not require splitting a column then. Agreed explicitly
   (second player-data table set, per the CLAUDE.md persistence rule).
4. **Decision:** decks are validated **on write only**, with no `isValid` flag on read, because a saved
   deck cannot become invalid: characters are never removed from the catalog once the game ships (before
   that, a replacement character reuses the old id), and ownership is never lost. Write-time checks stay,
   since the client can send anything.
5. **Decision:** a **starter deck** is created on register (and on login when the user has no deck), using
   the first 7 catalog ids sorted alphabetically — the simplest deterministic choice while the game is
   being built. Temporary, like the grant-all of slice A; idempotent; a failure is logged and never fails
   authentication.
6. **Decision:** composition rules live in the **domain** as a pure function; ownership and catalog lookups
   are passed in, so the domain stays free of I/O.

## Rules

`DECK_SIZE = 7`, `MAX_DECKS_PER_USER = 5`, name 1–30 characters after trim.

`validateDeck(characterIds, { isKnown, isOwned })` returns a list of errors:

- not exactly 7 ids;
- duplicate ids;
- an id the catalog does not know;
- an id the user does not own.

Used on write; a violation rejects the request with 400.

## Data model

```prisma
model Deck {
  id        String     @id @default(uuid())
  userId    String
  name      String
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
  user      User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  slots     DeckSlot[]

  @@index([userId])
}

model DeckSlot {
  id          String @id @default(uuid())
  deckId      String
  position    Int    // 0..6, stable slot identity for future items; not a play order
  characterId String // catalog id, validated on write, deliberately not a FK (see slice A)
  deck        Deck   @relation(fields: [deckId], references: [id], onDelete: Cascade)

  @@unique([deckId, position])
  @@unique([deckId, characterId])
}
```

`User` gains `decks Deck[]`. Migration: `add_decks`.

Updating a deck replaces its slots inside one transaction. When items arrive, an update will have to keep
slots whose character did not change; that is the items slice's concern.

## Application

- Branded `DeckId` in `shared/branded.types.ts`.
- `DeckPort` (`DECK_PORT`): `listByUser`, `findById`, `countByUser`, `create`, `update` (name + slots,
  transactional), `delete`. Implemented by `DeckRepository` over Prisma (no spec, per convention).
- `DeckCoordinatorService`, using `DeckPort`, `CollectionPort` (ownership) and `CatalogPort`:
  - `list(userId)` → `DeckDTO[]`;
  - `create(userId, dto)` → 400 on invalid composition, 409 when the user already has 5 decks;
  - `update(userId, deckId, dto)` → 404 when the deck is missing **or belongs to someone else** (no
    existence leak), 400 on invalid composition;
  - `delete(userId, deckId)` → 404 as above, 409 on the last deck;
  - `ensureStarterDeck(userId)` → creates the starter deck only if the user has none.
- `AuthCoordinator` calls `ensureStarterDeck` after `grantAll` (ownership must exist first), inside the same
  log-and-continue guard.

Accepted limitation: the 5-deck limit is a count-then-insert, so two simultaneous creates could produce a
sixth deck. Harmless at this stage; a transaction can close it later if needed.

## API

All under `JwtAccessGuard`, user from `req.user.sub`.

```ts
type DeckDTO = {
    id: string;
    name: string;
    characterIds: string[];   // slot order
    createdAt: string;        // ISO
    updatedAt: string;        // ISO
};

// GET    /decks       -> { decks: DeckDTO[] }
// POST   /decks       body { name, characterIds } -> DeckDTO   (201)
// PUT    /decks/:id   body { name, characterIds } -> DeckDTO
// DELETE /decks/:id   -> 204
```

Request body: `SaveDeckDto` with class-validator (`name` string 1–30, `characterIds` array of 7 strings);
the global `ValidationPipe` (whitelist + forbidNonWhitelisted) already rejects anything else. Composition
rules (ownership, catalog, duplicates) are checked by the coordinator, not the DTO.

## Testing strategy

TDD bottom-up; domain specs import no NestJS.

1. **Domain** — `validateDeck`: valid deck, wrong size, duplicates, unknown id, unowned id, several errors.
2. **Application** — `DeckCoordinatorService` with mocked ports: list maps records to DTOs;
   create/update reject bad compositions; limit of 5; 404 for another user's deck; last deck not deletable;
   `ensureStarterDeck` creates once, uses the first 7 sorted ids, does nothing when a deck exists.
3. **Application** — `AuthCoordinator`: starter deck after grant on register and login; failures logged.
4. **Infrastructure** — `DeckController` with a mocked coordinator (mirrors `CollectionController.spec.ts`),
   module wiring test with Prisma mocked.

## Out of scope

Team preview and the pick of 5 (slice C), items on slots, deck sharing/import codes, ordering of decks.
