import { Global, Module } from '@nestjs/common';

import { RegistrationInvitesService } from './registration-invites.service';

@Global()
@Module({
  providers: [RegistrationInvitesService],
  exports: [RegistrationInvitesService],
})
export class RegistrationModule {}
