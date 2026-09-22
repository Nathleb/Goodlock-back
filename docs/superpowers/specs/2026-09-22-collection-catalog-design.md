# Character catalog and player collection — design

Date: 2026-09-22
Status: validated, ready for planning
Slice: **A** of three (A: catalog + collection, B: decks, C: match entry). Items are out of scope entirely.

## Problem

There is no notion of a player owning characters. At `startGame`, `GameCoordinator` globs `tmplt/*.json`
from disk, shuffles the ten templates and deals five to each player. Consequences:

- Characters have no stable identity: `createCharacterFromJsonTemplate` mints a fresh `crypto.randomUUID()`
  per match, so nothing can be referenced across matches or stored.
- File I/O (`readdirSync` + `readFileSync`) happens in the application layer, on every single match start.
- There is nothing for decks (slice B) or lobby deck selection (slice C) to build on.

This slice introduces the two missing concepts — a **catalog** of character definitions with stable ids,
and a **collection** of characters a user owns — and nothing else.

## Scope

In scope:

- Stable, authored ids for character templates.
- A `CatalogPort` that owns where character definitions come from, loaded and validated once at boot.
- A persisted `UserCharacter` ownership table, granted in full while acquisition rules do not exist.
- `GET /collection` returning the authenticated user's characters with their full die.
- Removing filesystem access from `GameCoordinator`.

Out of scope (later slices, listed so the plan does not drift into them):

- Decks and deck slots (slice B).
- Lobby deck selection, queueing, matchmaking (slice C).
- Items and character modifiers. Per the ownership decision below, items will attach to a **deck slot /
  loadout**, not to an owned character.
- Acquisition: currency, packs, progression, rewards.
- A versioned content bundle with hot reload (see Future directions).

## Decisions

Stated in the repo's decision format so they are captured as observations.

1. **Decision:** owned characters are an *unlocked set* rather than unique instances, because no
   per-character persistent state (level, XP, nickname) is planned; items will hang off the deck slot
   instead, which keeps ownership a pure set.
2. **Decision:** character definitions stay git-authored in `tmplt/*.json` rather than moving into
   Postgres, because balance data benefits from diffs, review and rollback, and the die is always read
   whole — normalising it into tables (`DieFace` → `EffectEntry` → `TargetGroup`) would cost four tables
   and a join tree while buying nothing this game needs.
3. **Decision:** no `Character` identity table, so no database foreign key from ownership to the catalog,
   because content is a build artifact rather than rows. This matches the common industry split (content
   as a versioned artifact, player state in the OLTP database) and is enforced instead by validating ids
   on write, tombstoning rather than deleting, and a boot-time consistency check.
4. **Decision:** ownership *is* persisted now, even though every user owns every character, because slice
   B's deck validation needs a real "does this user own this?" query to call. Without it the check gets
   hardcoded and has to be unpicked later; with it, acquisition only changes how rows are created.
5. **Decision:** the catalog is read from an in-memory map built at boot rather than queried per use,
   because it only changes on redeploy. This keeps the whole WebSocket coordinator path synchronous —
   no `await` ripples into `startGame` or the round flow.
6. **Decision:** `Result<T, E>` is **not** introduced here. `shared/result.type.ts` still does not exist;
   this slice follows the code's existing convention (throw at infrastructure boundaries, plain returns
   elsewhere). Introducing `Result` is its own change.

## Data model

One new model. `User` gains only a back-relation.

```prisma
model UserCharacter {
  id          String   @id @default(uuid())
  userId      String
  characterId String   // catalog id, e.g. "alicent" — validated against the catalog on write
  acquiredAt  DateTime @default(now())
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, characterId])
}
```

- `@@unique([userId, characterId])` makes grants idempotent (`skipDuplicates`) and duplicates impossible.
- `onDelete: Cascade` matches `RefreshToken`: deleting an account removes its collection.
- `characterId` is deliberately not a foreign key — see decision 3.
- Migration name: `add_user_character`.

## Catalog

**Template id.** `CharacterTemplate` gains `readonly id: string`, authored explicitly in each
`tmplt/*.json`:

```json
{
  "id": "alicent",
  "name": "Alicent",
  "maxHp": 10,
  "baseSpeed": 18,
  "baseDieInstructions": [ "…unchanged…" ]
}
```

Authored rather than derived from the filename or the display name, because the id is stored in database
rows: deriving it means a file rename or a flavour rename silently orphans every row and, later, every
deck slot. Shape: lowercase `[a-z0-9-]+`.

A branded `CatalogId` goes in `shared/branded.types.ts`; service signatures take `CatalogId`, never a raw
`string`, per the repo's rules.

**Validation** lives in the domain as a pure function, no I/O:

```ts
// src/domain/services/CharacterCatalog.service.ts
export function validateCatalog(templates: readonly CharacterTemplate[]): string[];
```

It reports a missing id, a malformed id, and duplicate ids. Per-template effect and target validation
already happens in `addEffectToFace` via `validateEffectTargets`.

**Loading.** `FileCharacterCatalog` (infrastructure) implements `CatalogPort`. On `OnModuleInit` it reads
`tmplt/*.json`, parses, runs `validateCatalog`, and builds every character once — injecting `EFFECT_FACTORY`
to do so — which surfaces per-template effect and target errors at startup. It **throws on any error**: a
bad catalog must fail at boot, not mid-match. Throwing is correct here: infrastructure, non-recoverable.
The built characters are discarded; only the validated templates are cached.

```ts
// src/application/ports/CatalogPort.ts
export interface CatalogPort {
    list(): readonly CharacterTemplate[];
    get(id: CatalogId): CharacterTemplate | undefined;
    has(id: CatalogId): boolean;
    ids(): readonly CatalogId[];
}
```

New tokens in `application/ports/tokens.ts`: `CATALOG_PORT`, `COLLECTION_PORT`.

**Domain additions.** `createCharacterFromTemplate(template, factory)` is added so JSON parsing leaves the
domain; `createCharacterFromJsonTemplate` becomes a thin wrapper over it, keeping existing specs working.
The runtime `Character` gains `readonly catalogId: CatalogId` — slice C needs it to build a team from a
deck, and the frontend needs it to map a character to its art.

`createCharacter` moves from positional parameters to a single object,
`createCharacter({ catalogId, name, maxHp, baseSpeed, baseDie, position })`, because `catalogId` would be a
sixth positional argument. Cost: roughly four specs updated.

**`GameCoordinator` cleanup.** `loadTemplates()` and its per-match `readdirSync`/`readFileSync` are
deleted; `startGame` shuffles `catalogPort.list()` instead. Behaviour is unchanged — still five characters
per player, still random — so this slice does not alter how a match begins.

## Collection

```ts
// src/application/ports/CollectionPort.ts
export type OwnedCharacterRow = { characterId: CatalogId; acquiredAt: Date };

export interface CollectionPort {
    listOwned(userId: UserId): Promise<readonly OwnedCharacterRow[]>;
    grantMany(userId: UserId, ids: readonly CatalogId[]): Promise<void>;  // idempotent
}
```

Note the asymmetry with `CatalogPort`, which is synchronous: the catalog is an in-memory map, while the
collection is a database read. `CollectionPort` is consumed only from REST handlers and the auth
coordinator — both already `async` — so **no `await` enters the WebSocket coordinator path in this slice**.
Slice C, where a match needs a deck, is where that question has to be answered.

`UserCharacterRepository` (infrastructure) implements it over Prisma, staying a thin wrapper — matching the
existing convention where `UserRepository` and `RefreshTokenRepository` have no specs of their own and are
covered through the coordinators that use them.

`CollectionCoordinatorService` (application) takes both ports and:

- maps owned rows through the catalog to DTOs;
- **skips** an owned id the catalog cannot resolve, rather than throwing — retiring a character by deleting
  its file is legitimate and must not break a player's collection;
- rejects a grant for an id absent from the catalog.

### API

`@Controller('collection')`, `@UseGuards(JwtAccessGuard)`, `userId` from `request.user.sub`. No global
route prefix exists, so the route is `GET /collection`, alongside `rooms` and `auth`.

```ts
type CollectionCharacterDTO = {
    id: string;              // catalog id
    name: string;
    maxHp: number;
    baseSpeed: number;
    baseDie: DieFaceDTO[];   // reused from GameState.dto.ts
    acquiredAt: string;      // ISO
};

// GET /collection -> { characters: CollectionCharacterDTO[] }
```

`DieFaceDTO` is reused deliberately: it already carries each effect's label, magnitude and target groups,
so one call gives the frontend everything needed to render a character's die *and* its targeting pattern,
using a type the client already has. An empty collection returns `{ characters: [] }`.

Mapping is template → DTO directly, without instantiating effect strategies through the factory.

### Granting

`grantMany` is idempotent and called from **both register and login**:

- Register alone is not enough: if the grant fails after the user row is written, that account is
  permanently empty and retrying registration hits "username already taken".
- Calling it on login makes the system self-healing and covers users who registered before this slice, so
  no backfill script is needed.
- It is deliberately not called from `GET /collection`: a side-effecting read is worse than a write on an
  endpoint that already writes.

This is explicitly temporary and exists only because acquisition is "everyone owns everything". It carries
a comment saying so and is removed by the acquisition slice.

### Replacing the dropped foreign key

At boot, after the catalog loads, count `UserCharacter` rows whose `characterId` is not in the catalog and
log a warning naming them. This restores the "fail loudly" property a foreign key would have given, at the
cost of one query.

## Testing strategy

TDD, bottom-up, per the repo's workflow. Domain specs import no NestJS.

1. **Domain** — `validateCatalog`: missing id, malformed id, duplicate ids, valid catalog.
   `createCharacterFromTemplate` sets `catalogId`. `createCharacter` object form.
2. **Content** — extend `tests/templates.spec.ts`: every shipped template has an id, ids are unique and
   well-formed. This guards the content, not just the code.
3. **Application** — `CollectionCoordinatorService` against mocked ports: owned ids map to DTOs; an
   unresolvable owned id is skipped; an empty collection returns an empty list; `grant` rejects an id
   absent from the catalog.
4. **Application** — extend `AuthCoordinator.service.spec.ts` with a mocked `CollectionPort`: register
   grants every catalog id; login grants idempotently.
5. **Infrastructure** — `FileCharacterCatalog` against a temporary fixture directory: loads a good catalog;
   throws at boot on duplicate ids and on a template missing an id. `CollectionController` with a mocked
   coordinator, mirroring `RoomController.spec.ts`. `UserCharacterRepository` gets no spec, per convention.
6. **Regression** — `startGame` still builds two teams of five, now from a mocked `CatalogPort` rather than
   the filesystem.

Verification: `npm run test`, `npm run lint`, `npm run build`.

## Impact on other work

- **No WebSocket protocol change.** This slice only adds a REST endpoint, so it adds nothing to the
  frontend's existing catch-up work from the auto-targeting merge.
- **Database.** First non-auth table. Justified by decision 4 and explicitly agreed; live game state stays
  in-memory in the `Manager` classes, unchanged.
- **`CLAUDE.md`** needs the catalog/collection bullets and a note that Postgres now holds player-owned data
  in addition to auth.

## Future directions

- **Acquisition** replaces grant-all: currency, packs or progression write `UserCharacter` rows, and the
  login-time grant is deleted.
- **Content versioning**: give the catalog a manifest version or hash once content is real, so a deck can
  record what it was built against and a balance hotfix can swap the in-memory map without a redeploy.
  `CatalogPort` is the seam — moving content to a database or a CDN bundle becomes an adapter swap, not a
  schema migration.
- **Retirement**: if a character is pulled from `tmplt/`, owned rows survive and are skipped on read. If
  retirement ever needs to be visible to players, a tombstone list in the catalog is the place for it.
