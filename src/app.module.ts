import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ROOM_PORT, SESSION_PORT, WEBSOCKET_PORT, EFFECT_FACTORY, CLAIM_CONFIG } from '@application/ports/tokens';
import { buildEffectFactory } from '@domain/services/GameInit.service';
import { claimConfigFromEnv } from '@infrastructure/config/claim.config';
import { RoomCoordinatorService } from '@application/services/RoomCoordinator.service';
import { SessionCoordinatorService } from '@application/services/SessionCoordinator.service';
import { GameCoordinatorService } from '@application/services/GameCoordinator.service';
import { SessionManager } from '@infrastructure/adapters/managers/session.manager';
import { RoomManager } from '@infrastructure/adapters/managers/room.manager';
import { SharedWebSocketService } from '@infrastructure/adapters/websocket/services/SharedWebSocketService';
import { WebSocketService } from '@infrastructure/adapters/websocket/services/WebSocketService';
import { SessionGateway } from '@infrastructure/adapters/websocket/session.gateway';
import { SessionGuard } from '@infrastructure/adapters/websocket/guards/Session.guard';
import { PrismaModule } from '@infrastructure/prisma/prisma.module';
import { AuthModule } from '@infrastructure/auth.module';
import { RoomController } from '@infrastructure/adapters/http/RoomController';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
        PrismaModule,
        AuthModule,
    ],
    controllers: [RoomController],
    providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: EFFECT_FACTORY, useValue: buildEffectFactory() },
        {
            provide: CLAIM_CONFIG,
            inject: [ConfigService],
            useFactory: (config: ConfigService) =>
                claimConfigFromEnv({
                    CLAIM_GRACE_MS: config.get<string>('CLAIM_GRACE_MS'),
                    CLAIM_AFK_LIMIT_MS: config.get<string>('CLAIM_AFK_LIMIT_MS'),
                }),
        },
        { provide: ROOM_PORT, useClass: RoomManager },
        { provide: SESSION_PORT, useClass: SessionManager },
        { provide: WEBSOCKET_PORT, useClass: WebSocketService },
        SharedWebSocketService,
        RoomCoordinatorService,
        SessionCoordinatorService,
        GameCoordinatorService,
        SessionGateway,
        SessionGuard,
    ],
})
export class AppModule {}
