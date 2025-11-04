export type TokenType =
  | "ATOM"
  | "BOND"
  | "BRANCH_OPEN"
  | "BRANCH_CLOSE"
  | "RING"
  | "DISCONNECT"
  | "STEREO"
  | "EOS";

export interface Token {
  type: TokenType;
  value?: string;
  position: number;
}

export class SMILESTokenizer {
  private s: string;
  private i: number = 0;

  constructor(smiles: string) {
    this.s = smiles;
  }

  next(): Token {
    const s = this.s;
    if (this.i >= s.length) return { type: "EOS", position: this.i };

    const c = s[this.i]!;

    if (c === " " || c === "\t") {
      this.i++;
      return this.next();
    }

    if (c === "(") {
      return { type: "BRANCH_OPEN", position: this.i++ };
    }
    if (c === ")") {
      return { type: "BRANCH_CLOSE", position: this.i++ };
    }
    if (c === ".") {
      return { type: "DISCONNECT", position: this.i++ };
    }

    if (c === "-" || c === "=" || c === "#" || c === ":" || c === "$") {
      return { type: "BOND", value: c, position: this.i++ };
    }

    if (c === "/" || c === "\\") {
      return { type: "STEREO", value: c, position: this.i++ };
    }

    if (c === "0" || (c >= "1" && c <= "9")) {
      return { type: "RING", value: c, position: this.i++ };
    }

    if (c === "%") {
      if (
        this.i + 2 < s.length &&
        /^\d{2}$/.test(s.slice(this.i + 1, this.i + 3))
      ) {
        const value = s.slice(this.i + 1, this.i + 3);
        this.i += 3;
        return { type: "RING", value, position: this.i - 3 };
      }
      throw new Error(`Invalid ring closure % at position ${this.i}`);
    }

    if (c === "[") {
      const start = this.i;
      let j = this.i + 1;
      while (j < s.length && s[j] !== "]") j++;
      if (j >= s.length)
        throw new Error(`Unclosed bracket at position ${this.i}`);
      const value = s.slice(this.i + 1, j);
      this.i = j + 1;
      return { type: "ATOM", value, position: start };
    }

    if (/[A-Za-z]/.test(c)) {
      const start = this.i;
      let symbol = c;
      if (
        c === c.toUpperCase() &&
        this.i + 1 < s.length &&
        /[a-z]/.test(s[this.i + 1]!)
      ) {
        symbol = c + s[this.i + 1]!;
        this.i += 2;
      } else {
        this.i++;
      }
      return { type: "ATOM", value: symbol, position: start };
    }

    throw new Error(`Unexpected character '${c}' at position ${this.i}`);
  }

  peek(): Token {
    const saved = this.i;
    const token = this.next();
    this.i = saved;
    return token;
  }

  getPosition(): number {
    return this.i;
  }
}
