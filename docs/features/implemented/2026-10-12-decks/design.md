# Decks — design

**Status:** implemented 2026-10-12

Slice **B** of three (A: catalog + collection, B: decks, C: match entry). Items stay out of scope.

## Purpose

Players own characters (slice A) but must say which ones they bring. A deck is the persisted, validated pool a player brings to a match; at team preview (match entry spec) both decks are revealed and each player secretly keeps 4 of their 6. Decks themselves know nothing about matches.

## Decisions

1. **Decision:** a deck is **6 distinct owned characters** (`DECK_SIZE`), unordered, rather than a 4-character team, because the match pick (keep 4, drop 2 after seeing the opponent's deck) is the point of having a deck. The team size in a match is `TEAM_SIZE = 4`.
2. **Decision:** at most **5 decks per user** (`MAX_DECKS_PER_USER`), each with a name, and the last deck cannot be deleted, because match entry must always find a deck to play and the mobile UI needs a bounded list.
3. **Decision:** persisted as **`Deck` + `DeckSlot`** tables rather than an id array on `Deck`, because items will attach to a deck slot later and must not require splitting a column then.
4. **Decision:** decks are validated **on write only**, with no `isValid` flag on read, because a saved deck cannot become invalid: catalog ids are permanent (characters are never removed once released) and ownership is never lost. Write-time checks stay, since the client can send anything.
5. **Decision:** a **starter deck** is created on register and on login when the user has none, from the first `DECK_SIZE` catalog ids sorted alphabetically, the simplest deterministic choice while the game is being built. Temporary, like the grant-all of the collection; idempotent; a failure is logged and never fails authentication. If the collection grant failed, the starter deck is skipped (it would reference characters the user does not own).
6. **Decision:** composition rules live in the **domain** as a pure function; ownership and catalog lookups are passed in, so the domain stays free of I/O.

## Rules

`DECK_SIZE = 6`, `MAX_DECKS_PER_USER = 5`, `TEAM_SIZE = 4` (`src/domain/services/Deck.service.ts`). Deck name: 1 to 30 characters after trimming.

`validateDeck(characterIds, { isKnown, isOwned })` returns every problem found (`[]` means valid):

- not exactly `DECK_SIZE` ids;
- duplicate ids;
- an id the catalog does not know;
- an id the user does not own.

A violation on write rejects the request with 400.

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
  position    Int    // 0..5, stable slot identity for future items; not a play order
  characterId String // catalog id, validated on write, deliberately not a FK
  deck        Deck   @relation(fields: [deckId], references: [id], onDelete: Cascade)

  @@unique([deckId, position])
  @@unique([deckId, characterId])
}
```

Updating a deck replaces its slots inside one transaction. When items arrive, an update will have to keep slots whose character did not change; that is the items feature's concern.

## Application

- `DeckId` is a branded id in `src/shared/branded.types.ts`.
- `DeckPort` (`DECK_PORT`): `listByUser`, `findById`, `countByUser`, `create`, `update` (name and slots, transactional), `delete`. `DeckRepository` implements it over Prisma (no spec of its own, per convention).
- `DeckCoordinatorService`, using `DeckPort`, `CatalogPort`, and `CollectionCoordinatorService.ownedIds` for ownership (so `CollectionPort` stays private to the collection module):
  - `list(userId)`;
  - `create(userId, dto)`: 400 on invalid composition, 409 when the user already has 5 decks;
  - `update(userId, deckId, dto)`: 404 when the deck is missing **or belongs to someone else** (no existence leak), 400 on invalid composition;
  - `delete(userId, deckId)`: 404 as above, 409 on the last deck;
  - `getOwnDeckCharacterIds(userId, deckId)`: the deck's catalog ids for its owner, used by the lobby's `selectDeck`; another user's deck answers 404;
  - `ensureStarterDeck(userId)`: creates the starter deck only if the user has none.
- `AuthCoordinatorService` calls `ensureStarterDeck` after the collection grant (ownership must exist first), inside the same log-and-continue guard.

The name is trimmed and checked (1 to 30) in the coordinator, because the global `ValidationPipe` does not run with `transform: true`, so a DTO-level trim would never reach the handler. `SaveDeckDto` only bounds the shape (string name up to 100, exactly `DECK_SIZE` string ids, no extra fields).

Accepted limitation: the 5-deck limit is a count-then-insert, so two simultaneous creates could produce a sixth deck. Harmless at this stage; a transaction can close it later.

## API

All under `JwtAccessGuard`, user from `req.user.sub`. `DeckController` is declared in `AppModule` (same module-cycle reason as `CollectionController`).

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

## Tests

Domain specs import no NestJS.

1. `Deck.service.spec`: valid deck, wrong size, duplicates, unknown id, unowned id, several errors at once.
2. `DeckCoordinator.service.spec` with mocked ports: list maps records to DTOs; create and update reject bad compositions; the limit of 5; 404 for another user's deck; the last deck is not deletable; `ensureStarterDeck` creates once from the first sorted ids and does nothing when a deck exists.
3. `AuthCoordinator.service.spec`: starter deck after the grant on register and login; failures are logged, not fatal.
4. `DeckController.spec` with a mocked coordinator; `DeckModule.spec` for the wiring with Prisma mocked; `SaveDeckDto` through a real `ValidationPipe` with the options from `main.ts`.

## Out of scope

Items on slots, deck sharing or import codes, ordering of decks.
