import { Global, Module } from '@nestjs/common';
import { ContentRepository } from './content.repository.js';

@Global()
@Module({ providers: [ContentRepository], exports: [ContentRepository] })
export class ContentModule {}
