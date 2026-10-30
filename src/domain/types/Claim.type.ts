export type ClaimConfig = {
    readonly graceMs: number;
    readonly afkLimitMs: number;
};

export type GameOverReason = 'elimination' | 'forfeit' | 'afk' | 'concede';

/** Why a claim to win succeeded. A refused claim is a DomainError (CLAIM_NOT_ALLOWED). */
export type ClaimReason = 'forfeit' | 'afk';
