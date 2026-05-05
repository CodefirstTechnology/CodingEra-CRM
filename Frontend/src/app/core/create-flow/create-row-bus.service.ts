import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import type { CreateEntityKind } from './create-entity-kind';

export interface CreatedRowEvent {
  kind: CreateEntityKind;
  row: unknown;
}

@Injectable({ providedIn: 'root' })
export class CreateRowBusService {
  private readonly created = new Subject<CreatedRowEvent>();
  readonly created$ = this.created.asObservable();

  publish(kind: CreateEntityKind, row: unknown): void {
    this.created.next({ kind, row });
  }
}
