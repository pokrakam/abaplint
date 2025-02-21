import {IStatement} from "./_statement";
import {seq, alt, opt, tok, per, optPrio, altPrio} from "../combi";
import {InstanceArrow, StaticArrow} from "../../1_lexer/tokens";
import {FSTarget, Target, Source, Dynamic, Field, TypeName} from "../expressions";
import {IStatementRunnable} from "../statement_runnable";

export class Assign implements IStatement {

  public getMatcher(): IStatementRunnable {
    const component = seq("COMPONENT",
                          Source,
                          "OF STRUCTURE",
                          Source);

    const tableField = seq("TABLE FIELD", alt(Source, Dynamic));

    const arrow = alt(tok(InstanceArrow), tok(StaticArrow));

    const source = alt(seq(Source, opt(seq(arrow, Dynamic))),
                       component,
                       tableField,
                       seq(Dynamic, opt(seq(arrow, alt(Field, Dynamic)))));

    const type = seq("TYPE", alt(Dynamic, TypeName));
    const like = seq("LIKE", alt(Dynamic, Source));
    const handle = seq("TYPE HANDLE", Source);
    const range = seq("RANGE", Source);
    const decimals = seq("DECIMALS", Source);

    const casting = seq("CASTING", opt(alt(like, handle, per(type, decimals))));
    const obsoleteType = seq("TYPE", Source, optPrio(decimals));

    const ret = seq("ASSIGN",
                    opt(seq(Target, "INCREMENT")),
                    source,
                    "TO",
                    FSTarget,
                    opt(altPrio(casting, obsoleteType)),
                    opt(range));

    return ret;
  }

}