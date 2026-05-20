import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './adapters/http/AuthController';
import { AuthCoordinatorService } from '@application/services/AuthCoordinator.service';
import { UserRepository } from './adapters/repositories/UserRepository';
import { RefreshTokenRepository } from './adapters/repositories/RefreshTokenRepository';
import { JwtAccessGuard } from './adapters/websocket/guards/JwtAccess.guard';
import { USER_PORT, REFRESH_TOKEN_PORT } from '@application/ports/tokens';

@Module({
    imports: [
        JwtModule.register({}),
    ],
    controllers: [AuthController],
    providers: [
        AuthCoordinatorService,
        JwtAccessGuard,
        { provide: USER_PORT, useClass: UserRepository },
        { provide: REFRESH_TOKEN_PORT, useClass: RefreshTokenRepository },
    ],
    exports: [JwtModule, JwtAccessGuard],
})
export class AuthModule {}
