declare module 'papaparse' {
  export interface ParseError {
    type: string;
    code: string;
    message: string;
    row?: number;
  }

  export interface ParseResult<T> {
    data: T[];
    errors: ParseError[];
    meta: Record<string, unknown>;
  }

  export interface ParseConfig {
    header?: boolean;
    skipEmptyLines?: boolean | 'greedy';
    transform?: (value: string) => string;
  }

  export function parse<T>(input: string, config?: ParseConfig): ParseResult<T>;

  const Papa: {
    parse: typeof parse;
  };

  export default Papa;
}
