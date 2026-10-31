# Character catalog and player collection — design

**Status:** implemented 2026-10-12

Slice **A** of three (A: catalog + collection, B: decks, C: match entry). Items are out of scope entirely.

## What it is

Two concepts:

- A **catalog** of character definitions with stable ids, loaded and validated once at boot.
- A **collection** of the catalog characters a user owns, persisted in Postgres.

The catalog is the single source of character definitions for the whole backend: decks, match entry and the collection endpoint all read it. No application code reads `tmplt/` directly.

## Scope

In scope: stable authored ids on templates, `CatalogPort`, the persisted `UserCharacter` ownership table (granted in full while acquisition rules do not exist), and `GET /collection` returning the authenticated user's characters with their full die.

Out of scope:

- Items and character modifiers. Items will attach to a **deck slot / loadout**, not to an owned character.
- Acquisition: currency, packs, progression, rewards.
- A versioned content bundle with hot reload (see Future directions).

## Decisions

1. **Decision:** owned characters are an *unlocked set* rather than unique instances, because no per-character persistent state (level, XP, nickname) is planned; items hang off the deck slot instead, which keeps ownership a pure set.
2. **Decision:** character definitions stay git-authored in `tmplt/*.json` rather than in Postgres, because balance data benefits from diffs, review and rollback, and the die is always read whole; normalising it into tables (`DieFace` -> `EffectEntry` -> `TargetGroup`) would cost several tables and a join tree while buying nothing this game needs.
3. **Decision:** no `Character` table, so no database foreign key from ownership (or deck slots) to the catalog, because content is a build artifact rather than rows. This is the usual split (content as a versioned artifact, player state in the OLTP database). It is enforced instead by validating ids on write, by catalog ids being permanent (a character is never removed once released; before release a replacement reuses the id), and by a boot-time consistency check.
4. **Decision:** ownership *is* persisted even though every user owns every character, because deck validation needs a real "does this user own this?" query. With it, acquisition only changes how rows are created.
5. **Decision:** the catalog is an in-memory map built at boot rather than queried per use, because templates are fixed for a given version of the app: "cached until restart" and "fixed for this version" are the same statement. It also keeps the whole WebSocket coordinator path synchronous. No reload hatch: editing a template requires a restart, which is correct for versioned content.
6. **Decision:** `Result<T, E>` is not used here; the slice follows the code's existing convention (throw at infrastructure boundaries, plain returns elsewhere).

## Data model

```prisma
model UserCharacter {
  id          String   @id @default(uuid())
  userId      String
  characterId String   // catalog id, e.g. "alicent"; validated against the catalog on write, deliberately not a FK
  acquiredAt  DateTime @default(now())
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, characterId])
}
```

- `@@unique([userId, characterId])` makes grants idempotent (`skipDuplicates`) and duplicates impossible.
- `onDelete: Cascade` matches `RefreshToken`: deleting an account removes its collection.
- `characterId` is deliberately not a foreign key (decision 3).

## Catalog

**Template id.** `CharacterTemplate` carries `readonly id: string`, authored explicitly in each `tmplt/*.json`:

```json
{ "id": "alicent", "name": "Alicent", "maxHp": 10, "baseSpeed": 18, "baseDieInstructions": [ "..." ] }
```

Authored rather than derived from the filename or the display name, because the id is stored in database rows: deriving it means a file rename or a flavour rename silently orphans every row and every deck slot. Shape: lowercase `[a-z0-9-]+`. **Never rename an id.**

`CatalogId` is a branded type (`src/shared/branded.types.ts`); service signatures take `CatalogId`, never a raw `string`. The runtime `Character` carries `readonly catalogId: CatalogId`, which team building needs and the client uses to map a character to its art.

**Validation** is a pure domain function, `validateCatalog(templates): string[]` in `src/domain/services/CharacterCatalog.service.ts`. It reports a missing id, a malformed id and duplicate ids. Per-template effect and target validation happens when the die is built (`validateEffectTargets`, see the auto-targeting spec).

**Loading.** `FileCharacterCatalog` (`src/infrastructure/adapters/catalog/`) implements `CatalogPort`. On `OnModuleInit` it reads `tmplt/*.json` (directory injected as `CATALOG_DIR`), parses, runs `validateCatalog`, and builds every character once through `createCharacterFromTemplate`, which surfaces effect and target errors at startup. It **throws on any error**: a bad catalog fails at boot, not mid-match. The built characters are discarded; only the validated templates are cached. `CatalogModule` owns `CATALOG_DIR` and `CATALOG_PORT`.

```ts
interface CatalogPort {
    list(): readonly CharacterTemplate[];
    get(id: CatalogId): CharacterTemplate | undefined;
    has(id: CatalogId): boolean;
    ids(): readonly CatalogId[];
}
```

`createCharacterFromTemplate(template, factory)` builds a runtime character from a template. `createCharacter` takes a single object, `{ catalogId, name, maxHp, baseSpeed, baseDie, position }`, because `catalogId` and the other adjacent parameters would otherwise be easy to mix up.

## Collection

```ts
interface CollectionPort {
    listOwned(userId: UserId): Promise<readonly OwnedCharacterRow[]>;   // { characterId, acquiredAt }
    grantMany(userId: UserId, ids: readonly CatalogId[]): Promise<void>; // idempotent
    listUnknownIds(known: readonly CatalogId[]): Promise<readonly string[]>;
}
```

`CatalogPort` is synchronous (in-memory map) while `CollectionPort` is asynchronous (database); the collection is consumed from REST handlers, the auth coordinator and the lobby's deck handling.

`UserCharacterRepository` (infrastructure) implements it over Prisma as a thin wrapper; like the other repositories it has no spec of its own and is covered through the coordinators that use it.

`CollectionCoordinatorService` (application) takes both ports and:

- `getCollection(userId)`: maps owned rows through the catalog to DTOs, skipping an owned id the catalog cannot resolve rather than throwing, so a stale row can never break a player's collection;
- `ownedIds(userId)`: the owned set, used by deck validation;
- `grant(userId, ids)`: **the only write path into `UserCharacter`**; rejects any id absent from the catalog;
- `grantAll(userId)`: grants the whole catalog (temporary, see below);
- on `onApplicationBootstrap`, logs a warning naming owned ids the catalog cannot resolve (it stands in for the foreign key we do not have); a failure of the check itself is logged and does not block boot.

### API

`GET /collection`, `JwtAccessGuard`, `userId` from `request.user.sub`. `CollectionController` is declared in `AppModule` (not `CollectionModule`) because `AuthModule` imports `CollectionModule` and the controller needs `JwtAccessGuard` from `AuthModule`; declaring it in `AppModule` avoids the cycle.

```ts
type CollectionCharacterDTO = CatalogCharacterDTO & { acquiredAt: string /* ISO */ };
// CatalogCharacterDTO: { id, name, maxHp, baseSpeed, baseDie: DieFaceDTO[] }

// GET /collection -> { characters: CollectionCharacterDTO[] }
```

`DieFaceDTO` is reused: it already carries each effect's label, magnitude and target groups, so one call gives the client everything needed to render a die and its targeting pattern. An empty collection returns `{ characters: [] }`. Mapping is template -> DTO (`CollectionMapper`, built on `CatalogMapper`) without instantiating effect strategies.

### Granting

`AuthCoordinatorService` calls `CollectionCoordinatorService.grantAll(userId)` on **both register and login**; it never touches `CollectionPort` directly, so the catalog check cannot be bypassed.

- Register alone is not enough: if the grant failed after the user row was written, the account would stay empty forever and retrying registration would hit "username already taken". Granting on login makes the system self-healing and needs no backfill script.
- A grant failure is logged and never fails authentication: the account already exists.
- It is not done in `GET /collection`: a side-effecting read is worse than a write on an endpoint that already writes.

This is explicitly temporary: it exists only because acquisition is "everyone owns everything", and the acquisition feature removes it.

## Tests

Domain specs import no NestJS.

- `CharacterCatalog.service.spec`: missing id, malformed id, duplicate ids, valid catalog.
- `CharacterGeneration.service.spec`: `createCharacterFromTemplate` sets `catalogId`.
- `templates.spec`: every shipped template has a unique, well-formed id (guards the content, not just the code).
- `FileCharacterCatalog.spec` against a temporary fixture directory: loads a good catalog; throws at boot on duplicate ids and on a template missing an id. `CatalogModule.spec` covers the wiring.
- `CollectionCoordinator.service.spec` with mocked ports: owned ids map to DTOs, an unresolvable owned id is skipped, an empty collection returns an empty list, `grant` rejects an unknown id, the boot check warns on orphans.
- `AuthCoordinator.service.spec`: register and login grant, and a grant failure still returns tokens.
- `CollectionController.spec` with a mocked coordinator.

## Future directions

- **Acquisition** replaces grant-all: currency, packs or progression write `UserCharacter` rows, and the register/login grant is deleted.
- **Content versioning**: give the catalog a manifest version or hash once content is real, so a deck can record what it was built against. `CatalogPort` is the seam: moving content to a database or a CDN bundle becomes an adapter swap, not a schema migration.
