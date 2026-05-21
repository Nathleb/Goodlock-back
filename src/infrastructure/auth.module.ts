import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './adapters/http/AuthController';
import { AuthCoordinatorService } from '@application/services/AuthCoordinator.service';
import { UserRepository } from './adapters/repositories/UserRepository';
import { RefreshTokenRepository } from './adapters/repositories/RefreshTokenRepository';
import { JwtAccessGuard } from './adapters/websocket/guards/JwtAccess.guard';
import { USER_PORT, REFRESH_TOKEN_PORT } from '@application/ports/tokens';

@Module({
    imports: [
        JwtModule.registerAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                secret: config.get<string>('JWT_ACCESS_SECRET'),
                signOptions: { expiresIn: config.get('JWT_ACCESS_EXPIRES_IN') as any },
            }),
        }),
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
