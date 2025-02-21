import {CDSArithmetics, CDSCast, CDSCondition, CDSFunction, CDSName, CDSString} from ".";
import {alt, Expression, opt, plus, seq} from "../../abap/2_statements/combi";
import {IStatementRunnable} from "../../abap/2_statements/statement_runnable";

export class CDSCase extends Expression {
  public getRunnable(): IStatementRunnable {
    const name = seq(CDSName, opt(seq(".", CDSName)));
    const value = alt(name, CDSString, CDSFunction, CDSCase, CDSCast, CDSArithmetics);
    const simple = seq("CASE", name, plus(seq("WHEN", value, "THEN", value)), "ELSE", value, "END");
    const complex = seq("CASE", plus(seq("WHEN", CDSCondition, "THEN", value)), opt(seq("ELSE", value)), "END");
    return alt(simple, complex);
  }
}