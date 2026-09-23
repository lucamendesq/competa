import { Injectable } from '@nestjs/common';
import type { StreamableFile } from '@nestjs/common';

@Injectable()
export class ZipFlightService {
  private readonly inFlight = new Map<string, Promise<StreamableFile>>();

  async execute(key: string, fn: () => Promise<StreamableFile>): Promise<StreamableFile> {
    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const promise = fn().finally(() => {
      this.inFlight.delete(key);
    });

    this.inFlight.set(key, promise);
    return promise;
  }
}
