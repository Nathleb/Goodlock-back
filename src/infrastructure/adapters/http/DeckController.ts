import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { DeckCoordinatorService } from '@application/services/DeckCoordinator.service';
import { DeckDTO, DeckListDTO, SaveDeckDto } from '@application/dtos/Deck.dto';
import { JwtAccessGuard, JwtPayload } from '../websocket/guards/JwtAccess.guard';
import { DeckId, UserId } from '@shared/branded.types';

type AuthenticatedRequest = Request & { user: JwtPayload };

@Controller('decks')
@UseGuards(JwtAccessGuard)
export class DeckController {
    constructor(private readonly decks: DeckCoordinatorService) {}

    @Get()
    list(@Req() req: AuthenticatedRequest): Promise<DeckListDTO> {
        return this.decks.list(req.user.sub as UserId);
    }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    create(@Req() req: AuthenticatedRequest, @Body() dto: SaveDeckDto): Promise<DeckDTO> {
        return this.decks.create(req.user.sub as UserId, dto);
    }

    @Put(':id')
    update(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: SaveDeckDto): Promise<DeckDTO> {
        return this.decks.update(req.user.sub as UserId, id as DeckId, dto);
    }

    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    delete(@Req() req: AuthenticatedRequest, @Param('id') id: string): Promise<void> {
        return this.decks.delete(req.user.sub as UserId, id as DeckId);
    }
}
