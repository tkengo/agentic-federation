/**
 * Expression evaluator for ${{ }} templates.
 *
 * Supports:
 * - Property access: steps.review.result
 * - String comparison: steps.review.result == "approved"
 * - Not equal: steps.review.result != "approved"
 * - Boolean operators: && ||
 * - Negation: !expr
 * - Parentheses: (expr)
 * - String/number/boolean/null literals
 */

export interface ExprContext {
  steps: Record<string, { result?: string }>;
  run?: { iteration?: number; max_iterations?: number | null };
}

/**
 * Evaluate a template string, expanding ${{ }} expressions.
 * If the entire string is a single expression, returns the raw value (preserving type).
 * If mixed with text, expressions are stringified.
 */
export function evaluateTemplate(template: string, ctx: ExprContext): unknown {
  const trimmed = template.trim();

  // Check if the entire string is a single ${{ expr }}
  const singleMatch = trimmed.match(/^\$\{\{\s*(.*?)\s*\}\}$/);
  if (singleMatch) {
    return evaluateExpression(singleMatch[1], ctx);
  }

  // Mixed template: replace all ${{ expr }} with stringified values
  return trimmed.replace(/\$\{\{\s*(.*?)\s*\}\}/g, (_match, expr) => {
    const val = evaluateExpression(expr, ctx);
    return String(val ?? "");
  });
}

/**
 * Evaluate an expression string and return the result.
 * Returns the value as-is (boolean, string, number, null).
 */
export function evaluateExpression(expr: string, ctx: ExprContext): unknown {
  const tokens = tokenize(expr);
  const parser = new Parser(tokens, ctx);
  return parser.parseOr();
}

/**
 * Evaluate a template as a boolean (for if/until conditions).
 */
export function evaluateCondition(template: string, ctx: ExprContext): boolean {
  const result = evaluateTemplate(template, ctx);
  return isTruthy(result);
}

function isTruthy(val: unknown): boolean {
  if (val === null || val === undefined) return false;
  if (typeof val === "boolean") return val;
  if (typeof val === "number") return val !== 0;
  if (typeof val === "string") return val.length > 0;
  return true;
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type TokenType =
  | "string" | "number" | "boolean" | "null" | "identifier"
  | "dot" | "eq" | "neq" | "and" | "or" | "not"
  | "lparen" | "rparen" | "eof";

interface Token {
  type: TokenType;
  value: string;
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expr.length) {
    // Skip whitespace
    if (/\s/.test(expr[i])) { i++; continue; }

    // String literal (double or single quotes)
    if (expr[i] === '"' || expr[i] === "'") {
      const quote = expr[i];
      let str = "";
      i++;
      while (i < expr.length && expr[i] !== quote) {
        if (expr[i] === "\\" && i + 1 < expr.length) {
          i++;
          str += expr[i];
        } else {
          str += expr[i];
        }
        i++;
      }
      i++; // skip closing quote
      tokens.push({ type: "string", value: str });
      continue;
    }

    // Number
    if (/\d/.test(expr[i])) {
      let num = "";
      while (i < expr.length && /[\d.]/.test(expr[i])) {
        num += expr[i];
        i++;
      }
      tokens.push({ type: "number", value: num });
      continue;
    }

    // Operators
    if (expr[i] === "=" && expr[i + 1] === "=") {
      tokens.push({ type: "eq", value: "==" });
      i += 2;
      continue;
    }
    if (expr[i] === "!" && expr[i + 1] === "=") {
      tokens.push({ type: "neq", value: "!=" });
      i += 2;
      continue;
    }
    if (expr[i] === "&" && expr[i + 1] === "&") {
      tokens.push({ type: "and", value: "&&" });
      i += 2;
      continue;
    }
    if (expr[i] === "|" && expr[i + 1] === "|") {
      tokens.push({ type: "or", value: "||" });
      i += 2;
      continue;
    }
    if (expr[i] === "!") {
      tokens.push({ type: "not", value: "!" });
      i++;
      continue;
    }
    if (expr[i] === "(") {
      tokens.push({ type: "lparen", value: "(" });
      i++;
      continue;
    }
    if (expr[i] === ")") {
      tokens.push({ type: "rparen", value: ")" });
      i++;
      continue;
    }
    if (expr[i] === ".") {
      tokens.push({ type: "dot", value: "." });
      i++;
      continue;
    }

    // Identifier (includes keywords: true, false, null)
    if (/[a-zA-Z_]/.test(expr[i])) {
      let id = "";
      while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) {
        id += expr[i];
        i++;
      }
      if (id === "true" || id === "false") {
        tokens.push({ type: "boolean", value: id });
      } else if (id === "null") {
        tokens.push({ type: "null", value: id });
      } else {
        tokens.push({ type: "identifier", value: id });
      }
      continue;
    }

    // Unknown character, skip
    i++;
  }

  tokens.push({ type: "eof", value: "" });
  return tokens;
}

// ---------------------------------------------------------------------------
// Parser (recursive descent)
// ---------------------------------------------------------------------------

class Parser {
  private pos = 0;

  constructor(
    private tokens: Token[],
    private ctx: ExprContext,
  ) {}

  private peek(): Token {
    return this.tokens[this.pos] ?? { type: "eof", value: "" };
  }

  private advance(): Token {
    const t = this.tokens[this.pos];
    this.pos++;
    return t ?? { type: "eof", value: "" };
  }

  // or: and ( '||' and )*
  parseOr(): unknown {
    let left = this.parseAnd();
    while (this.peek().type === "or") {
      this.advance();
      const right = this.parseAnd();
      left = isTruthy(left) || isTruthy(right);
    }
    return left;
  }

  // and: equality ( '&&' equality )*
  private parseAnd(): unknown {
    let left = this.parseEquality();
    while (this.peek().type === "and") {
      this.advance();
      const right = this.parseEquality();
      left = isTruthy(left) && isTruthy(right);
    }
    return left;
  }

  // equality: unary ( ('==' | '!=') unary )?
  private parseEquality(): unknown {
    let left = this.parseUnary();
    if (this.peek().type === "eq") {
      this.advance();
      const right = this.parseUnary();
      return left == right;
    }
    if (this.peek().type === "neq") {
      this.advance();
      const right = this.parseUnary();
      return left != right;
    }
    return left;
  }

  // unary: '!' unary | primary
  private parseUnary(): unknown {
    if (this.peek().type === "not") {
      this.advance();
      const val = this.parseUnary();
      return !isTruthy(val);
    }
    return this.parsePrimary();
  }

  // primary: literal | path | '(' or ')'
  private parsePrimary(): unknown {
    const token = this.peek();

    // Parenthesized expression
    if (token.type === "lparen") {
      this.advance();
      const val = this.parseOr();
      if (this.peek().type === "rparen") this.advance();
      return val;
    }

    // String literal
    if (token.type === "string") {
      this.advance();
      return token.value;
    }

    // Number literal
    if (token.type === "number") {
      this.advance();
      return parseFloat(token.value);
    }

    // Boolean literal
    if (token.type === "boolean") {
      this.advance();
      return token.value === "true";
    }

    // Null literal
    if (token.type === "null") {
      this.advance();
      return null;
    }

    // Identifier (start of a dotted path like steps.review.result)
    if (token.type === "identifier") {
      return this.parsePath();
    }

    // Fallback
    this.advance();
    return null;
  }

  // path: identifier ( '.' identifier )*
  private parsePath(): unknown {
    const parts: string[] = [];
    parts.push(this.advance().value);

    while (this.peek().type === "dot") {
      this.advance();
      if (this.peek().type === "identifier" || this.peek().type === "number") {
        parts.push(this.advance().value);
      }
    }

    return this.resolvePath(parts);
  }

  private resolvePath(parts: string[]): unknown {
    const root = parts[0];

    if (root === "steps") {
      // steps.<id>.result
      const stepId = parts[1];
      if (!stepId) return null;
      const stepData = this.ctx.steps[stepId];
      if (!stepData) return null;
      const field = parts[2];
      if (!field) return stepData;
      if (field === "result") return stepData.result ?? null;
      return null;
    }

    if (root === "run") {
      // run.iteration, run.max_iterations
      const field = parts[1];
      if (!field || !this.ctx.run) return null;
      if (field === "iteration") return this.ctx.run.iteration ?? null;
      if (field === "max_iterations") return this.ctx.run.max_iterations ?? null;
      return null;
    }

    return null;
  }
}
