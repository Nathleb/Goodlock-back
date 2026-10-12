import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { CollectionCoordinatorService } from '@application/services/CollectionCoordinator.service';
import { CollectionDTO } from '@application/dtos/Collection.dto';
import { JwtAccessGuard, JwtPayload } from '../websocket/guards/JwtAccess.guard';
import { UserId } from '@shared/branded.types';

type AuthenticatedRequest = Request & { user: JwtPayload };

@Controller('collection')
@UseGuards(JwtAccessGuard)
export class CollectionController {
    constructor(private readonly collection: CollectionCoordinatorService) {}

    @Get()
    getCollection(@Req() req: AuthenticatedRequest): Promise<CollectionDTO> {
        return this.collection.getCollection(req.user.sub as UserId);
    }
}
