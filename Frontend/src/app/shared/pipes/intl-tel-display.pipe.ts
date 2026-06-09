import { Pipe, PipeTransform } from '@angular/core';
import { formatIntlTelDisplay } from '../utils/intl-tel.util';

@Pipe({ name: 'intlTelDisplay', standalone: true })
export class IntlTelDisplayPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return formatIntlTelDisplay(value);
  }
}
