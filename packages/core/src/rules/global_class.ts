import {Issue} from "../issue";
import {ABAPRule} from "./_abap_rule";
import {IObject} from "../objects/_iobject";
import * as Objects from "../objects";
import {BasicRuleConfig} from "./_basic_rule_config";
import {IRuleMetadata, RuleTag} from "./_irule";
import {ABAPFile} from "../abap/abap_file";

export class GlobalClassConf extends BasicRuleConfig {
}

export class GlobalClass extends ABAPRule {
  private conf = new GlobalClassConf();

  public getMetadata(): IRuleMetadata {
    return {
      key: "global_class",
      title: "Global class checks",
      shortDescription: `Checks related to global classes.

* global classes must be in own files

* file names must match class name

* file names must match interface name

* global classes must be global definitions

* global interfaces must be global definitions`,
      tags: [RuleTag.Syntax],
    };
  }

  public getConfig() {
    return this.conf;
  }

  public setConfig(conf: GlobalClassConf) {
    this.conf = conf;
  }

  public runParsed(file: ABAPFile, obj: IObject) {
    const output: Issue[] = [];

    for (const definition of file.getInfo().listClassDefinitions()) {
      if (definition.isLocal && obj instanceof Objects.Class && file.getFilename().match(/\.clas\.abap$/)) {
        const issue = Issue.atIdentifier(definition.identifier, "Global classes must be global", this.getMetadata().key, this.conf.severity);
        output.push(issue);
      }

      if (definition.isGlobal && obj instanceof Objects.Class && definition.name.toUpperCase() !== obj.getName().toUpperCase()) {
        const issue = Issue.atIdentifier(definition.identifier, "Class definition name must match filename", this.getMetadata().key, this.conf.severity);
        output.push(issue);
      }

      if (definition.isGlobal && !(obj instanceof Objects.Class)) {
        const issue = Issue.atIdentifier(definition.identifier, "Class must be local", this.getMetadata().key, this.conf.severity);
        output.push(issue);
      }
    }

    for (const impl of file.getInfo().listClassImplementations()) {
      if (file.getFilename().match(/\.clas\.abap$/)
          && obj instanceof Objects.Class
          && impl.identifier.getName().toUpperCase() !== obj.getName().toUpperCase()) {
        const issue = Issue.atIdentifier(impl.identifier, "Class implementation name must match filename", this.getMetadata().key, this.conf.severity);
        output.push(issue);
      }
    }

    for (const impl of file.getInfo().listInterfaceDefinitions()) {
      if (file.getFilename().match(/\.intf\.abap$/)
          && obj instanceof Objects.Interface
          && impl.identifier.getName().toUpperCase() !== obj.getName().toUpperCase()) {
        const issue = Issue.atIdentifier(impl.identifier, "Interface implementation name must match filename", this.getMetadata().key, this.conf.severity);
        output.push(issue);
      }
    }

    for (const intf of file.getInfo().listInterfaceDefinitions()) {
      if (intf.isLocal && obj instanceof Objects.Interface && file.getFilename().match(/\.intf\.abap$/)) {
        const issue = Issue.atIdentifier(intf.identifier, "Global interface must be global", this.getMetadata().key, this.conf.severity);
        output.push(issue);
      }
    }

    return output;
  }
}