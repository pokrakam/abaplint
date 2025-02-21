import {BasicRuleConfig} from "./_basic_rule_config";
import {Issue} from "../issue";
import {IRule, IRuleMetadata, RuleTag} from "./_irule";
import {Unknown} from "../abap/2_statements/statements/_statement";
import {ExpressionNode, StatementNode, TokenNode} from "../abap/nodes";
import * as Statements from "../abap/2_statements/statements";
import * as Expressions from "../abap/2_statements/expressions";
import {IEdit, EditHelper} from "../edit_helper";
import {Position, VirtualPosition} from "../position";
import {ABAPFile} from "../abap/abap_file";
import {IRegistry} from "../_iregistry";
import {IObject} from "../objects/_iobject";
import {ABAPObject} from "../objects/_abap_object";
import {Version} from "../version";
import {Registry} from "../registry";
import {SyntaxLogic} from "../abap/5_syntax/syntax";
import {ISyntaxResult} from "../abap/5_syntax/_spaghetti_scope";
import {ReferenceType} from "../abap/5_syntax/_reference";
import {IClassDefinition} from "../abap/types/_class_definition";
import {TypedIdentifier} from "../abap/types/_typed_identifier";
import {VoidType} from "../abap/types/basic";
import {Config} from "../config";
import {Token} from "../abap/1_lexer/tokens/_token";
import {WAt} from "../abap/1_lexer/tokens";
import {IncludeGraph} from "../utils/include_graph";
import {Program} from "../objects";

// todo: refactor each sub-rule to new classes?
// todo: add configuration

export class DownportConf extends BasicRuleConfig {
}

export class Downport implements IRule {
  private lowReg: IRegistry;
  private highReg: IRegistry;
  private conf = new DownportConf();
  private counter: number;
  private graph: IncludeGraph;

  public getMetadata(): IRuleMetadata {
    return {
      key: "downport",
      title: "Downport statement",
      shortDescription: `Experimental downport functionality`,
      extendedInformation: `Much like the 'commented_code' rule this rule loops through unknown statements and tries parsing with
a higher level language version. If successful, various rules are applied to downport the statement.
Target downport version is always v702, thus rule is only enabled if target version is v702.

Current rules:
* NEW transformed to CREATE OBJECT, opposite of https://rules.abaplint.org/use_new/
* DATA() definitions are outlined, opposite of https://rules.abaplint.org/prefer_inline/
* FIELD-SYMBOL() definitions are outlined
* CONV is outlined
* COND is outlined
* REDUCE is outlined
* SWITCH is outlined
* APPEND expression is outlined
* EMPTY KEY is changed to DEFAULT KEY, opposite of DEFAULT KEY in https://rules.abaplint.org/avoid_use/
* CAST changed to ?=
* LOOP AT method_call( ) is outlined
* VALUE # with structure fields
* VALUE # with internal table lines
* Table Expressions are outlined
* SELECT INTO @DATA definitions are outlined
* Some occurrences of string template formatting option ALPHA changed to function module call
* SELECT/INSERT/MODIFY/DELETE/UPDATE "," in field list removed, "@" in source/targets removed
* PARTIALLY IMPLEMENTED removed, it can be quick fixed via rule implement_methods
* RAISE EXCEPTION ... MESSAGE
* Moving with +=, -=, /=, *=, &&= is expanded
* line_exists and line_index is downported to READ TABLE

Only one transformation is applied to a statement at a time, so multiple steps might be required to do the full downport.`,
      tags: [RuleTag.Experimental, RuleTag.Downport, RuleTag.Quickfix],
    };
  }

  public getConfig() {
    return this.conf;
  }

  public setConfig(conf: DownportConf): void {
    this.conf = conf;
  }

  public initialize(reg: IRegistry) {
    this.lowReg = reg;
    const version = this.lowReg.getConfig().getVersion();
    if (version === Version.v702 || version === Version.OpenABAP) {
      this.initHighReg();
      this.graph = new IncludeGraph(reg);
    }
    return this;
  }

  public run(lowObj: IObject): Issue[] {
    const ret: Issue[] = [];
    this.counter = 1;


    const version = this.lowReg.getConfig().getVersion();
    if (version !== Version.v702 && version !== Version.OpenABAP) {
      return ret;
    } else if (!(lowObj instanceof ABAPObject)) {
      return ret;
    }

    const highObj = this.highReg.getObject(lowObj.getType(), lowObj.getName());
    if (highObj === undefined || !(highObj instanceof ABAPObject)) {
      return ret;
    }

    let highSyntaxObj = highObj;

    // for includes do the syntax check via a main program
    if (lowObj instanceof Program && lowObj.isInclude()) {
      const mains = this.graph.listMainForInclude(lowObj.getMainABAPFile()?.getFilename());
      if (mains.length <= 0) {
        return [];
      }
      const f = this.highReg.getFileByName(mains[0]);
      if (f === undefined) {
        return [];
      }
      highSyntaxObj = this.highReg.findObjectForFile(f) as ABAPObject;
    }

    const highSyntax = new SyntaxLogic(this.highReg, highSyntaxObj).run();

    for (const lowFile of lowObj.getABAPFiles()) {
      const highFile = highObj.getABAPFileByName(lowFile.getFilename());
      if (highFile === undefined) {
        continue;
      }

      const lowStatements = lowFile.getStatements();
      const highStatements = highFile.getStatements();
      if (lowStatements.length !== highStatements.length) {
        // after applying a fix, there might be more statements in lowFile
        // should highReg be initialized again?
        /*
        const message = "Internal Error: Statement lengths does not match";
        ret.push(Issue.atStatement(lowFile, lowStatements[0], message, this.getMetadata().key));
        */
        continue;
      }

      for (let i = 0; i < lowStatements.length; i++) {
        const low = lowStatements[i];
        const high = highStatements[i];
        if ((low.get() instanceof Unknown && !(high.get() instanceof Unknown))
        || high.findFirstExpression(Expressions.InlineData)) {
          const issue = this.checkStatement(low, high, lowFile, highSyntax);
          if (issue) {
            ret.push(issue);
          }
        }
      }
    }

    return ret;
  }

////////////////////

  /** clones the orginal repository into highReg, and parses it with higher language version */
  private initHighReg() {
    // use default configuration, ie. default target version
    const highConfig = Config.getDefault().get();
    const lowConfig = this.lowReg.getConfig().get();
    highConfig.syntax.errorNamespace = lowConfig.syntax.errorNamespace;
    highConfig.syntax.globalConstants = lowConfig.syntax.globalConstants;
    highConfig.syntax.globalMacros = lowConfig.syntax.globalMacros;
    this.highReg = new Registry();

    for (const o of this.lowReg.getObjects()) {
      for (const f of o.getFiles()) {
        if (this.lowReg.isDependency(o) === true) {
          this.highReg.addDependency(f);
        } else {
          this.highReg.addFile(f);
        }
      }
    }

    this.highReg.parse();
  }

  /** applies one rule at a time, multiple iterations are required to transform complex statements */
  private checkStatement(low: StatementNode, high: StatementNode, lowFile: ABAPFile, highSyntax: ISyntaxResult): Issue | undefined {
    if (low.getFirstToken().getStart() instanceof VirtualPosition) {
      return undefined;
    }

    let found = this.partiallyImplemented(high, lowFile);
    if (found) {
      return found;
    }

    found = this.raiseException(high, lowFile, highSyntax);
    if (found) {
      return found;
    }

    found = this.emptyKey(high, lowFile);
    if (found) {
      return found;
    }

    found = this.stringTemplateAlpha(high, lowFile);
    if (found) {
      return found;
    }

    found = this.moveWithOperator(high, lowFile);
    if (found) {
      return found;
    }

    found = this.moveWithSimpleValue(high, lowFile);
    if (found) {
      return found;
    }

    found = this.downportSelectInline(low, high, lowFile, highSyntax);
    if (found) {
      return found;
    }

    found = this.downportSQLExtras(low, high, lowFile, highSyntax);
    if (found) {
      return found;
    }

    found = this.outlineLoopInput(high, lowFile, highSyntax);
    if (found) {
      return found;
    }

    found = this.outlineLoopTarget(high, lowFile, highSyntax);
    if (found) {
      return found;
    }

    found = this.outlineValue(high, lowFile, highSyntax);
    if (found) {
      return found;
    }

    found = this.outlineReduce(high, lowFile, highSyntax);
    if (found) {
      return found;
    }

    found = this.outlineSwitch(high, lowFile, highSyntax);
    if (found) {
      return found;
    }

    found = this.outlineCast(high, lowFile, highSyntax);
    if (found) {
      return found;
    }

    found = this.outlineConv(high, lowFile, highSyntax);
    if (found) {
      return found;
    }

    found = this.outlineCond(high, lowFile, highSyntax);
    if (found) {
      return found;
    }

    found = this.outlineCatchSimple(high, lowFile);
    if (found) {
      return found;
    }

    found = this.outlineDataSimple(high, lowFile);
    if (found) {
      return found;
    }

    found = this.outlineData(high, lowFile, highSyntax);
    if (found) {
      return found;
    }

    found = this.outlineFS(high, lowFile, highSyntax);
    if (found) {
      return found;
    }

    found = this.newToCreateObject(high, lowFile, highSyntax);
    if (found) {
      return found;
    }

    found = this.replaceXsdBool(high, lowFile, highSyntax);
    if (found) {
      return found;
    }

    found = this.replaceLineFunctions(high, lowFile, highSyntax);
    if (found) {
      return found;
    }

    found = this.replaceTableExpression(high, lowFile, highSyntax);
    if (found) {
      return found;
    }

    found = this.replaceAppendExpression(high, lowFile, highSyntax);
    if (found) {
      return found;
    }

    return undefined;
  }

//////////////////////////////////////////

  private downportSQLExtras(low: StatementNode, high: StatementNode, lowFile: ABAPFile, _highSyntax: ISyntaxResult): Issue | undefined {
    if (!(low.get() instanceof Unknown)) {
      return undefined;
    }

    if (!(high.get() instanceof Statements.Select)
        && !(high.get() instanceof Statements.SelectLoop)
        && !(high.get() instanceof Statements.UpdateDatabase)
        && !(high.get() instanceof Statements.ModifyDatabase)
        && !(high.get() instanceof Statements.DeleteDatabase)
        && !(high.get() instanceof Statements.InsertDatabase)) {
      return undefined;
    }

    let fix: IEdit | undefined = undefined;
    const addFix = (token: Token) => {
      const add = EditHelper.deleteToken(lowFile, token);
      if (fix === undefined) {
        fix = add;
      } else {
        fix = EditHelper.merge(fix, add);
      }
    };

    const candidates = [high.findAllExpressionsRecursive(Expressions.SQLTarget),
      high.findAllExpressionsRecursive(Expressions.SQLSource),
      high.findAllExpressionsRecursive(Expressions.SQLSourceSimple)].flat();
    for (const c of candidates) {
      if (c.getFirstToken() instanceof WAt) {
        addFix(c.getFirstToken());
      }
    }

    for (const fieldList of high.findAllExpressionsMulti([Expressions.SQLFieldList, Expressions.SQLFieldListLoop], true)) {
      for (const token of fieldList.getDirectTokens()) {
        if (token.getStr() === ",") {
          addFix(token);
        }
      }
    }

    if (fix === undefined) {
      return undefined;
    } else {
      return Issue.atToken(lowFile, low.getFirstToken(), "SQL, remove \" and ,", this.getMetadata().key, this.conf.severity, fix);
    }
  }

  private downportSelectInline(low: StatementNode, high: StatementNode, lowFile: ABAPFile, highSyntax: ISyntaxResult): Issue | undefined {

    if (!(low.get() instanceof Unknown)) {
      return undefined;
    } else if (!(high.get() instanceof Statements.Select) && !(high.get() instanceof Statements.SelectLoop)) {
      return undefined;
    }

// as first step outline the @DATA, note that void types are okay, as long the field names are specified
    let found = this.downportSelectSingleInline(low, high, lowFile, highSyntax);
    if (found) {
      return found;
    }

    found = this.downportSelectTableInline(low, high, lowFile, highSyntax);
    if (found) {
      return found;
    }

    return undefined;
  }

  private downportSelectSingleInline(_low: StatementNode, high: StatementNode,
                                     lowFile: ABAPFile, _highSyntax: ISyntaxResult): Issue | undefined {
    const targets = high.findFirstExpression(Expressions.SQLIntoStructure)?.findDirectExpressions(Expressions.SQLTarget) || [];
    if (targets.length !== 1) {
      return undefined;
    }

    const inlineData = targets[0].findFirstExpression(Expressions.InlineData);
    if (inlineData === undefined) {
      return undefined;
    }

    const sqlFrom = high.findAllExpressions(Expressions.SQLFromSource);
    if (sqlFrom.length !== 1) {
      return undefined;
    }

    const tableName = sqlFrom[0].findDirectExpression(Expressions.DatabaseTable)?.concatTokens();
    if (tableName === undefined) {
      return undefined;
    }

    const indentation = " ".repeat(high.getFirstToken().getStart().getCol() - 1);
    let fieldList = high.findFirstExpression(Expressions.SQLFieldList);
    if (fieldList === undefined) {
      fieldList = high.findFirstExpression(Expressions.SQLFieldListLoop);
    }
    if (fieldList === undefined) {
      return undefined;
    }
    let fieldDefinition = "";
    const fields = fieldList.findDirectExpressions(Expressions.SQLFieldName);
    const name = inlineData.findFirstExpression(Expressions.TargetField)?.concatTokens() || "error";
    if (fields.length === 1) {
      fieldDefinition = `DATA ${name} TYPE ${tableName}-${fields[0].concatTokens()}.`;
    } else if (fieldList.concatTokens() === "*") {
      fieldDefinition = `DATA ${name} TYPE ${tableName}.`;
    } else if (fieldList.concatTokens().toUpperCase() === "COUNT( * )") {
      fieldDefinition = `DATA ${name} TYPE i.`;
    } else if (fieldList.getChildren().length === 1 && fieldList.getChildren()[0].get() instanceof Expressions.SQLAggregation) {
      const c = fieldList.getChildren()[0];
      if (c instanceof ExpressionNode) {
        const concat = c.findFirstExpression(Expressions.SQLArithmetics)?.concatTokens();
        fieldDefinition = `DATA ${name} TYPE ${tableName}-${concat}.`;
      }
    } else {
      for (const f of fields) {
        const fieldName = f.concatTokens();
        fieldDefinition += indentation + "        " + fieldName + " TYPE " + tableName + "-" + fieldName + ",\n";
      }
      fieldDefinition = `DATA: BEGIN OF ${name},
${fieldDefinition}${indentation}      END OF ${name}.`;
    }

    const fix1 = EditHelper.insertAt(lowFile, high.getStart(), `${fieldDefinition}
${indentation}`);
    const fix2 = EditHelper.replaceRange(lowFile, inlineData.getFirstToken().getStart(), inlineData.getLastToken().getEnd(), name);
    const fix = EditHelper.merge(fix2, fix1);

    return Issue.atToken(lowFile, inlineData.getFirstToken(), "Outline SELECT @DATA", this.getMetadata().key, this.conf.severity, fix);
  }

  private downportSelectTableInline(_low: StatementNode, high: StatementNode,
                                    lowFile: ABAPFile, highSyntax: ISyntaxResult): Issue | undefined {
    const targets = high.findFirstExpression(Expressions.SQLIntoTable)?.findDirectExpressions(Expressions.SQLTarget) || [];
    if (targets.length !== 1) {
      return undefined;
    }
    const indentation = " ".repeat(high.getFirstToken().getStart().getCol() - 1);

    const inlineData = targets[0].findFirstExpression(Expressions.InlineData);
    if (inlineData === undefined) {
      return undefined;
    }

    const sqlFrom = high.findAllExpressions(Expressions.SQLFromSource);
    if (sqlFrom.length === 0) {
      return Issue.atToken(lowFile, high.getFirstToken(), "Error outlining, sqlFrom not found", this.getMetadata().key, this.conf.severity);
    }

    let tableName = sqlFrom[0].findDirectExpression(Expressions.DatabaseTable)?.concatTokens();
    if (tableName === undefined) {
      return undefined;
    }

    const fieldList = high.findFirstExpression(Expressions.SQLFieldList);
    if (fieldList === undefined) {
      return undefined;
    }
    let fieldDefinitions = "";
    for (const f of fieldList.findDirectExpressions(Expressions.SQLFieldName)) {
      let fieldName = f.concatTokens();
      if (fieldName.includes("~")) {
        const split = fieldName.split("~");
        tableName = split[0];
        fieldName = split[1];
      }
      fieldDefinitions += indentation + "        " + fieldName + " TYPE " + tableName + "-" + fieldName + ",\n";
    }

    const uniqueName = this.uniqueName(high.getFirstToken().getStart(), lowFile.getFilename(), highSyntax);
    const name = inlineData.findFirstExpression(Expressions.TargetField)?.concatTokens() || "error";

    let fix1 = EditHelper.insertAt(lowFile, high.getStart(), `TYPES: BEGIN OF ${uniqueName},
${fieldDefinitions}${indentation}      END OF ${uniqueName}.
${indentation}DATA ${name} TYPE STANDARD TABLE OF ${uniqueName} WITH DEFAULT KEY.
${indentation}`);
    if (fieldDefinitions === "") {
      fix1 = EditHelper.insertAt(lowFile, high.getStart(), `DATA ${name} TYPE STANDARD TABLE OF ${tableName} WITH DEFAULT KEY.
${indentation}`);
    }

    const fix2 = EditHelper.replaceRange(lowFile, inlineData.getFirstToken().getStart(), inlineData.getLastToken().getEnd(), name);
    const fix = EditHelper.merge(fix2, fix1);

    return Issue.atToken(lowFile, inlineData.getFirstToken(), "Outline SELECT @DATA", this.getMetadata().key, this.conf.severity, fix);
  }

  private replaceAppendExpression(high: StatementNode, lowFile: ABAPFile, highSyntax: ISyntaxResult): Issue | undefined {
    if (!(high.get() instanceof Statements.Append)) {
      return undefined;
    }

    const children = high.getChildren();
    if (children[1].get() instanceof Expressions.Source) {
      const source = children[1];
      const target = high.findDirectExpression(Expressions.Target);
      if (target === undefined) {
        return undefined;
      }

      const uniqueName = this.uniqueName(high.getFirstToken().getStart(), lowFile.getFilename(), highSyntax);
      const indentation = " ".repeat(high.getFirstToken().getStart().getCol() - 1);
      const firstToken = high.getFirstToken();
      const fix1 = EditHelper.insertAt(lowFile, firstToken.getStart(), `DATA ${uniqueName} LIKE LINE OF ${target?.concatTokens()}.
${indentation}${uniqueName} = ${source.concatTokens()}.\n${indentation}`);
      const fix2 = EditHelper.replaceRange(lowFile, source.getFirstToken().getStart(), source.getLastToken().getEnd(), uniqueName);
      const fix = EditHelper.merge(fix2, fix1);

      return Issue.atToken(lowFile, high.getFirstToken(), "Outline APPEND source expression", this.getMetadata().key, this.conf.severity, fix);
    }

    return undefined;
  }

  private replaceTableExpression(node: StatementNode, lowFile: ABAPFile, highSyntax: ISyntaxResult): Issue | undefined {

    for (const fieldChain of node.findAllExpressionsRecursive(Expressions.FieldChain)) {
      const tableExpression = fieldChain.findDirectExpression(Expressions.TableExpression);
      if (tableExpression === undefined) {
        continue;
      }

      const concat = node.concatTokens().toUpperCase();
      if (concat.includes(" LINE_EXISTS( ") || concat.includes(" LINE_INDEX( ")) {
        // note: line_exists() must be replaced before handling table expressions
        continue;
      }

      let pre = "";
      let startToken: Token | undefined = undefined;
      for (const child of fieldChain.getChildren()) {
        if (startToken === undefined) {
          startToken = child.getFirstToken();
        } else if (child === tableExpression) {
          break;
        }
        pre += child.concatTokens();
      }
      if (startToken === undefined) {
        continue;
      }

      let condition = "";
      for (const c of tableExpression.getChildren() || []) {
        if (c.getFirstToken().getStr() === "[" || c.getFirstToken().getStr() === "]") {
          continue;
        } else if (c.get() instanceof Expressions.ComponentChainSimple && condition === "") {
          condition = "WITH KEY ";
        } else if (c.get() instanceof Expressions.Source && condition === "") {
          condition = "INDEX ";
        }
        condition += c.concatTokens() + " ";
      }

      const uniqueName = this.uniqueName(node.getFirstToken().getStart(), lowFile.getFilename(), highSyntax);
      const indentation = " ".repeat(node.getFirstToken().getStart().getCol() - 1);
      const firstToken = node.getFirstToken();
      const fix1 = EditHelper.insertAt(lowFile, firstToken.getStart(), `DATA ${uniqueName} LIKE LINE OF ${pre}.
${indentation}READ TABLE ${pre} ${condition}INTO ${uniqueName}.
${indentation}IF sy-subrc <> 0.
${indentation}  RAISE EXCEPTION TYPE cx_sy_itab_line_not_found.
${indentation}ENDIF.
${indentation}`);
      const fix2 = EditHelper.replaceRange(lowFile, startToken.getStart(), tableExpression.getLastToken().getEnd(), uniqueName);
      const fix = EditHelper.merge(fix2, fix1);

      return Issue.atToken(lowFile, node.getFirstToken(), "Outline table expression", this.getMetadata().key, this.conf.severity, fix);
    }

    return undefined;
  }

  private outlineCatchSimple(node: StatementNode, lowFile: ABAPFile): Issue | undefined {
    // outlines "CATCH cx_bcs INTO DATA(lx_bcs_excep).", note that this does not need to look at types

    if (!(node.get() instanceof Statements.Catch)) {
      return undefined;
    }

    const target = node.findFirstExpression(Expressions.Target);
    if (!(target?.getFirstChild()?.get() instanceof Expressions.InlineData)) {
      return undefined;
    }

    const classNames = node.findDirectExpressions(Expressions.ClassName);
    if (classNames.length !== 1) {
      return undefined;
    }
    const className = classNames[0].concatTokens();

    const targetName = target.findFirstExpression(Expressions.TargetField)?.concatTokens();
    const indentation = " ".repeat(node.getFirstToken().getStart().getCol() - 1);

    const code = `  DATA ${targetName} TYPE REF TO ${className}.
${indentation}CATCH ${className} INTO ${targetName}.`;

    const fix = EditHelper.replaceRange(lowFile, node.getStart(), node.getEnd(), code);

    return Issue.atToken(lowFile, node.getFirstToken(), "Outline DATA", this.getMetadata().key, this.conf.severity, fix);
  }

  private outlineDataSimple(node: StatementNode, lowFile: ABAPFile): Issue | undefined {
    // outlines "DATA(ls_msg) = temp1.", note that this does not need to look at types

    if (!(node.get() instanceof Statements.Move)) {
      return undefined;
    }

    const target = node.findFirstExpression(Expressions.Target);
    if (!(target?.getFirstChild()?.get() instanceof Expressions.InlineData)) {
      return undefined;
    }

    let type = "";
    const source = node.findFirstExpression(Expressions.Source);
    if (source === undefined) {
      return undefined;
    } else if (source.getChildren().length !== 1) {
      return undefined;
    } else if (!(source.getFirstChild()?.get() instanceof Expressions.FieldChain)) {
      return undefined;
    } else if (source.findFirstExpression(Expressions.FieldOffset)) {
      return undefined;
    } else if (source.findFirstExpression(Expressions.FieldLength)) {
      return undefined;
    } else if (source.findFirstExpression(Expressions.TableExpression)) {
      const chain = source.findDirectExpression(Expressions.FieldChain);
      if (chain !== undefined
          && chain.getChildren().length === 2
          && chain.getChildren()[0].get() instanceof Expressions.SourceField
          && chain.getChildren()[1].get() instanceof Expressions.TableExpression) {
        type = "LINE OF " + chain.getChildren()[0].concatTokens();
      } else {
        return undefined;
      }
    } else {
      type = source.concatTokens();
    }

    const targetName = target.findFirstExpression(Expressions.TargetField)?.concatTokens();
    const indentation = " ".repeat(node.getFirstToken().getStart().getCol() - 1);
    const firstToken = node.getFirstToken();
    const lastToken = node.getLastToken();
    const fix1 = EditHelper.insertAt(lowFile, firstToken.getStart(), `DATA ${targetName} LIKE ${type}.\n${indentation}`);
    const fix2 = EditHelper.replaceRange(lowFile, firstToken.getStart(), lastToken.getEnd(), `${targetName} = ${source.concatTokens()}.`);
    const fix = EditHelper.merge(fix2, fix1);

    return Issue.atToken(lowFile, node.getFirstToken(), "Outline DATA", this.getMetadata().key, this.conf.severity, fix);
  }

  private partiallyImplemented(node: StatementNode, lowFile: ABAPFile): Issue | undefined {

    if (node.get() instanceof Statements.InterfaceDef) {
      const partially = node.findDirectTokenByText("PARTIALLY");
      if (partially === undefined) {
        return undefined;
      }
      const implemented = node.findDirectTokenByText("IMPLEMENTED");
      if (implemented === undefined) {
        return undefined;
      }
      const fix = EditHelper.deleteRange(lowFile, partially.getStart(), implemented.getEnd());
      return Issue.atToken(lowFile, partially, "Downport PARTIALLY IMPLEMENTED", this.getMetadata().key, this.conf.severity, fix);
    }

    return undefined;
  }

  private raiseException(node: StatementNode, lowFile: ABAPFile, highSyntax: ISyntaxResult): Issue | undefined {

    /*
    Note: IF_T100_DYN_MSG does not exist in 702, so this rule is mostly relevant for the transpiler

    DATA foo LIKE if_t100_message=>t100key.
    foo-msgid = 'ZHVAM'.
    foo-msgno = '001'.
    foo-attr1 = 'IF_T100_DYN_MSG~MSGV1'.
    foo-attr2 = 'IF_T100_DYN_MSG~MSGV2'.
    foo-attr3 = 'IF_T100_DYN_MSG~MSGV3'.
    foo-attr4 = 'IF_T100_DYN_MSG~MSGV4'.
    DATA bar TYPE REF TO zcl_hvam_exception.
    CREATE OBJECT bar EXPORTING textid = foo.
    bar->if_t100_dyn_msg~msgty = 'E'.
    bar->if_t100_dyn_msg~msgv1 = 'abc'.
    bar->if_t100_dyn_msg~msgv2 = 'abc'.
    bar->if_t100_dyn_msg~msgv3 = 'abc'.
    bar->if_t100_dyn_msg~msgv4 = 'abc'.
    RAISE EXCEPTION bar.
    */

    if (node.get() instanceof Statements.Raise) {
      const startToken = node.findDirectTokenByText("ID");
      if (startToken === undefined) {
        return undefined;
      }

      const sources = node.findDirectExpressions(Expressions.Source);
      const id = sources[0].concatTokens();

      const numberExpression = node.findExpressionAfterToken("NUMBER");
      if (numberExpression === undefined) {
        throw "downport raiseException, could not find number";
      }
      let number = numberExpression.concatTokens();
      if (numberExpression.get() instanceof Expressions.MessageNumber) {
        number = "'" + number + "'";
      }

      const className = node.findDirectExpression(Expressions.ClassName)?.concatTokens() || "ERROR";

      const uniqueName1 = this.uniqueName(node.getFirstToken().getStart(), lowFile.getFilename(), highSyntax);
      const uniqueName2 = this.uniqueName(node.getFirstToken().getStart(), lowFile.getFilename(), highSyntax);
      const indentation = " ".repeat(node.getFirstToken().getStart().getCol() - 1);

      const abap = `DATA ${uniqueName1} LIKE if_t100_message=>t100key.
${indentation}${uniqueName1}-msgid = ${id}.
${indentation}${uniqueName1}-msgno = ${number}.
${indentation}DATA ${uniqueName2} TYPE REF TO ${className}.
${indentation}CREATE OBJECT ${uniqueName2} EXPORTING textid = ${uniqueName1}.
${indentation}RAISE EXCEPTION ${uniqueName2}.`;

      const fix = EditHelper.replaceRange(lowFile, node.getStart(), node.getEnd(), abap);
      return Issue.atToken(lowFile, startToken, "Downport RAISE MESSAGE", this.getMetadata().key, this.conf.severity, fix);
    }

    return undefined;
  }

  private emptyKey(node: StatementNode, lowFile: ABAPFile): Issue | undefined {

    for (let i of node.findAllExpressions(Expressions.TypeTable)) {
      const key = i.findDirectExpression(Expressions.TypeTableKey);
      if (key === undefined) {
        continue;
      }
      i = key;
      const concat = i.concatTokens();
      if (concat.toUpperCase().includes("WITH EMPTY KEY") === false) {
        continue;
      }
      const token = i.findDirectTokenByText("EMPTY");
      if (token === undefined) {
        continue;
      }

      const fix = EditHelper.replaceToken(lowFile, token, "DEFAULT");
      return Issue.atToken(lowFile, i.getFirstToken(), "Downport EMPTY KEY", this.getMetadata().key, this.conf.severity, fix);
    }

    return undefined;
  }

  private moveWithSimpleValue(high: StatementNode, lowFile: ABAPFile): Issue | undefined {
    if (!(high.get() instanceof Statements.Move)
        || high.getChildren().length !== 4) {
      return undefined;
    }

    const target = high.findDirectExpression(Expressions.Target);
    if (target === undefined) {
      return undefined;
    }
    const source = high.findDirectExpression(Expressions.Source);
    if (source === undefined) {
      return undefined;
    }
    const field = target.findDirectExpression(Expressions.TargetField);
    if (field === undefined) {
      return;
    }
    const valueBody = source.findDirectExpression(Expressions.ValueBody);
    if (valueBody === undefined || valueBody.getChildren().length !== 1) {
      return;
    }
    const fieldAssignment = valueBody.findDirectExpression(Expressions.FieldAssignment);
    if (fieldAssignment === undefined) {
      return;
    }

    const indentation = " ".repeat(high.getFirstToken().getStart().getCol() - 1);
    const code = `CLEAR ${target.concatTokens()}.\n` + indentation + target.concatTokens() + "-" + fieldAssignment.concatTokens();

    const start = high.getFirstToken().getStart();
    const end = high.getLastToken().getStart();
    const fix = EditHelper.replaceRange(lowFile, start, end, code);

    return Issue.atToken(lowFile, high.getFirstToken(), "Downport, Reduce statement", this.getMetadata().key, this.conf.severity, fix);
  }

  private moveWithOperator(high: StatementNode, lowFile: ABAPFile): Issue | undefined {
    if (!(high.get() instanceof Statements.Move)) {
      return undefined;
    }
    const children = high.getChildren();
    const secondChild = children[1];
    if (secondChild === undefined) {
      return undefined;
    }

    const op = secondChild.getFirstToken();
    let operator = "";
    switch (op.getStr()) {
      case "+":
        operator = " + ";
        break;
      case "-":
        operator = " - ";
        break;
      case "/=":
        operator = " / ";
        break;
      case "*=":
        operator = " * ";
        break;
      case "&&=":
        operator = " && ";
        break;
      default:
        return undefined;
    }

    const target = high.findDirectExpression(Expressions.Target)?.concatTokens();
    if (target === undefined) {
      return;
    }

    const sourceStart = high.findDirectExpression(Expressions.Source)?.getFirstChild()?.getFirstToken().getStart();
    if (sourceStart === undefined) {
      return;
    }

    const fix = EditHelper.replaceRange(lowFile, op.getStart(), sourceStart, "= " + target + operator);

    return Issue.atToken(lowFile, high.getFirstToken(), "Expand operator", this.getMetadata().key, this.conf.severity, fix);
  }

  // must be very simple string templates, like "|{ ls_line-no ALPHA = IN }|"
  private stringTemplateAlpha(node: StatementNode, lowFile: ABAPFile): Issue | undefined {
    if (!(node.get() instanceof Statements.Move)) {
      return undefined;
    }
    const topSource = node.findDirectExpression(Expressions.Source);
    if (topSource === undefined || topSource.getChildren().length !== 1) {
      return undefined;
    }
    const child = topSource.getFirstChild()! as ExpressionNode;
    if (!(child.get() instanceof Expressions.StringTemplate)) {
      return undefined;
    }
    const templateTokens = child.getChildren();
    if (templateTokens.length !== 3
        || templateTokens[0].getFirstToken().getStr() !== "|{"
        || templateTokens[2].getFirstToken().getStr() !== "}|") {
      return undefined;
    }
    const templateSource = child.findDirectExpression(Expressions.StringTemplateSource);
    const formatting = templateSource?.findDirectExpression(Expressions.StringTemplateFormatting)?.concatTokens();
    let functionName = "";
    switch (formatting) {
      case "ALPHA = IN":
        functionName = "CONVERSION_EXIT_ALPHA_INPUT";
        break;
      case "ALPHA = OUT":
        functionName = "CONVERSION_EXIT_ALPHA_OUTPUT";
        break;
      default:
        return undefined;
    }

    const indentation = " ".repeat(node.getFirstToken().getStart().getCol() - 1);
    const source = templateSource?.findDirectExpression(Expressions.Source)?.concatTokens();
    const topTarget = node.findDirectExpression(Expressions.Target)?.concatTokens();

    const code = `CALL FUNCTION '${functionName}'
${indentation}  EXPORTING
${indentation}    input  = ${source}
${indentation}  IMPORTING
${indentation}    output = ${topTarget}.`;
    const fix = EditHelper.replaceRange(lowFile, node.getFirstToken().getStart(), node.getLastToken().getEnd(), code);

    return Issue.atToken(lowFile, node.getFirstToken(), "Downport ALPHA", this.getMetadata().key, this.conf.severity, fix);
  }

  private outlineLoopInput(node: StatementNode, lowFile: ABAPFile, highSyntax: ISyntaxResult): Issue | undefined {

    if (!(node.get() instanceof Statements.Loop)) {
      return undefined;
    } else if (node.findDirectExpression(Expressions.SimpleSource2)) {
      return undefined;
    }

    // the first Source must be outlined
    const s = node.findDirectExpression(Expressions.Source);
    if (s === undefined) {
      return undefined;
    }

    const uniqueName = this.uniqueName(node.getFirstToken().getStart(), lowFile.getFilename(), highSyntax);

    const code = `DATA(${uniqueName}) = ${s.concatTokens()}.\n` +
      " ".repeat(node.getFirstToken().getStart().getCol() - 1);
    const fix1 = EditHelper.insertAt(lowFile, node.getFirstToken().getStart(), code);
    const fix2 = EditHelper.replaceRange(lowFile, s.getFirstToken().getStart(), s.getLastToken().getEnd(), uniqueName);
    const fix = EditHelper.merge(fix2, fix1);

    return Issue.atToken(lowFile, node.getFirstToken(), "Outline LOOP input", this.getMetadata().key, this.conf.severity, fix);
  }

  private outlineLoopTarget(node: StatementNode, lowFile: ABAPFile, _highSyntax: ISyntaxResult): Issue | undefined {
// also allows outlining of voided types
    if (!(node.get() instanceof Statements.Loop)) {
      return undefined;
    }

    const sourceName = node.findDirectExpression(Expressions.SimpleSource2)?.concatTokens();
    if (sourceName === undefined) {
      return undefined;
    }

    const concat = node.concatTokens();
    if (concat.includes(" REFERENCE INTO ")) {
      return undefined;
    }
    const indentation = " ".repeat(node.getFirstToken().getStart().getCol() - 1);

    const dataTarget = node.findDirectExpression(Expressions.Target)?.findDirectExpression(Expressions.InlineData);
    if (dataTarget) {
      const targetName = dataTarget.findDirectExpression(Expressions.TargetField)?.concatTokens() || "DOWNPORT_ERROR";
      const code = `DATA ${targetName} LIKE LINE OF ${sourceName}.\n${indentation}`;
      const fix1 = EditHelper.insertAt(lowFile, node.getFirstToken().getStart(), code);
      const fix2 = EditHelper.replaceRange(lowFile, dataTarget.getFirstToken().getStart(), dataTarget.getLastToken().getEnd(), targetName);
      const fix = EditHelper.merge(fix2, fix1);
      return Issue.atToken(lowFile, node.getFirstToken(), "Outline LOOP data target", this.getMetadata().key, this.conf.severity, fix);
    }

    const fsTarget = node.findDirectExpression(Expressions.FSTarget)?.findDirectExpression(Expressions.InlineFS);
    if (fsTarget) {
      const targetName = fsTarget.findDirectExpression(Expressions.TargetFieldSymbol)?.concatTokens() || "DOWNPORT_ERROR";
      const code = `FIELD-SYMBOLS ${targetName} LIKE LINE OF ${sourceName}.\n${indentation}`;
      const fix1 = EditHelper.insertAt(lowFile, node.getFirstToken().getStart(), code);
      const fix2 = EditHelper.replaceRange(lowFile, fsTarget.getFirstToken().getStart(), fsTarget.getLastToken().getEnd(), targetName);
      const fix = EditHelper.merge(fix2, fix1);
      return Issue.atToken(lowFile, node.getFirstToken(), "Outline LOOP fs target", this.getMetadata().key, this.conf.severity, fix);
    }

    return undefined;
  }

  private outlineFor(forLoop: ExpressionNode, indentation: string): {body: string, end: string} {
    let body = "";
    let end = "";
    const loopSource = forLoop.findFirstExpression(Expressions.Source)?.concatTokens();
    const loopTargetField = forLoop.findFirstExpression(Expressions.TargetField)?.concatTokens();
    if (forLoop.findDirectTokenByText("UNTIL")) {
      const name = forLoop.findFirstExpression(Expressions.Field)?.concatTokens();
      body += indentation + "DATA " + name + " TYPE i.\n";

      const cond = forLoop.findFirstExpression(Expressions.Cond);
      body += indentation + `WHILE NOT ${cond?.concatTokens()}.\n`;
      const field = forLoop.findDirectExpression(Expressions.InlineFieldDefinition)?.findFirstExpression(Expressions.Field)?.concatTokens();
      body += indentation + `  ${field} = ${field} + 1.\n`;
      end = "ENDWHILE";
    } else if (loopTargetField) {
      body += indentation + `LOOP AT ${loopSource} INTO DATA(${loopTargetField}).\n`;
      end = "ENDLOOP";
    } else if (loopTargetField === undefined) {
      const loopTargetFieldSymbol = forLoop.findFirstExpression(Expressions.TargetFieldSymbol)?.concatTokens();
      body += indentation + `LOOP AT ${loopSource} ASSIGNING FIELD-SYMBOL(${loopTargetFieldSymbol}).\n`;
      end = "ENDLOOP";
    }
    return {body, end};
  }

  private outlineSwitch(node: StatementNode, lowFile: ABAPFile, highSyntax: ISyntaxResult): Issue | undefined {
    for (const i of node.findAllExpressionsRecursive(Expressions.Source)) {
      const firstToken = i.getFirstToken();
      if (firstToken.getStr().toUpperCase() !== "SWITCH") {
        continue;
      }

      const type = this.findType(i, lowFile, highSyntax);
      if (type === undefined) {
        continue;
      }

      const uniqueName = this.uniqueName(firstToken.getStart(), lowFile.getFilename(), highSyntax);
      const indentation = " ".repeat(node.getFirstToken().getStart().getCol() - 1);
      let body = "";
      let name = "";

      const switchBody = i.findDirectExpression(Expressions.SwitchBody);
      if (switchBody === undefined) {
        continue;
      }

      for (const l of switchBody?.findDirectExpression(Expressions.Let)?.findDirectExpressions(Expressions.InlineFieldDefinition) || []) {
        name = l.getFirstToken().getStr();
        body += indentation + `DATA(${name}) = ${switchBody.findFirstExpression(Expressions.Source)?.concatTokens()}.\n`;
      }

      body += `DATA ${uniqueName} TYPE ${type}.\n`;
      let firstSource = false;
      let inWhen = false;
      for (const c of switchBody.getChildren()) {
        if (c.get() instanceof Expressions.Source && firstSource === false) {
          body += indentation + `CASE ${c.concatTokens()}.`;
          firstSource = true;
        } else if (c instanceof TokenNode && c.concatTokens().toUpperCase() === "THEN") {
          inWhen = true;
          body += ".\n";
        } else if (c instanceof TokenNode && c.concatTokens().toUpperCase() === "WHEN") {
          inWhen = false;
          body += `\n${indentation}  WHEN `;
        } else if (c instanceof TokenNode && c.concatTokens().toUpperCase() === "OR") {
          body += ` OR `;
        } else if (c instanceof TokenNode && c.concatTokens().toUpperCase() === "ELSE") {
          inWhen = true;
          body += `\n${indentation}  WHEN OTHERS.\n`;
        } else if (inWhen === false) {
          body += c.concatTokens();
        } else {
          body += indentation + "    " + uniqueName + " = " + c.concatTokens() + ".";
        }
      }
      body += "\n" + indentation + "ENDCASE.\n" + indentation;

      const fix1 = EditHelper.insertAt(lowFile, node.getFirstToken().getStart(), body);
      const fix2 = EditHelper.replaceRange(lowFile, firstToken.getStart(), i.getLastToken().getEnd(), uniqueName);
      const fix = EditHelper.merge(fix2, fix1);

      return Issue.atToken(lowFile, firstToken, "Downport SWITCH", this.getMetadata().key, this.conf.severity, fix);
    }

    return undefined;
  }

  private outlineReduce(node: StatementNode, lowFile: ABAPFile, highSyntax: ISyntaxResult): Issue | undefined {
    for (const i of node.findAllExpressionsRecursive(Expressions.Source)) {
      const firstToken = i.getFirstToken();
      if (firstToken.getStr().toUpperCase() !== "REDUCE") {
        continue;
      }

      const type = this.findType(i, lowFile, highSyntax);
      if (type === undefined) {
        continue;
      }

      const uniqueName = this.uniqueName(firstToken.getStart(), lowFile.getFilename(), highSyntax);
      const indentation = " ".repeat(node.getFirstToken().getStart().getCol() - 1);
      let body = "";
      let name = "";

      const reduceBody = i.findDirectExpression(Expressions.ReduceBody);
      if (reduceBody === undefined) {
        continue;
      }

      for (const init of reduceBody.findDirectExpressions(Expressions.InlineFieldDefinition)) {
        name = init.getFirstToken().getStr();
        body += indentation + `DATA(${name}) = ${reduceBody.findFirstExpression(Expressions.Source)?.concatTokens()}.\n`;
      }


      const forLoop = reduceBody.findDirectExpression(Expressions.For);
      if (forLoop === undefined) {
        continue;
      }

      const outlineFor = this.outlineFor(forLoop, indentation);
      body += outlineFor.body;

      const next = reduceBody.findDirectExpression(Expressions.ReduceNext);
      if (next === undefined) {
        continue;
      }
      for (const n of next.getChildren()) {
        if (n.concatTokens().toUpperCase() === "NEXT") {
          continue;
        } else if (n.concatTokens() === "=") {
          body += " = ";
        } else if (n.get() instanceof Expressions.Field) {
          body += indentation + "  " + n.concatTokens();
        } else if (n.get() instanceof Expressions.Source) {
          body += n.concatTokens() + ".\n";
        }
      }

      body += indentation + outlineFor.end + `.\n`;
      body += indentation + `${uniqueName} = ${name}.\n`;

      const abap = `DATA ${uniqueName} TYPE ${type}.\n` +
        body +
        indentation;
      const fix1 = EditHelper.insertAt(lowFile, node.getFirstToken().getStart(), abap);
      const fix2 = EditHelper.replaceRange(lowFile, firstToken.getStart(), i.getLastToken().getEnd(), uniqueName);
      const fix = EditHelper.merge(fix2, fix1);

      return Issue.atToken(lowFile, firstToken, "Downport REDUCE", this.getMetadata().key, this.conf.severity, fix);
    }

    return undefined;
  }

  private outlineValue(node: StatementNode, lowFile: ABAPFile, highSyntax: ISyntaxResult): Issue | undefined {
    const allSources = node.findAllExpressionsRecursive(Expressions.Source);
    for (const s of allSources) {
      const firstToken = s.getFirstToken();
      if (firstToken.getStr().toUpperCase() !== "VALUE") {
        continue;
      }

      let type = this.findType(s, lowFile, highSyntax);
      if (type === undefined) {
        if (node.get() instanceof Statements.Move && node.findDirectExpression(Expressions.Source) === s) {
          type = "LIKE " + node.findDirectExpression(Expressions.Target)?.concatTokens();
        }
        if (type === undefined) {
          continue;
        }
      } else {
        type = "TYPE " + type;
      }

      const valueBody = s.findDirectExpression(Expressions.ValueBody);
      const uniqueName = this.uniqueName(firstToken.getStart(), lowFile.getFilename(), highSyntax);
      let indentation = " ".repeat(node.getFirstToken().getStart().getCol() - 1);
      let body = "";

      const forLoop = valueBody?.findDirectExpression(Expressions.For);
      let outlineFor = {body: "", end: ""};
      if (forLoop !== undefined) {
        outlineFor = this.outlineFor(forLoop, indentation);
        body += outlineFor.body;
        indentation += "  ";
      }

      let structureName = uniqueName;
      let added = false;
      let data = "";
      for (const b of valueBody?.getChildren() || []) {
        if (b.concatTokens() === "(" && added === false) {
          structureName = this.uniqueName(firstToken.getStart(), lowFile.getFilename(), highSyntax);
          data = indentation + `DATA ${structureName} LIKE LINE OF ${uniqueName}.\n`;
        }
        if (b.get() instanceof Expressions.FieldAssignment) {
          if (added === false) {
            body += data;
            added = true;
          }
          body += indentation + structureName + "-" + b.concatTokens() + ".\n";
        } else if (b.get() instanceof Expressions.Source) {
          structureName = b.concatTokens();
        } else if (b instanceof ExpressionNode && b.get() instanceof Expressions.Let) {
          body += this.outlineLet(b, indentation, highSyntax, lowFile);
        } else if (b.concatTokens() === ")") {
          body += indentation + `APPEND ${structureName} TO ${uniqueName}.\n`;
        }
      }

      if (forLoop !== undefined) {
        indentation = indentation.substring(2);
        body += indentation + outlineFor.end + `.\n`;
      }

      const abap = `DATA ${uniqueName} ${type}.\n` +
        body +
        indentation;
      const fix1 = EditHelper.insertAt(lowFile, node.getFirstToken().getStart(), abap);
      const fix2 = EditHelper.replaceRange(lowFile, firstToken.getStart(), s.getLastToken().getEnd(), uniqueName);
      const fix = EditHelper.merge(fix2, fix1);

      return Issue.atToken(lowFile, firstToken, "Downport VALUE", this.getMetadata().key, this.conf.severity, fix);
    }

    return undefined;
  }

  private outlineLet(node: ExpressionNode, indentation: string, highSyntax: ISyntaxResult, lowFile: ABAPFile): string {
    let ret = "";
    for (const f of node.findDirectExpressions(Expressions.InlineFieldDefinition)) {
      const c = f.getFirstChild();
      if (c === undefined) {
        continue;
      }
      const name = c.concatTokens().toLowerCase();

      const spag = highSyntax.spaghetti.lookupPosition(c.getFirstToken().getStart(), lowFile.getFilename());
      if (spag === undefined) {
        continue;
      }

      const found = spag.findVariable(name);
      if (found === undefined) {
        continue;
      }
      const type = found.getType().getQualifiedName() ? found.getType().getQualifiedName()?.toLowerCase() : found.getType().toABAP();

      ret += indentation + "DATA " + name + ` TYPE ${type}.\n`;

      const source = f.findFirstExpression(Expressions.Source);
      if (source) {
        ret += indentation + name + ` = ${source.concatTokens()}.\n`;
      }
    }
    return ret;
  }

  private findType(i: ExpressionNode, lowFile: ABAPFile, highSyntax: ISyntaxResult): string | undefined {

    const expr = i.findDirectExpression(Expressions.TypeNameOrInfer);
    if (expr === undefined) {
      return undefined;
    }
    const firstToken = expr.getFirstToken();

    const concat = expr.concatTokens().toLowerCase();
    if (concat !== "#") {
      return concat;
    }

    const spag = highSyntax.spaghetti.lookupPosition(firstToken.getStart(), lowFile.getFilename());
    if (spag === undefined) {
      return undefined;
    }

    let inferred: TypedIdentifier | undefined = undefined;
    for (const r of spag?.getData().references || []) {
      if (r.referenceType === ReferenceType.InferredType
          && r.resolved
          && r.position.getStart().equals(firstToken.getStart())
          && r.resolved instanceof TypedIdentifier) {
        inferred = r.resolved;
        break;
      }
    }
    if (inferred === undefined) {
      return undefined;
    }

    return inferred.getType().getQualifiedName()?.toLowerCase();
  }

  private outlineFS(node: StatementNode, lowFile: ABAPFile, highSyntax: ISyntaxResult): Issue | undefined {

    for (const i of node.findAllExpressionsRecursive(Expressions.InlineFS)) {
      const nameToken = i.findDirectExpression(Expressions.TargetFieldSymbol)?.getFirstToken();
      if (nameToken === undefined) {
        continue;
      }
      const name = nameToken.getStr();

      let type = "";
      if (node.concatTokens().toUpperCase().startsWith("APPEND INITIAL LINE TO ")) {
        type = "LIKE LINE OF " + node.findFirstExpression(Expressions.Target)?.concatTokens();
      } else {
        const spag = highSyntax.spaghetti.lookupPosition(nameToken.getStart(), lowFile.getFilename());
        if (spag === undefined) {
          continue;
        }
        const found = spag.findVariable(name);
        if (found === undefined) {
          continue;
        } else if (found.getType() instanceof VoidType) {
          return Issue.atToken(lowFile, i.getFirstToken(), "Error outlining voided type", this.getMetadata().key, this.conf.severity);
        }
        type = "TYPE ";
        type += found.getType().getQualifiedName() ? found.getType().getQualifiedName()!.toLowerCase() : found.getType().toABAP();
      }

      const code = `FIELD-SYMBOLS ${name} ${type}.\n` +
        " ".repeat(node.getFirstToken().getStart().getCol() - 1);
      const fix1 = EditHelper.insertAt(lowFile, node.getFirstToken().getStart(), code);
      const fix2 = EditHelper.replaceRange(lowFile, i.getFirstToken().getStart(), i.getLastToken().getEnd(), name);
      const fix = EditHelper.merge(fix2, fix1);

      return Issue.atToken(lowFile, i.getFirstToken(), "Outline FIELD-SYMBOL", this.getMetadata().key, this.conf.severity, fix);
    }

    return undefined;
  }

  private outlineData(node: StatementNode, lowFile: ABAPFile, highSyntax: ISyntaxResult): Issue | undefined {
    for (const i of node.findAllExpressionsRecursive(Expressions.InlineData)) {
      const nameToken = i.findDirectExpression(Expressions.TargetField)?.getFirstToken();
      if (nameToken === undefined) {
        continue;
      }
      const name = nameToken.getStr();

      const spag = highSyntax.spaghetti.lookupPosition(nameToken.getStart(), lowFile.getFilename());
      if (spag === undefined) {
        continue;
      }

      const found = spag.findVariable(name);
      if (found === undefined) {
        continue;
      } else if (found.getType() instanceof VoidType && found.getType().getQualifiedName() === undefined) {
        continue;
      }

      const type = found.getType().getQualifiedName() ? found.getType().getQualifiedName()?.toLowerCase() : found.getType().toABAP();

      const code = `DATA ${name} TYPE ${type}.\n` +
        " ".repeat(node.getFirstToken().getStart().getCol() - 1);
      const fix1 = EditHelper.insertAt(lowFile, node.getFirstToken().getStart(), code);
      const fix2 = EditHelper.replaceRange(lowFile, i.getFirstToken().getStart(), i.getLastToken().getEnd(), name);
      const fix = EditHelper.merge(fix2, fix1);

      return Issue.atToken(lowFile, i.getFirstToken(), "Outline DATA", this.getMetadata().key, this.conf.severity, fix);
    }

    return undefined;
  }

  private outlineCond(node: StatementNode, lowFile: ABAPFile, highSyntax: ISyntaxResult): Issue | undefined {
    for (const i of node.findAllExpressionsRecursive(Expressions.Source)) {
      if (i.getFirstToken().getStr().toUpperCase() !== "COND") {
        continue;
      }

      const body = i.findDirectExpression(Expressions.CondBody);
      if (body === undefined) {
        continue;
      }

      const uniqueName = this.uniqueName(i.getFirstToken().getStart(), lowFile.getFilename(), highSyntax);
      const type = this.findType(i, lowFile, highSyntax);
      const indent = " ".repeat(node.getFirstToken().getStart().getCol() - 1);
      const bodyCode = this.buildCondBody(body, uniqueName, indent, lowFile, highSyntax);

      const abap = `DATA ${uniqueName} TYPE ${type}.\n` + bodyCode;
      const fix1 = EditHelper.insertAt(lowFile, node.getFirstToken().getStart(), abap);
      const fix2 = EditHelper.replaceRange(lowFile, i.getFirstToken().getStart(), i.getLastToken().getEnd(), uniqueName);
      const fix = EditHelper.merge(fix2, fix1);

      return Issue.atToken(lowFile, i.getFirstToken(), "Downport COND", this.getMetadata().key, this.conf.severity, fix);
    }

    return undefined;
  }

  private buildCondBody(body: ExpressionNode, uniqueName: string, indent: string, lowFile: ABAPFile, highSyntax: ISyntaxResult) {
    let code = "";

    let first = true;
    for (const c of body.getChildren()) {
      if (c instanceof TokenNode) {
        switch (c.getFirstToken().getStr().toUpperCase()) {
          case "WHEN":
            if (first === true) {
              code += indent + "IF ";
              first = false;
            } else {
              code += indent + "ELSEIF ";
            }
            break;
          case "THEN":
            code += ".\n";
            break;
          case "ELSE":
            code += indent + "ELSE.\n";
            break;
          default:
            throw "buildCondBody, unexpected token";
        }
      } else if (c.get() instanceof Expressions.Cond) {
        code += c.concatTokens();
      } else if (c.get() instanceof Expressions.Let) {
        code += this.outlineLet(c, indent, highSyntax, lowFile);
      } else if (c.get() instanceof Expressions.Source) {
        code += indent + "  " + uniqueName + " = " + c.concatTokens() + ".\n";
      } else {
        throw "buildCondBody, unexpected expression, " + c.get().constructor.name;
      }
    }
    code += indent + "ENDIF.\n";

    code += indent;
    return code;
  }

  private outlineConv(node: StatementNode, lowFile: ABAPFile, highSyntax: ISyntaxResult): Issue | undefined {
    for (const i of node.findAllExpressionsRecursive(Expressions.Source)) {
      if (i.getFirstToken().getStr().toUpperCase() !== "CONV") {
        continue;
      }

      const body = i.findDirectExpression(Expressions.ConvBody)?.concatTokens();
      if (body === undefined) {
        continue;
      }

      const uniqueName = this.uniqueName(i.getFirstToken().getStart(), lowFile.getFilename(), highSyntax);
      const type = this.findType(i, lowFile, highSyntax);
      const indent = " ".repeat(node.getFirstToken().getStart().getCol() - 1);

      const abap = `DATA ${uniqueName} TYPE ${type}.\n` +
        indent + `${uniqueName} = ${body}.\n` +
        indent;
      const fix1 = EditHelper.insertAt(lowFile, node.getFirstToken().getStart(), abap);
      const fix2 = EditHelper.replaceRange(lowFile, i.getFirstToken().getStart(), i.getLastToken().getEnd(), uniqueName);
      const fix = EditHelper.merge(fix2, fix1);

      return Issue.atToken(lowFile, i.getFirstToken(), "Downport CONV", this.getMetadata().key, this.conf.severity, fix);
    }

    return undefined;
  }

  // "CAST" to "?="
  private outlineCast(node: StatementNode, lowFile: ABAPFile, highSyntax: ISyntaxResult): Issue | undefined {

    for (const i of node.findAllExpressionsRecursive(Expressions.Cast)) {
      const uniqueName = this.uniqueName(i.getFirstToken().getStart(), lowFile.getFilename(), highSyntax);
      const type = this.findType(i, lowFile, highSyntax);
      const body = i.findDirectExpression(Expressions.Source)?.concatTokens();

      const abap = `DATA ${uniqueName} TYPE REF TO ${type}.\n` +
        " ".repeat(node.getFirstToken().getStart().getCol() - 1) +
        `${uniqueName} ?= ${body}.\n` +
        " ".repeat(node.getFirstToken().getStart().getCol() - 1);
      const fix1 = EditHelper.insertAt(lowFile, node.getFirstToken().getStart(), abap);
      const fix2 = EditHelper.replaceRange(lowFile, i.getFirstToken().getStart(), i.getLastToken().getEnd(), uniqueName);
      const fix = EditHelper.merge(fix2, fix1);

      return Issue.atToken(lowFile, i.getFirstToken(), "Downport CAST", this.getMetadata().key, this.conf.severity, fix);
    }

    return undefined;
  }

  private uniqueName(position: Position, filename: string, highSyntax: ISyntaxResult): string {
    const spag = highSyntax.spaghetti.lookupPosition(position, filename);
    if (spag === undefined) {
      const name = "temprr" + this.counter;
      this.counter++;
      return name;
    }

    while (true) {
      const name = "temp" + this.counter;
      const found = spag.findVariable(name);
      this.counter++;
      if (found === undefined) {
        return name;
      }
    }
  }

  private replaceXsdBool(node: StatementNode, lowFile: ABAPFile, highSyntax: ISyntaxResult): Issue | undefined {
    const spag = highSyntax.spaghetti.lookupPosition(node.getFirstToken().getStart(), lowFile.getFilename());

    for (const r of spag?.getData().references || []) {
      if (r.referenceType === ReferenceType.BuiltinMethodReference
          && r.position.getName().toUpperCase() === "XSDBOOL") {
        const token = r.position.getToken();
        const fix = EditHelper.replaceRange(lowFile, token.getStart(), token.getEnd(), "boolc");
        return Issue.atToken(lowFile, token, "Use BOOLC", this.getMetadata().key, this.conf.severity, fix);
      }
    }

    return undefined;
  }

  private findMethodCallExpression(node: StatementNode, token: Token) {
    for (const m of node.findAllExpressions(Expressions.MethodCall)) {
      if (m.findDirectExpression(Expressions.MethodName)?.getFirstToken().getStart().equals(token.getStart())) {
        return m;
      }
    }
    return undefined;
  }

  private replaceLineFunctions(node: StatementNode, lowFile: ABAPFile, highSyntax: ISyntaxResult): Issue | undefined {
    const spag = highSyntax.spaghetti.lookupPosition(node.getFirstToken().getStart(), lowFile.getFilename());

    for (const r of spag?.getData().references || []) {
      if (r.referenceType !== ReferenceType.BuiltinMethodReference) {
        continue;
      }
      const func = r.position.getName().toUpperCase();
      if (func === "LINE_EXISTS" || func === "LINE_INDEX") {
        const token = r.position.getToken();

        const expression = this.findMethodCallExpression(node, token);
        if (expression === undefined) {
          continue;
        }

        let condition = "";
        for (const c of expression?.findFirstExpression(Expressions.TableExpression)?.getChildren() || []) {
          if (c.getFirstToken().getStr() === "[" || c.getFirstToken().getStr() === "]") {
            continue;
          } else if (c.get() instanceof Expressions.ComponentChainSimple && condition === "") {
            condition = "WITH KEY ";
          } else if (c.get() instanceof Expressions.Source && condition === "") {
            condition = "INDEX ";
          }
          condition += c.concatTokens() + " ";
        }

        const tableName = expression.findFirstExpression(Expressions.Source)?.concatTokens().split("[")[0];

        const uniqueName = this.uniqueName(node.getFirstToken().getStart(), lowFile.getFilename(), highSyntax);
        const indentation = " ".repeat(node.getFirstToken().getStart().getCol() - 1);

        const sy = func === "LINE_EXISTS" ? "sy-subrc" : "sy-tabix";

        const code = `DATA ${uniqueName} LIKE sy-subrc.\n` +
          indentation + `READ TABLE ${tableName} ${condition}TRANSPORTING NO FIELDS.\n` +
          indentation + uniqueName + ` = ${sy}.\n` +
          indentation ;
        const fix1 = EditHelper.insertAt(lowFile, node.getFirstToken().getStart(), code);
        const start = expression.getFirstToken().getStart();
        const end = expression.getLastToken().getEnd();
        const fix2 = EditHelper.replaceRange(lowFile, start, end, uniqueName + (func === "LINE_EXISTS" ? " = 0" : ""));
        const fix = EditHelper.merge(fix2, fix1);

        return Issue.atToken(lowFile, token, "Use BOOLC", this.getMetadata().key, this.conf.severity, fix);
      }
    }

    return undefined;
  }

  private newToCreateObject(node: StatementNode, lowFile: ABAPFile, highSyntax: ISyntaxResult): Issue | undefined {
    const source = node.findDirectExpression(Expressions.Source);

    let fix: IEdit | undefined = undefined;
    if (node.get() instanceof Statements.Move
        && source
        && source.getFirstToken().getStr().toUpperCase() === "NEW") {
      const target = node.findDirectExpression(Expressions.Target);
      const found = source?.findFirstExpression(Expressions.NewObject);
      // must be at top level of the source for quickfix to work(todo: handle more scenarios)
      // todo, assumption: the target is not an inline definition
      if (target && found && source.concatTokens() === found.concatTokens()) {
        const abap = this.newParameters(found, target.concatTokens(), highSyntax, lowFile);
        if (abap !== undefined) {
          fix = EditHelper.replaceRange(lowFile, node.getFirstToken().getStart(), node.getLastToken().getEnd(), abap);
        }
      }
    }

    if (fix === undefined && node.findAllExpressions(Expressions.NewObject)) {
      const found = node.findFirstExpression(Expressions.NewObject);
      if (found === undefined) {
        return undefined;
      }
      const name = this.uniqueName(found.getFirstToken().getStart(), lowFile.getFilename(), highSyntax);
      const abap = this.newParameters(found, name, highSyntax, lowFile);
      if (abap === undefined) {
        return undefined;
      }

      const type = this.findType(found, lowFile, highSyntax);
      const indentation = " ".repeat(node.getFirstToken().getStart().getCol() - 1);

      const data = `DATA ${name} TYPE REF TO ${type}.\n` +
        indentation + abap + "\n" +
        indentation;
      const fix1 = EditHelper.insertAt(lowFile, node.getFirstToken().getStart(), data);
      const fix2 = EditHelper.replaceRange(lowFile, found.getFirstToken().getStart(), found.getLastToken().getEnd(), name);
      fix = EditHelper.merge(fix2, fix1);
    }

    if (fix) {
      return Issue.atToken(lowFile, node.getFirstToken(), "Use CREATE OBJECT instead of NEW", this.getMetadata().key, this.conf.severity, fix);
    } else {
      return undefined;
    }
  }

  private newParameters(found: ExpressionNode, name: string, highSyntax: ISyntaxResult, lowFile: ABAPFile): string | undefined {
    const typeToken = found.findDirectExpression(Expressions.TypeNameOrInfer)?.getFirstToken();
    let extra = typeToken?.getStr() === "#" ? "" : " TYPE " + typeToken?.getStr();

    const parameters = found.findFirstExpression(Expressions.ParameterListS);
    if (parameters) {
      extra = parameters ? extra + " EXPORTING " + parameters.concatTokens() : extra;
    } else if (typeToken) {
      const source = found.findDirectExpression(Expressions.Source)?.concatTokens();
      if (source) {
        // find the default parameter name for the constructor
        const spag = highSyntax.spaghetti.lookupPosition(typeToken?.getStart(), lowFile.getFilename());

        let cdef: IClassDefinition | undefined = undefined;
        for (const r of spag?.getData().references || []) {
          if ((r.referenceType === ReferenceType.InferredType
              || r.referenceType === ReferenceType.ObjectOrientedReference)
              && r.resolved && r.position.getStart().equals(typeToken.getStart())) {
            cdef = r.resolved as IClassDefinition;
          }
        }

        if (cdef && cdef.getMethodDefinitions === undefined) {
          return undefined; // something wrong
        }
        const importing = cdef?.getMethodDefinitions().getByName("CONSTRUCTOR")?.getParameters().getDefaultImporting();
        if (importing) {
          extra += " EXPORTING " + importing + " = " + source;
        } else if (spag === undefined) {
          extra += " SpagUndefined";
        } else if (cdef === undefined) {
          extra += " ClassDefinitionNotFound";
        } else {
          extra += " SomeError";
        }
      }
    }

    const abap = `CREATE OBJECT ${name}${extra}.`;

    return abap;
  }

}
