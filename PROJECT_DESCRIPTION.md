# Cahier des Charges — Dice TCG PvP

> Jeu de bluff tactique PvP où chaque personnage est un dé. Les joueurs programment secrètement leurs attaques et déplacements, puis regardent le chaos se résoudre.

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Système de combat PvP](#2-système-de-combat-pvp)
3. [Personnages & roster](#3-personnages--roster)
4. [Gestion du compte & sécurité](#4-gestion-du-compte--sécurité)
5. [Architecture technique](#5-architecture-technique)
6. [Modèle de données](#6-modèle-de-données)
7. [Plan de développement](#7-plan-de-développement)

---

## 1. Vue d'ensemble

### 1.1 Concept

Un jeu PvP tactique tour par tour où chaque personnage est représenté par un dé à 6 faces. Le combat se déroule sur deux lignes de 5 slots qui se font face. Les joueurs voient l'équipe adverse, puis positionnent leurs personnages sur leurs slots. Chaque round, les joueurs lancent leurs dés, choisissent quoi garder/relancer, puis programment secrètement leurs actions : soit jouer l'effet d'une face sur un slot cible, soit se décaler d'un cran dans une direction (swap avec le voisin). Toutes les actions sont ensuite résolues séquentiellement par ordre de priorité, créant des moments de lecture adverse, de bluff et de chaos maîtrisé.

Inspiration principale : Colt Express (programmation d'actions puis résolution séquentielle).

### 1.2 Pitch

**"Programme secrètement tes attaques et tes déplacements, puis regarde le chaos se résoudre."**

### 1.3 Fantasy du joueur

"Je lis les mouvements de mon adversaire et je le piège." Le jeu récompense la lecture adverse, l'anticipation et le bluff — pas le hasard pur ni le grinding. Les moments signatures sont les prédictions réussies ("j'ai swap mon healer pile au bon moment") et les bluffs ("il pensait que j'allais viser son slot 2").

### 1.4 Plateformes cibles

- Application web responsive (desktop + mobile via navigateur)
- Possibilité future d'encapsulation native (PWA ou Capacitor/Ionic)

### 1.5 Glossaire

| Terme | Définition |
|---|---|
| **Personnage** | Un héros du roster fixe, représenté par un dé à 6 faces |
| **Face** | Un effet de combat avec ses stats {type, valeur, priorité} |
| **Slot** | Position sur la ligne (1 à 5). Les attaques ciblent des slots, pas des personnages |
| **Swap** | Décalage d'un cran vers la gauche ou la droite (échange avec le voisin). Remplace l'effet de la face, résout à la vitesse de base du personnage. Un perso peut swap plusieurs fois dans le même round |
| **Round** | Un cycle complet : lancer → keep/reroll ×2 → assignation secrète → résolution |
| **Match** | Une partie complète (plusieurs rounds) entre deux joueurs |
| **Priorité finale** | priority_modifier de la face + vitesse du personnage. Détermine l'ordre de résolution |

---

## 2. Système de combat PvP

### 2.1 Le board

Deux lignes de 5 slots qui se font face :

```
        Joueur A
   [ Slot 1 ] [ Slot 2 ] [ Slot 3 ] [ Slot 4 ] [ Slot 5 ]
   ─────────────────────────────────────────────────────────
   [ Slot 1 ] [ Slot 2 ] [ Slot 3 ] [ Slot 4 ] [ Slot 5 ]
        Joueur B
```

En début de match, les deux équipes sont révélées simultanément (les joueurs voient la composition adverse). Puis chaque joueur place ses 5 personnages sur ses 5 slots, en connaissance de l'équipe d'en face. Le placement est secret et simultané, révélé au début du premier round.

Ce placement réactif crée une première couche stratégique : le joueur positionne son équipe en réponse à la composition adverse (mettre son tank en face de l'assassin adverse, décaler son healer loin du sniper, etc.).

### 2.2 Composition d'équipe

Chaque joueur entre en match avec une équipe de 5 personnages. La partie se termine quand un joueur a perdu 3 personnages.

Tous les personnages vivants lancent leur dé à chaque round.

### 2.3 Déroulement d'un round

#### Phase 1 — Lancer initial

- Tous les dés de tous les personnages vivants sont lancés simultanément côté serveur
- Chaque joueur voit ses propres résultats (la face obtenue sur chaque dé)
- Les résultats de l'adversaire sont masqués

#### Phase 2 — Keep/Reroll (×2)

- Chaque joueur choisit quels dés garder et quels dés relancer
- Les deux joueurs soumettent simultanément
- Après soumission : les dés **gardés** deviennent visibles par l'adversaire (face + personnage qui l'a obtenue)
- Les dés relancés génèrent de nouveaux résultats (visibles uniquement par leur propriétaire)
- Cette phase se répète une seconde fois (total : 1 lancer initial + 2 relances)

**Information partielle :** l'adversaire voit les dés gardés mais pas les dés relancés. Il sait ce que tu as choisi de garder mais pas ce que tu as en main sur les dés relancés. C'est le premier niveau de bluff.

#### Phase 3 — Assignation secrète

Pour chaque personnage vivant, le joueur choisit **une** des deux options :

**Option A — Jouer la face :**
- Choisir un slot cible (adverse pour dégâts/debuff, allié pour heal/shield/buff)
- L'effet résoudra à la priorité finale de la face (priority_modifier + vitesse du perso)

**Option B — Swap :**
- Se décaler d'un cran vers la gauche ou la droite (échange de position avec le voisin dans cette direction)
- Pas d'effet joué — la face est sacrifiée
- Le swap résout à la **vitesse de base du personnage** (pas de priority_modifier)
- **Aucune contrainte de swap** : un personnage peut être impliqué dans plusieurs swaps dans le même round (s'il est la cible du swap d'un voisin ET choisit lui-même de swap). Les swaps se résolvent par ordre de priorité et changent l'état du board au fur et à mesure
- Un perso en bout de ligne (slot 1 ou slot 5) ne peut swap que dans une direction

**Timing :** timer de 25-30 secondes. Auto-assignation aléatoire si timeout (chaque dé joue sa face sur un slot adverse aléatoire, pas de swap).

#### Phase 4 — Résolution

Toutes les actions des deux joueurs sont mélangées et résolues une par une, **de la priorité la plus haute à la plus basse** :

```
Priorité finale d'une face jouée = priority_modifier(face) + vitesse(personnage)
Priorité d'un swap = vitesse de base du personnage (pas de modifier)
```

- En cas d'égalité de priorité : ordre aléatoire
- Les effets sont appliqués séquentiellement sur l'état courant du board :
  - Un swap déplace physiquement les deux personnages avant que les actions suivantes résolvent
  - Un swap vers un slot occupé par un personnage mort s'effectue normalement (on échange avec le cadavre)
  - Une attaque sur un slot touche le personnage **actuellement présent** sur ce slot au moment de la résolution
  - Un shield posé tôt protège contre les attaques résolues après. **Les boucliers expirent à la fin du round** — ils ne persistent pas
  - Un heal après des dégâts peut sauver un personnage. **Les soins sont cappés aux PV max** du personnage
  - Un personnage réduit à 0 PV est éliminé — **ses actions non encore résolues sont annulées** (il n'agit plus)
  - Les buffs/debuffs affectent les actions résolues après eux dans le même round

**Affichage :** la résolution est animée séquentiellement, étape par étape. C'est le moment spectacle du jeu — le joueur voit si ses lectures étaient correctes.

### 2.4 Conditions de fin de match

| Condition | Résultat |
|---|---|
| Un joueur a perdu 3 personnages | L'autre joueur gagne |
| Les deux joueurs perdent leur 3e personnage dans le même round | Égalité ou sudden death |
| Nombre maximum de rounds atteint (ex : 20) | Le joueur avec le plus de personnages restants gagne ; si égalité, total de PV restants |
| Déconnexion d'un joueur | Timer de reconnexion (60s), puis forfait |

### 2.5 Timers et rythme

| Phase | Timer suggéré |
|---|---|
| Révélation des équipes | 5 secondes (automatique) |
| Placement (après avoir vu l'équipe adverse) | 30 secondes |
| Keep/Reroll | 15-20 secondes |
| Assignation secrète | 30-40 secondes (plus de persos = plus de décisions) |
| Résolution (animation) | Variable (automatique, ~15-20 secondes) |
| Reconnexion | 60 secondes |

Un round complet dure environ 90-120 secondes. Un match de 5-10 rounds = 8-20 minutes.

### 2.6 Matchmaking

- File d'attente par ELO/MMR
- Mode casual (pas de perte de rang) et ranked (saison)
- Vérification de la composition d'équipe avant le match
- Anti-snipe : pas de match contre le même joueur deux fois de suite

### 2.7 Anti-triche combat

- Tous les lancers de dés côté serveur
- Les résultats ne sont envoyés qu'au joueur concerné jusqu'à ce qu'ils soient gardés
- Les assignations sont stockées côté serveur et révélées uniquement quand les deux joueurs ont soumis
- La résolution est entièrement calculée côté serveur
- Le client est un affichage pur — aucune logique de jeu critique côté client

---

## 3. Personnages & roster

### 3.1 Philosophie du roster

Le roster est fixe et conçu par l'équipe de développement. Chaque personnage a une identité visuelle forte, un rôle spatial clair, et un dé unique. Le roster vise 15-25 personnages à terme, avec un launch roster plus réduit (8-12).

Les personnages sont **reconnaissables en un coup d'œil** en match. Le joueur adverse voit l'équipe adverse et sait immédiatement à quoi s'attendre (archétype, tendance de mobilité, type d'effets dominants).

### 3.2 Stats de base d'un personnage

Chaque personnage a des stats fixes définies manuellement par l'équipe de dev :

- **PV** : points de vie du personnage
- **Vitesse de base** : détermine la priorité des swaps et sert d'offset sur la priorité de toutes les faces

La vitesse de base sert à deux choses :
- **Offset de priorité** sur toutes les faces jouées : priorité finale = priorité(face) + vitesse
- **Priorité du swap** quand le joueur choisit de swap au lieu de jouer sa face

### 3.3 Le dé d'un personnage

Chaque personnage a un dé fixe de 6 faces, conçu et équilibré manuellement par l'équipe de dev. Chaque face possède :

- **Une liste d'effet** : DAMAGE, HEAL, SHIELD, etc.. a definir
avec pour chacun
- **Un mode de targeting**: SINGLETARGET, AOE... a definir qui visent des slots
- **Valeur d'effet** : puissance de l'effet
- **Priorité** : bonus de priorité spécifique à cette face (ajouté à la vitesse du perso pour la priorité finale)

L'équilibrage est fait manuellement au niveau du personnage dans son ensemble (pas de contrainte de budget par face). L'objectif est que chaque personnage soit viable et que le roster soit équilibré par le playtesting itératif.

### 3.4 Effets possibles

| Effet | Description |
|---|---|
| `DAMAGE` | Inflige N dégâts au personnage présent sur le slot ciblé |
| `HEAL` | Soigne N PV au personnage présent sur le slot allié ciblé |
| `SHIELD` | Accorde N points de bouclier au personnage sur le slot allié ciblé |


## 4. Gestion du compte & sécurité

### 4.1 Authentification

- Inscription par email + mot de passe
- OAuth2 avec providers tiers (Google, Apple, Discord)
- Vérification d'email obligatoire
- Mot de passe : minimum 8 caractères, hashé avec bcrypt (cost factor ≥ 12)
- JWT pour les sessions API (access token courte durée + refresh token)
- Rate limiting sur les endpoints d'authentification (anti brute-force)
- Captcha sur inscription et login après N échecs

### 4.2 Gestion du profil

- Pseudo unique (modifiable avec cooldown)
- Avatar (choix parmi les personnages du roster)
- Statistiques publiques : victoires, défaites, rang, personnages préférés, winrate par perso
- Paramètres : langue, notifications, préférences audio
- Suppression de compte (RGPD)

### 4.3 Sécurité des données

- HTTPS obligatoire partout
- WebSocket via WSS uniquement
- Chiffrement des données sensibles au repos
- Pas de stockage de données de paiement côté serveur (Stripe ou équivalent)
- Logs d'audit sur les actions sensibles
- CORS restreint aux domaines autorisés

### 4.4 Protection anti-triche

- Toute logique de jeu côté serveur
- Validation serveur de chaque action joueur
- Rate limiting sur les actions de jeu
- Détection d'anomalies (taux de victoire anormal, patterns suspects)
- Système de ban (temporaire, permanent)

### 4.5 Conformité RGPD

- Consentement explicite pour le traitement des données
- Export des données personnelles sur demande
- Suppression du compte et des données associées
- Politique de confidentialité accessible

### 4.6 Système social (post-lancement)

- Liste d'amis
- Matchs privés (invitation par code)
- Historique des matchs avec replay
- Chat en jeu (avec filtrage)

---

## 5. Architecture technique

### 5.1 Vue d'ensemble

```
┌──────────────────────────────────────────────────────┐
│                    CLIENT (SPA)                       │
│              React + Canvas (combat)                  │
│      Socket.io (combat) + REST (collection/auth)      │
└────────────┬──────────────────┬───────────────────────┘
             │ HTTPS/REST       │ WSS (Socket.io)
             ▼                  ▼
┌──────────────────────────────────────────────────────┐
│                NestJS (TypeScript)                     │
│                                                      │
│  ┌──────────────────┐  ┌───────────────────────────┐ │
│  │  REST Controllers│  │  WebSocket Gateway         │ │
│  │  (NestJS modules)│  │  (Socket.io rooms/events)  │ │
│  └────────┬─────────┘  └──────────┬────────────────┘ │
│           │                       │                   │
│           ▼                       ▼                   │
│  ┌────────────────────────────────────────────────┐   │
│  │              SERVICE LAYER                     │   │
│  │                                                │   │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────┐      │   │
│  │  │ Auth     │ │ Roster   │ │ Combat    │      │   │
│  │  │ Module   │ │ Module   │ │ Engine    │      │   │
│  │  └──────────┘ └──────────┘ └───────────┘      │   │
│  │  ┌──────────┐                                  │   │
│  │  │Matchmaker│                                  │   │
│  │  │ Module   │                                  │   │
│  │  └──────────┘                                  │   │
│  └────────────────────────────────────────────────┘   │
│                                                      │
│  ┌────────────────────────────────────────────────┐   │
│  │  Passport.js — JWT + OAuth2 + Guards            │   │
│  └────────────────────────────────────────────────┘   │
│                                                      │
│  ┌────────────────────────────────────────────────┐   │
│  │  shared/ — Types TS partagés front ↔ back      │   │
│  └────────────────────────────────────────────────┘   │
└──────────┬───────────────────┬───────────────────────┘
           │                   │
           ▼                   ▼
┌────────────────┐  ┌──────────────────┐
│  PostgreSQL    │  │  Redis           │
│  (Prisma ORM)  │  │  (ioredis)       │
│                │  │                  │
│  Données       │  │  Sessions,       │
│  persistantes  │  │  matchmaking,    │
│                │  │  état combat,    │
│                │  │  cache           │
└────────────────┘  └──────────────────┘
```

### 5.2 Pourquoi NestJS

- Socket.io natif avec rooms et events — modèle idéal pour le PvP tour par tour (une room par match)
- TypeScript full-stack : types partagés front/back pour les payloads WebSocket
- Architecture modulaire alignée avec le découpage métier
- Passport.js pour l'auth JWT/OAuth2
- Prisma pour PostgreSQL, type-safe
- Écosystème npm pour les outils annexes

Le combat est tour par tour avec des timers de 15-30 secondes. Le modèle event loop de Node.js est parfaitement adapté. La résolution d'un round (10-15 effets à calculer séquentiellement) est triviale en CPU.

### 5.3 Stack détaillée

| Composant | Technologie |
|---|---|
| **Backend** | NestJS 10+ (Node.js 20, TypeScript) |
| **API REST** | NestJS Controllers |
| **WebSocket** | @nestjs/websockets + Socket.io |
| **Auth** | @nestjs/passport + JWT + OAuth2 |
| **ORM** | Prisma |
| **DB** | PostgreSQL |
| **Cache & state** | Redis (ioredis) |
| **Frontend** | React 18+ (Vite) |
| **State client** | Zustand |
| **WS client** | socket.io-client |
| **Types partagés** | Package `shared/` TS |
| **Deploy** | Docker + Docker Compose |
| **CI/CD** | GitHub Actions |
| **Monitoring** | Prometheus + Grafana + pino |

### 5.4 Communication client-serveur

#### REST API

| Domaine | Endpoints principaux |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/oauth/{provider}` |
| Profil | `GET/PUT /profile`, `DELETE /profile` |
| Roster | `GET /roster` (tous les persos), `GET /roster/{id}` (détail + faces du dé) |
| Decks | `GET/POST/PUT/DELETE /decks` |
| Matchmaking | `POST /matchmaking/queue`, `DELETE /matchmaking/queue` |
| Leaderboard | `GET /leaderboard?season={id}&page={n}` |
| Social | `GET/POST/DELETE /friends`, `POST /match/invite` |

#### WebSocket Socket.io (combat PvP)

Chaque match = une room Socket.io (`match:{matchId}`).

| Événement | Direction | Payload |
|---|---|---|
| `match:teams` | Serveur → Room | Révélation des deux équipes (personnages + stats) |
| `match:placement` | Client → Serveur | Placement : `{ slots: [charId ×5] }` |
| `match:state` | Serveur → Room | État du board (positions, PV, buffs/debuffs, phase actuelle) |
| `match:dice:private` | Serveur → Client (privé) | Résultats de dés du joueur |
| `match:dice:public` | Serveur → Room | Dés gardés (visibles par les deux) |
| `match:keep` | Client → Serveur | Décision keep/reroll : `{ kept: [diceIds] }` |
| `match:assign` | Client → Serveur | Assignation : `{ actions: [{charId, type, targetSlot?, swapDirection?}] }` |
| `match:resolution` | Serveur → Room | Séquence de résolution animée (action par action) |
| `match:round-end` | Serveur → Room | État après résolution (PV, éliminations) |
| `match:end` | Serveur → Room | Résultat final, ELO changes |
| `match:event` | Serveur → Room | Timer, déconnexion adverse, etc. |
| `match:found` | Serveur → Client | Match trouvé via matchmaking |

### 5.5 Architecture du moteur de combat

State machine côté serveur :

```
WAITING_FOR_PLAYERS
    │
    ▼
REVEAL_TEAMS ──────── Les deux équipes sont révélées simultanément
    │
    ▼
PLACEMENT_PHASE ────── Joueurs placent leurs 5 persos sur les 5 slots
    │                   (en connaissance de l'équipe adverse)
    │                   → Timeout = placement par défaut
    ▼
REVEAL_PLACEMENT ───── Les placements sont révélés
    │
    ▼
ROLL_PHASE ──────────── Serveur lance tous les dés, envoie résultats privés
    │
    ▼
KEEP_PHASE_1 ─────────── Keep/reroll (timer)
    │                     → Timeout = auto-keep tout
    ▼
REROLL_1 ─────────────── Relance + broadcast dés gardés
    │
    ▼
KEEP_PHASE_2 ─────────── Deuxième keep/reroll
    │
    ▼
REROLL_2 ─────────────── Dernière relance + broadcast
    │
    ▼
ASSIGN_PHASE ──────────── Assignation secrète : face OU swap (timer)
    │                      → Timeout = auto-assignation aléatoire
    ▼
RESOLVE_PHASE ─────────── Résolution séquentielle par priorité
    │                      → Animation envoyée étape par étape
    ▼
CHECK_END ─────────────── Vérifier conditions de fin
    │
    ├── Match terminé → RESULT_PHASE (ELO update, récompenses)
    │
    └── Match continue → ROLL_PHASE (nouveau round)
```

État du match dans Redis pendant le combat, persisté en PostgreSQL à la fin.

### 5.6 Scaling

**Phase de lancement (< 1000 joueurs simultanés) :**
- Un seul serveur NestJS
- PostgreSQL + Redis (managed ou même machine)

**Phase de croissance (1000–50 000) :**
- Multiples instances NestJS + `@socket.io/redis-adapter` (sync rooms, pas de sticky sessions)
- Redis Cluster, PostgreSQL read replicas

**Phase scale (50 000+) :**
- Combat engine en worker threads ou microservice dédié
- BullMQ/Redis Streams entre services

---

## 6. Modèle de données

### 6.1 Schéma PostgreSQL

```sql
-- Utilisateurs
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    username        VARCHAR(32) UNIQUE NOT NULL,
    password_hash   VARCHAR(255),
    oauth_provider  VARCHAR(32),
    oauth_id        VARCHAR(255),
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    elo_rating      INT DEFAULT 1000,
    is_banned       BOOLEAN DEFAULT FALSE,
    ban_reason      TEXT,
    UNIQUE(oauth_provider, oauth_id)
);

-- Roster de personnages (défini par l'équipe de dev, pas par les joueurs)
CREATE TABLE characters (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(64) UNIQUE NOT NULL,
    archetype       VARCHAR(32) NOT NULL,       -- TANK, ASSASSIN, HEALER, SNIPER, CONTROLLER, BRUISER
    base_hp         INT NOT NULL,
    base_speed      INT NOT NULL,
    description     TEXT,
    sprite_url      VARCHAR(512),
    is_active       BOOLEAN DEFAULT TRUE,        -- disponible dans le jeu
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- Faces de dé d'un personnage (6 par personnage, définies par l'équipe de dev)
CREATE TABLE character_faces (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id        UUID REFERENCES characters(id) ON DELETE CASCADE,
    face_index          INT NOT NULL,            -- 0-5
    face_name           VARCHAR(64),             -- nom descriptif ("Coup Fatal", "Garde Haute")

    -- Effet de la face
    effect_type         VARCHAR(16) NOT NULL,    -- DAMAGE, HEAL, SHIELD, BUFF, DEBUFF
    effect_value        INT NOT NULL DEFAULT 0,
    priority            INT NOT NULL DEFAULT 0,  -- ajouté à la vitesse du perso pour la priorité finale

    CONSTRAINT unique_face UNIQUE (character_id, face_index),
    CONSTRAINT valid_face_index CHECK (face_index >= 0 AND face_index <= 5)
);

-- Decks / Équipes (5 personnages par deck)
CREATE TABLE decks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id        UUID REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(64) NOT NULL,
    is_active       BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE deck_characters (
    deck_id         UUID REFERENCES decks(id) ON DELETE CASCADE,
    character_id    UUID REFERENCES characters(id) ON DELETE CASCADE,
    slot_position   INT NOT NULL,               -- 0-4 (position dans le deck, pas sur le board)
    PRIMARY KEY (deck_id, slot_position),
    CONSTRAINT valid_slot CHECK (slot_position >= 0 AND slot_position <= 4)
);

-- Historique des matchs
CREATE TABLE matches (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player1_id      UUID REFERENCES users(id),
    player2_id      UUID REFERENCES users(id),
    winner_id       UUID REFERENCES users(id),
    match_type      VARCHAR(16) NOT NULL,        -- RANKED, CASUAL, PRIVATE
    started_at      TIMESTAMPTZ DEFAULT now(),
    ended_at        TIMESTAMPTZ,
    total_rounds    INT,
    result_detail   JSONB,                       -- détail complet pour replay
    elo_change_p1   INT,
    elo_change_p2   INT
);

-- Saisons
CREATE TABLE seasons (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(64) NOT NULL,
    started_at      TIMESTAMPTZ NOT NULL,
    ends_at         TIMESTAMPTZ NOT NULL,
    is_active       BOOLEAN DEFAULT FALSE
);

CREATE TABLE season_rankings (
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    season_id       UUID REFERENCES seasons(id) ON DELETE CASCADE,
    elo_rating      INT NOT NULL,
    highest_elo     INT NOT NULL,
    matches_played  INT DEFAULT 0,
    wins            INT DEFAULT 0,
    losses          INT DEFAULT 0,
    PRIMARY KEY (user_id, season_id)
);
```

### 6.2 Structures Redis

```
# Matchmaking
matchmaking:ranked     → Sorted Set (score = ELO, member = userId)
matchmaking:casual     → Sorted Set (score = timestamp, member = userId)

# État d'un match en cours
match:{matchId}:state  → Hash {
    phase, round, timer_end,
    player1_id, player2_id,
    p1_ready, p2_ready
}

match:{matchId}:board → Hash {
    p1_slots → JSON [charId, charId, charId, charId, charId]  -- positions actuelles
    p2_slots → JSON [charId, charId, charId, charId, charId]
}

match:{matchId}:dice → Hash {
    {charId} → JSON { face_index, kept, visible_to_opponent }
}

match:{matchId}:assignments → Hash {
    player1 → JSON [{charId, type: 'FACE'|'SWAP', targetSlot?, swapDirection?: 'LEFT'|'RIGHT'}, ...]
    player2 → JSON [...]
}

match:{matchId}:characters → Hash {
    {charId} → JSON { current_hp, max_hp, shields, buffs, debuffs, is_alive, current_slot }
}

# Sessions
session:{token} → JSON { userId, expiry }

# Rate limiting
ratelimit:{ip}:{endpoint} → Counter (TTL)
```

---

## 7. Plan de développement

### Phase 0 — Prototype gameplay (2-3 semaines)

- Moteur de combat en local (tests unitaires, pas de réseau)
- Prototype React hot-seat (2 joueurs même écran)
- 6-8 personnages placeholder avec des archétypes distincts
- Board 5v5 avec slots et swaps libres
- Validation que le mind game (swap vs face, ciblage de slots) est fun
- **Livrable :** prototype jouable pour playtesting
- **Objectif :** répondre à "est-ce que c'est fun ?" avant tout investissement technique

### Phase 1 — Backend core (3-4 semaines)

- Setup NestJS + Prisma + PostgreSQL + Redis
- Authentification (email + JWT + OAuth2 via Passport.js)
- Roster de personnages (CRUD admin + lecture publique)
- Gestion de decks
- Endpoints REST + tests d'intégration
- **Livrable :** API fonctionnelle

### Phase 2 — Combat PvP en ligne (3-4 semaines)

- WebSocket Socket.io + state machine du combat
- Matchmaking basique (queue ELO)
- Placement → roll → keep/reroll → assignation → résolution
- Gestion des swaps et résolution spatiale
- Gestion des déconnexions et timeouts
- Frontend combat (board, animations de résolution)
- **Livrable :** matchs PvP jouables en ligne

### Phase 3 — Personnages & équilibrage (2-3 semaines)

- Design et implémentation du roster initial (8-12 personnages)
- Assets visuels (sprites, animations)
- Playtesting intensif et ajustement des stats
- **Livrable :** roster équilibré et jouable

### Phase 4 — Polish & lancement beta (2-3 semaines)

- UI/UX finalisée
- Animations de combat (swap, attaques, mort, résolution)
- Tutoriel / onboarding (match scripté contre IA)
- PWA (installation mobile)
- Tests de charge
- Monitoring (Prometheus + pino)
- **Livrable :** beta publique

### Phase 5 — Post-lancement

- Système de collection & économie (à définir)
- Système social (amis, matchs privés)
- Saisons + pass saisonnier
- Nouveaux personnages (extension du roster)
- Mode spectateur / replays
- Tournois
- Optimisation scaling

---

## Annexe A — Formules de référence

```
Priorité_finale(face jouée) = priorité(face) + vitesse(personnage)
Priorité_finale(swap) = vitesse(personnage)    // pas de bonus de face

PV et vitesse sont des stats fixes par personnage, définies par l'équipe de dev.
```

## Annexe B — Points restant à approfondir

1. **Système de collection & économie** : modèle économique, monétisation, progression — à définir entièrement
2. **Catalogue de buffs/debuffs** : liste des effets, durées, stackabilité
3. **Formule ELO** : K-factor, placement matches, floors, élargissement progressif
4. **Onboarding / tutoriel** : combat scripté contre IA, introduction progressive des mécaniques
5. **Valeurs de balancing** : PV et vitesse par personnage, effets et priorités de chaque face
6. **Roster complet** : design de chaque personnage (stats, faces, identité visuelle)

## Annexe C — Règles de résolution confirmées

- **Mort mid-résolution** : le personnage n'agit plus, ses actions restantes sont annulées
- **Boucliers** : expirent à la fin du round, ne persistent pas
- **Soins** : cappés aux PV max du personnage
- **Swap avec un mort** : le swap s'effectue normalement, on échange avec le cadavre
- **Chaînes de swap** : pas de simultanéité, tout se résout par ordre de priorité. Chaque swap modifie l'état du board avant que le suivant résolve
- **Égalité de priorité** : ordre aléatoire
