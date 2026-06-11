export type ClaimConfig = {
    readonly graceMs: number;
    readonly afkLimitMs: number;
};

export type GameOverReason = 'elimination' | 'forfeit' | 'afk' | 'concede';

export type ClaimVerdict =
    | { readonly valid: true; readonly reason: 'forfeit' | 'afk' }
    | { readonly valid: false; readonly error: string };
