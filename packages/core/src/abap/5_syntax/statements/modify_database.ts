import * as Expressions from "../../2_statements/expressions";
import {StatementNode} from "../../nodes";
import {CurrentScope} from "../_current_scope";
import {Dynamic} from "../expressions/dynamic";
import {DatabaseTable} from "../expressions/database_table";
import {StatementSyntax} from "../_statement_syntax";
import {Source} from "../expressions/source";

export class ModifyDatabase implements StatementSyntax {
  public runSyntax(node: StatementNode, scope: CurrentScope, filename: string): void {
    for (const d of node.findAllExpressions(Expressions.Dynamic)) {
      new Dynamic().runSyntax(d, scope, filename);
    }

    const dbtab = node.findFirstExpression(Expressions.DatabaseTable);
    if (dbtab !== undefined) {
      new DatabaseTable().runSyntax(dbtab, scope, filename);
    }

    for (const s of node.findAllExpressions(Expressions.Source)) {
      new Source().runSyntax(s, scope, filename);
    }
    for (const s of node.findAllExpressions(Expressions.SimpleSource3)) {
      new Source().runSyntax(s, scope, filename);
    }
  }
}