import { Controller, Post, Get, Delete, Body, Req, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthCoordinatorService } from '@application/services/AuthCoordinator.service';
import { RegisterDto } from '@application/dtos/RegisterDto';
import { LoginDto } from '@application/dtos/LoginDto';
import { RefreshDto } from '@application/dtos/RefreshDto';
import { AuthResponseDto } from '@application/dtos/AuthResponseDto';
import { MeDto } from '@application/dtos/MeDto';
import { JwtAccessGuard, JwtPayload } from '../websocket/guards/JwtAccess.guard';
import { UserId } from '@shared/branded.types';

type AuthenticatedRequest = Request & { user: JwtPayload };

@Controller('auth')
export class AuthController {
    constructor(private readonly authCoordinator: AuthCoordinatorService) {}

    @Post('register')
    @HttpCode(HttpStatus.CREATED)
    @Throttle({ default: { limit: 5, ttl: 60_000 } })
    register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
        return this.authCoordinator.register(dto);
    }

    @Post('login')
    @HttpCode(HttpStatus.OK)
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
        return this.authCoordinator.login(dto);
    }

    @Post('refresh')
    @HttpCode(HttpStatus.OK)
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    refresh(@Body() dto: RefreshDto): Promise<AuthResponseDto> {
        return this.authCoordinator.refresh(dto);
    }

    @Post('logout')
    @HttpCode(HttpStatus.NO_CONTENT)
    @UseGuards(JwtAccessGuard)
    logout(@Body() dto: RefreshDto): Promise<void> {
        return this.authCoordinator.logout(dto);
    }

    @Get('me')
    @UseGuards(JwtAccessGuard)
    getMe(@Req() req: AuthenticatedRequest): Promise<MeDto> {
        return this.authCoordinator.getMe(req.user.sub as UserId);
    }

    @Delete('account')
    @HttpCode(HttpStatus.NO_CONTENT)
    @UseGuards(JwtAccessGuard)
    deleteAccount(@Req() req: AuthenticatedRequest): Promise<void> {
        return this.authCoordinator.deleteAccount(req.user.sub as UserId);
    }
}
