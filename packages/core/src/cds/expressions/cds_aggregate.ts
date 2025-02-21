import {CDSCase, CDSCast, CDSName} from ".";
import {alt, Expression, opt, seq} from "../../abap/2_statements/combi";
import {IStatementRunnable} from "../../abap/2_statements/statement_runnable";

export class CDSAggregate extends Expression {
  public getRunnable(): IStatementRunnable {
    const value = alt(CDSName, CDSCast, CDSCase);
    return seq(alt("MAX", "MIN", "SUM", "AVG", "COUNT"), "(", opt("DISTINCT"), value, ")");
  }
}