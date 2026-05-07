import { Module } from '@nestjs/common';
import { RoomCoordinatorService } from '@application/services/RoomCoordinator.service';
import { SessionCoordinatorService } from '@application/services/SessionCoordinator.service';

@Module({
  imports: [],
  controllers: [],
  providers: [
    RoomCoordinatorService,
    SessionCoordinatorService,
  ],
})
export class AppModule { }
