import { Injectable, ConflictException, UnauthorizedException, NotFoundException, Inject, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { USER_PORT, REFRESH_TOKEN_PORT } from '@application/ports/tokens';
import { UserPort } from '@application/ports/UserPort';
import { RefreshTokenPort } from '@application/ports/RefreshTokenPort';
import { UserId } from '@shared/branded.types';
import User from '@domain/types/User.type';
import { RegisterDto } from '@application/dtos/RegisterDto';
import { LoginDto } from '@application/dtos/LoginDto';
import { RefreshDto } from '@application/dtos/RefreshDto';
import { AuthResponseDto } from '@application/dtos/AuthResponseDto';
import { MeDto } from '@application/dtos/MeDto';
import { CollectionCoordinatorService } from '@application/services/CollectionCoordinator.service';

const REFRESH_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const GENERIC_AUTH_ERROR = 'Invalid credentials';

@Injectable()
export class AuthCoordinatorService {
    private readonly logger = new Logger(AuthCoordinatorService.name);

    constructor(
        @Inject(USER_PORT) private readonly userPort: UserPort,
        @Inject(REFRESH_TOKEN_PORT) private readonly refreshTokenPort: RefreshTokenPort,
        private readonly jwtService: JwtService,
        private readonly collection: CollectionCoordinatorService,
    ) {}

    async register(dto: RegisterDto): Promise<AuthResponseDto> {
        const existing = await this.userPort.findByUsername(dto.username);
        if (existing) throw new ConflictException('Username already taken');

        const passwordHash = await bcrypt.hash(dto.password, 12);
        const user: User = {
            id: randomUUID() as UserId,
            username: dto.username,
            passwordHash,
            createdAt: new Date(),
        };
        await this.userPort.save(user);
        await this.grantStarterCollection(user.id);
        return this.issueTokenPair(user.id, user.username);
    }

    async login(dto: LoginDto): Promise<AuthResponseDto> {
        const user = await this.userPort.findByUsername(dto.username);
        if (!user) throw new UnauthorizedException(GENERIC_AUTH_ERROR);

        const valid = await bcrypt.compare(dto.password, user.passwordHash);
        if (!valid) throw new UnauthorizedException(GENERIC_AUTH_ERROR);

        await this.grantStarterCollection(user.id);
        return this.issueTokenPair(user.id, user.username);
    }


    async refresh(dto: RefreshDto): Promise<AuthResponseDto> {
        const tokenHash = createHash('sha256').update(dto.refreshToken).digest('hex');
        const record = await this.refreshTokenPort.findByHash(tokenHash);

        if (!record) throw new UnauthorizedException('Invalid refresh token');

        if (record.isRevoked) {
            await this.refreshTokenPort.deleteAllForUser(record.userId);
            throw new UnauthorizedException('Session compromised, please log in again');
        }

        if (record.expiresAt < new Date()) {
            await this.refreshTokenPort.deleteByHash(tokenHash);
            throw new UnauthorizedException('Refresh token expired');
        }

        await this.refreshTokenPort.revokeByHash(tokenHash);

        const user = await this.userPort.findById(record.userId);
        if (!user) throw new UnauthorizedException(GENERIC_AUTH_ERROR);

        return this.issueTokenPair(record.userId, user.username);
    }

    async logout(dto: RefreshDto): Promise<void> {
        const tokenHash = createHash('sha256').update(dto.refreshToken).digest('hex');
        await this.refreshTokenPort.deleteByHash(tokenHash);
    }

    async getMe(userId: UserId): Promise<MeDto> {
        const user = await this.userPort.findById(userId);
        if (!user) throw new NotFoundException('User not found');
        return { id: user.id, username: user.username, createdAt: user.createdAt };
    }

    async deleteAccount(userId: UserId): Promise<void> {
        await this.refreshTokenPort.deleteAllForUser(userId);
        await this.userPort.delete(userId);
    }

    // TEMPORARY: everyone owns everything until acquisition exists; the acquisition slice removes this.
    // Idempotent and run on both register and login, so a failure heals on the next login.
    // A grant failure must never fail authentication: the account already exists at this point.
    private async grantStarterCollection(userId: UserId): Promise<void> {
        try {
            await this.collection.grantAll(userId);
        } catch (e: unknown) {
            this.logger.error(`Starter collection grant failed for user ${userId}: ${(e as Error).message}`);
        }
    }

    private async issueTokenPair(userId: UserId, username: string): Promise<AuthResponseDto> {
        const accessToken = await this.jwtService.signAsync({ sub: userId, username });

        const rawRefreshToken = randomBytes(64).toString('hex');
        const tokenHash = createHash('sha256').update(rawRefreshToken).digest('hex');
        const expiresAt = new Date(Date.now() + REFRESH_EXPIRY_MS);

        await this.refreshTokenPort.save(tokenHash, userId, expiresAt);

        return { accessToken, refreshToken: rawRefreshToken };
    }
}
