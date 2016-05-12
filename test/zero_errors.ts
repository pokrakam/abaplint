import "../typings/main.d.ts";
import Runner from "../src/runner";
import File from "../src/file";
import * as fs from "fs";
import * as chai from "chai";

let expect = chai.expect;

describe("zero errors", () => {
  let tests = [
    "zhello01",
    "zhello02",
    "zhello03",
    "zhello04",
    "zhello05",
    "zhello06",
    "zhello07",
    "zhello08",
    "zhello09",
    "zhello10",
    "zhello11",
    "zhello12",
    "zhello13",
    "zhello14",
    "zhello15",
    "zif01",
    "zif02",
    "zif03",
    "zcomment01",
    "zcomment02",
    "zcomment03",
    "zmove_corresponding",
    "zdefine01",
    "zcall01",
    "zdata01",
  ];

  tests.forEach((test) => {
    it(test + " should have zero errors", () => {
      let filename = "./test/abap/" + test + ".prog.abap";
      let file = new File(filename, fs.readFileSync(filename, "utf8"));
      Runner.run([file]);
      expect(file.getIssueCount()).to.equals(0);
    });
  });
});