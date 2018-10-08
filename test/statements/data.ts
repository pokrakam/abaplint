import {statementType} from "../utils";
import * as Statements from "../../src/abap/statements/";

let tests = [
  "DATA lv_foo TYPE i.",
  "DATA lv_foo LIKE LINE OF foo.",
  "DATA lv_foo LIKE lv_foo.",
  "DATA lv_foo TYPE REF TO cl_foobar.",
  "DATA lv_foo TYPE TABLE OF i.",
  "DATA lv_foo TYPE zcl_class=>typedef.",
  "class-data EOL type CHAR01 value CL_ABAP_CHAR_UTILITIES=>CR_LF.",
  "DATA lv_foo LIKE sy-tabix.",
  "data foo type ref to ZCL_FOOBAR.",
  "data foo type ref to ZCL_FOOBAR .",
  "data lt_foo LIKE STANDARD TABLE OF ld_font_family.",
  "data lt_data type table of d020s with header line.",
  "DATA sdf TYPE c ##NEEDED.",
  "Data foo(89) type c.",
  "data foo type char100.",
  "data foo100 type c length 100.",
  "DATA lv_int TYPE c LENGTH c_length.",
  "data char.",
  "data char(100).",
  "data sdf type table of ref to zcl_foobar.",
  "data range type range of string.",
  "data lt_foo type table of bar initial size 0.",
  "data foo    type  i value -1.",
  "data foobar type abap_bool read-only value ABAP_FALSE ##NO_TEXT.",
  "data item(4) value '  # '.",
  "CLASS-DATA gv_out TYPE xstring.",
  "DATA ls_field_cat_comp  LIKE LINE OF <ls_object_table>-field_catalog.",
  "DATA lt_ucomm TYPE TABLE OF sy-ucomm.",
  "DATA tab LIKE foobar OCCURS 0 WITH HEADER LINE.",
  "DATA tab LIKE foobar OCCURS 0.",
  "DATA tab TYPE foobar OCCURS 0 WITH HEADER LINE.",
  "DATA mt_stage TYPE SORTED TABLE OF ty_stage WITH UNIQUE KEY file-path file-filename.",
  "data foo like bar[].",
  "DATA lt_list TYPE ddictype WITH HEADER LINE.",
  "DATA ret TYPE TABLE OF bapiret2 WITH HEADER LINE.",
  "data mt_field TYPE TABLE OF ty_view_field " +
    "WITH NON-UNIQUE SORTED KEY view_fieldname COMPONENTS view_fieldname " +
    "WITH NON-UNIQUE SORTED KEY no_case COMPONENTS no_case.",
  "DATA %id TYPE flag.",
  "class-data gv_var type zfoo value 'FOO' read-only .",
  "DATA /foo/bar TYPE /foo/bar.",
  "DATA lr_/foo/cx_bar TYPE REF TO /foo/bar.",
  "DATA li_data(200) TYPE c OCCURS 0 WITH HEADER LINE.",
  "DATA lr_range type range of type WITH HEADER LINE.",
  "data $field type c.",
  "data $fie$ld type c.",
  "data lt_foo type standard table of snodetext initial size 0 with header line.",
  "DATA ret TYPE TABLE OF foobar INITIAL SIZE 10 WITH HEADER LINE.",
// todo
//  "DATA lt_tab OCCURS 10.",
//  "DATA range TYPE RANGE OF char30 WITH HEADER LINE.",
//  "data mepo1313-evers like ekpo-evers.",
];

statementType(tests, "DATA", Statements.Data);