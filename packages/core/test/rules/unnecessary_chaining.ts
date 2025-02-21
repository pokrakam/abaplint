import {UnnecessaryChaining} from "../../src/rules";
import {testRule, testRuleFixSingle} from "./_utils";

const tests = [
  {abap: `parser error`, cnt: 0},
  {abap: `WRITE: bar.`, cnt: 1},
  {abap: `WRITE bar.`, cnt: 0},
  {abap: `WRITE: bar, moo.`, cnt: 0},
  {abap: `* comment`, cnt: 0},
  {abap: `* comment
* comment`, cnt: 0},
  {abap: `TYPES: BEGIN OF t_test,
  " comment will break this check
   value  TYPE abap_bool,
 END OF t_test.`, cnt: 0},
];

testRule(tests, UnnecessaryChaining);

function testFix(input: string, expected: string) {
  testRuleFixSingle(input, expected, new UnnecessaryChaining());
}

describe("Rule: unnecessary_chaining", () => {
  it("quick fix 1", async () => {
    const abap = "WRITE: 'foo'.";
    const expected = "WRITE 'foo'.";
    testFix(abap, expected);
  });
});