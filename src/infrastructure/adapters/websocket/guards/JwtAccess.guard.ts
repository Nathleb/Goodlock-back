import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

export interface JwtPayload {
    sub: string;
    username: string;
}

@Injectable()
export class JwtAccessGuard implements CanActivate {
    constructor(private readonly jwtService: JwtService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<Request & { user: JwtPayload }>();
        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) throw new UnauthorizedException('Missing token');

        const token = authHeader.slice(7);
        try {
            const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
            request.user = payload;
            return true;
        } catch {
            throw new UnauthorizedException('Invalid or expired token');
        }
    }
}
