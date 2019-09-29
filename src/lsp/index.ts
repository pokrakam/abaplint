import * as LServer from "vscode-languageserver-types";
import {Registry} from "../registry";
import {Symbols} from "./symbols";
import {Hover} from "./hover";
import {PrettyPrinter} from "../abap/pretty_printer";

// the types in this file are not completely correct
// see https://github.com/microsoft/vscode-languageserver-node/issues/354

export class LanguageServer {
  private reg: Registry;

  constructor (reg: Registry) {
    this.reg = reg;
  }

  public documentSymbol(params: LServer.DocumentSymbolParams): LServer.DocumentSymbol[] {
    return Symbols.find(this.reg, params.textDocument.uri);
  }

  public hover(params: {textDocument: LServer.TextDocumentIdentifier, position: LServer.Position}): LServer.Hover | undefined {
    const hover = Hover.find(this.reg, params.textDocument.uri, params.position.line, params.position.character);
    if (hover) {
      return {contents: hover};
    }
    return undefined;
  }

  public documentFormatting(params: {textDocument: LServer.TextDocumentIdentifier,
    options?: LServer.FormattingOptions}): LServer.TextEdit[] {

    const file = this.reg.getABAPFile(params.textDocument.uri);
    if (file === undefined) {
      return [];
    }

    const text = new PrettyPrinter(file).run();
    const tokens = file.getTokens();
    const last = tokens[tokens.length - 1];

    return [{
      range: LServer.Range.create(0, 0, last.getRow(), last.getCol() + last.getStr().length),
      newText: text,
    }];
  }

  public diagnostics(_uri: string): LServer.Diagnostic[] {
    return []; // todo
  }

}