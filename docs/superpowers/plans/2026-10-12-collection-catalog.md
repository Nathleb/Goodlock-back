# Plan — Collection slice A (catalog + player collection)

## Context

Spec: `docs/superpowers/specs/2026-09-22-collection-catalog-design.md`, approved 2026-10-12 with its 3 open questions settled as written (object-form `createCharacter`, grant on register + login, no `Character` table).

Today `GameCoordinator.startGame` reads `tmplt/*.json` from disk on every match (`GameCoordinator.service.ts:119`) and each character gets a random UUID, so nothing can be owned or referenced across matches. This slice adds stable catalog ids, a boot-loaded catalog, a persisted `UserCharacter` ownership table (grant-all for now), and `GET /collection`. No WebSocket protocol change; match start behaviour is unchanged.

Approved 2026-10-12. Steps are ticked as they land.

## Findings that adjust the spec

- [x] 1. **`createCharacter` has 58 call sites in 14 specs**, not "~4". Still the right call (two adjacent `number`s), but it is a mechanical rewrite, done in its own step.
- [x] 2. **Nest module cycle**: `AuthModule` will need the collection, and `CollectionController` needs `JwtAccessGuard` (exported by `AuthModule`). Fix: `CollectionController` lives in `AppModule` next to `RoomController`; `CollectionModule` only holds providers.
- [x] 3. **One validated write path**: `AuthCoordinator` calls `CollectionCoordinatorService.grant(userId, catalog.ids())` instead of the raw port, so validate-on-write cannot be bypassed. Auth spec mocks the coordinator, not the port.
- [x] 4. **Grant failures never fail auth**: they are logged. A failed grant at register would otherwise return an error for an account that exists (retry → "username taken"). The next login heals it.

## Steps (each = failing test → code → green → one commit)

### Domain
- [x] 1. **`createCharacter` object form + `catalogId`** — `shared/branded.types.ts`: add `CatalogId`. `CharacterTemplate` gains `id`, `Character` gains `catalogId`. `createCharacter({ catalogId, name, maxHp, baseSpeed, baseDie, position })`. New `createCharacterFromTemplate(template, factory)`; `createCharacterFromJsonTemplate` delegates to it. Test first in `tests/CharacterGeneration.service.spec.ts` (catalogId copied from template). Rewrite the 58 call sites (`catalogId: 'test' as CatalogId`, or a `tests/helpers` fixture where a file has many).
- [x] 2. **`validateCatalog(templates): string[]`** in new `src/domain/services/CharacterCatalog.service.ts` — missing id, malformed id (`^[a-z0-9-]+$`), duplicates. New `tests/CharacterCatalog.service.spec.ts`.

### Content
- [x] 3. **Ids in templates** — add `"id"` to the 10 `tmplt/*.json` (`alicent`, `charlie`, `diana`, `edward`, `eve`, `fiona`, `george`, `hannah`, `jason`, `robbert`). Extend `tests/templates.spec.ts`: `validateCatalog(all shipped templates)` returns `[]`.

### Catalog port + adapter
- [x] 4. **`CatalogPort`** (`src/application/ports/CatalogPort.ts`: `list`, `get`, `has`, `ids`) + `CATALOG_PORT` in `tokens.ts`. **`FileCharacterCatalog`** in `src/infrastructure/adapters/catalog/`: an exported `loadCatalogFromDir(dir, factory)` reads, parses, runs `validateCatalog`, builds each character once via `createCharacterFromTemplate` (surfaces effect/target errors), **throws** on any error; the class calls it in `onModuleInit` and caches a `Map`. New `tests/FileCharacterCatalog.spec.ts` against a temp fixture dir: good catalog loads; duplicate id and missing id throw.
- [x] 5. **`CatalogModule`** (`src/infrastructure/catalog.module.ts`): provides and exports `EFFECT_FACTORY` (moved out of `app.module.ts`) and `CATALOG_PORT`. `AppModule` imports it.

### Match start
- [x] 6. **`GameCoordinator.startGame` uses the catalog** — inject `CATALOG_PORT`, shuffle `catalogPort.list()`, build with `createCharacterFromTemplate`; delete `loadTemplates` and the `fs`/`path` imports. Test first: in `tests/GameCoordinator.service.spec.ts`, startGame with a mocked catalog of 10 templates builds two teams of 5 carrying catalog ids; also provide the mock in `tests/GameCoordinator.claim.spec.ts` (it currently hits the real disk).

### Persistence
- [x] 7. **Prisma** — `UserCharacter` model as in the spec (`@@unique([userId, characterId])`, cascade) + `User.characters` back-relation; `npx prisma migrate dev --name add_user_character` (needs the docker Postgres up).
- [x] 8. **`CollectionPort`** (`listOwned`, `grantMany` idempotent, `listUnknownIds(known)`) + `COLLECTION_PORT`; **`UserCharacterRepository`** over Prisma (`createMany({ skipDuplicates: true })`). No spec, per repository convention.

### Collection use case
- [x] 9. **`CollectionCoordinatorService`** + `CollectionMapper` (template → `CollectionCharacterDTO`, reusing `DieFaceDTO` from `GameState.dto.ts`, no effect instantiation). Methods: `getCollection(userId)` (skips ids the catalog can't resolve), `grant(userId, ids)` (rejects unknown ids), `checkConsistency()` on `onApplicationBootstrap` (warns with orphan ids via Nest `Logger`). New `tests/CollectionCoordinator.service.spec.ts` with mocked ports: maps owned → DTOs, skips unknown, empty → `[]`, rejects unknown grant, warns on orphans.
- [x] 10. **`CollectionModule`** (`src/infrastructure/collection.module.ts`): repository + coordinator, imports `CatalogModule`, exports the coordinator.
- [x] 11. **Auth grants** — `AuthCoordinator` injects `CollectionCoordinatorService` + `CATALOG_PORT`; `register` (after `save`) and `login` grant all catalog ids, catching and logging failures. `AuthModule` imports `CollectionModule` and `CatalogModule`. Extend `tests/AuthCoordinator.service.spec.ts`: both grant every id; a grant failure still returns tokens.

### API
- [ ] 12. **`GET /collection`** — `CollectionController` (`@UseGuards(JwtAccessGuard)`, `req.user.sub as UserId`, same pattern as `AuthController.getMe`), registered in `AppModule`. New `tests/CollectionController.spec.ts` mirroring `tests/RoomController.spec.ts`.

### Wrap-up
- [ ] 13. **Docs + memory** — `CLAUDE.md`: catalog/collection bullets, Postgres now holds player-owned collection data (not only auth); note the 4 deviations above in the spec. Mark `project_collection_slice_a.md` done in memory; record the decisions.

## Verification

- `npm run test`, `npm run lint`, `npm run build` all green.
- Manual: `docker compose up -d`, migrate, `npm run start:dev`; register via `curl` → `GET /collection` with the access token returns 10 characters with full dice; log in again → still 10 (idempotent); start a match from the frontend → two teams of 5 as before.
- Boot guard: temporarily duplicate an id in a template → app refuses to start; revert.
