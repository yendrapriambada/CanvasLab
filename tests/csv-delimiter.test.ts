import { describe, it, expect } from 'vitest';
import { parseCSV, encodeCSV } from '../src/editor/geometry';
describe('CSV and TSV delimiter detection',()=>{
 it('retains tabs as content when the first record is comma delimited',()=>{
  expect(parseCSV('name,notes\nAlice,hello\tworld')).toEqual([['name','notes'],['Alice','hello\tworld']]);
  expect(parseCSV('name,hello\tworld\nAlice,plain')).toEqual([['name','hello\tworld'],['Alice','plain']]);
 });
 it('detects tab separated clipboard data from the first record',()=>{
  expect(parseCSV('name\tnotes\nAlice\thello, world')).toEqual([['name','notes'],['Alice','hello, world']]);
 });
 it('ignores separators inside quotes when detecting the delimiter',()=>{
  expect(parseCSV('"A,B"\tNotes\nAlice\t"C,D"')).toEqual([['A,B','Notes'],['Alice','C,D']]);
  expect(parseCSV('"A\tB",Notes\nAlice,"C\tD"')).toEqual([['A\tB','Notes'],['Alice','C\tD']]);
 });
 it('reads a complete quoted multiline first record before choosing the delimiter',()=>{
  expect(parseCSV('"A\nB"\tNotes\r\nAlice\thello, world')).toEqual([['A\nB','Notes'],['Alice','hello, world']]);
 });
 it('round-trips a single-column file whose first cell contains a tab',()=>{
  const cells=[['tabs\there'],['plain']];
  expect(parseCSV(encodeCSV(cells))).toEqual(cells);
 });
 it('round-trips tabs, quotes, commas and multiline cells through CSV',()=>{
  const cells=[['name','notes'],['Alice','tabs\there'],['Bob','"quoted", text\nand tabs\there']];
  expect(parseCSV(encodeCSV(cells))).toEqual(cells);
 });
});
