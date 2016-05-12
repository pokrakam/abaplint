import "../typings/main.d.ts";
import * as chai from "chai";
import * as fs from "fs";
import * as Statements from "../src/statements/";
import File from "../src/file";
import Runner from "../src/runner";

let expect = chai.expect;

describe("all_unknown", () => {
  let filename = "zall_unknown";
  it(filename + " should only have Unknown statements", () => {
    let code = fs.readFileSync("./test/abap/" + filename + ".prog.abap", "utf8");
    let file = new File(filename, code);
    Runner.run([file]);
    for (let statement of file.getStatements()) {
      expect(statement instanceof Statements.Unknown).to.equals(true);
    }
  });
});