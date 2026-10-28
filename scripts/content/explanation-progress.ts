// Editorial work ledger for public content only. No private settings or build hooks.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ROOT, noSymlink } from "../build/paths";

type RecordState = {
  status: "pending" | "written" | "checked";
  initialExplanationHash: string;
  checkedExplanationHash?: string;
  exception?: string;
};
type Ledger = {
  version: 1;
  startedAt: string;
  scope: string;
  works: Record<string, { path: string; protectedHash: string }>;
  entries: Record<string, RecordState>;
  noEquivalent: Record<string, RecordState>;
};
const publicRoot = path.join(ROOT, "content/public");
const ledgerPath = path.join(ROOT, "docs/explanation-progress.json");
const languages = JSON.parse(fs.readFileSync(path.join(ROOT, "config/languages.json"), "utf8")).map((l: { code: string }) => l.code);
const digest = (value: unknown) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const explanation = (e: any) => ({ vocabulary: e.vocabulary, grammar: e.grammar, notes: e.notes, references: e.references, pronunciationNote: e.pronunciation?.note });

function inventory() {
  const works: Record<string, { path: string; protectedHash: string }> = {};
  const entries: Record<string, any> = {};
  const noEquivalent: Record<string, any> = {};
  let units = 0;
  noSymlink(publicRoot, publicRoot);
  for (const type of fs.readdirSync(publicRoot).sort()) {
    const dir = path.join(publicRoot, type);
    noSymlink(publicRoot, dir);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const id of fs.readdirSync(dir).sort()) {
      const workDir = path.join(dir, id);
      noSymlink(publicRoot, workDir);
      if (!fs.statSync(workDir).isDirectory()) continue;
      const file = path.join(workDir, "content.json");
      noSymlink(publicRoot, file);
      if (!fs.existsSync(file)) continue;
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      if (works[data.id]) throw new Error(`Duplicate work: ${data.id}`);
      const protectedData = structuredClone(data);
      delete protectedData.updatedAt;
      delete protectedData.editorialNote;
      delete protectedData.attribution;
      for (const unit of protectedData.units) {
        units++;
        // Object key order is not semantically significant; language set is.
        const ordered = [...languages.filter((l: string) => l in unit.languages), ...Object.keys(unit.languages).filter(l => !languages.includes(l)).sort()];
        unit.languages = Object.fromEntries(ordered.map(l => [l, unit.languages[l]]));
        const originalUnit = data.units.find((u: any) => u.id === unit.id);
        for (const [lang, entry] of Object.entries(unit.languages) as [string, any][]) {
          const key = `${data.id}/${unit.id}/${lang}`;
          if (entries[key]) throw new Error(`Duplicate entry: ${key}`);
          entries[key] = originalUnit.languages[lang];
          for (const field of ["vocabulary", "grammar", "notes", "references"]) delete entry[field];
          if (entry.pronunciation) delete entry.pronunciation.note;
        }
        if (unit.noEquivalent) {
          for (const lang of Object.keys(unit.noEquivalent).sort()) noEquivalent[`${data.id}/${unit.id}/${lang}`] = originalUnit.noEquivalent[lang];
          unit.noEquivalent = Object.keys(unit.noEquivalent).sort();
        }
      }
      works[data.id] = { path: path.relative(ROOT, file), protectedHash: digest(protectedData) };
    }
  }
  return { works, entries, noEquivalent, units };
}

const current = inventory();
const [command = "status", ...args] = process.argv.slice(2);
const save = (ledger: Ledger) => fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2) + "\n");
if (command === "init") {
  if (fs.existsSync(ledgerPath)) throw new Error("Ledger already exists; baseline must not be overwritten.");
  const records = (values: Record<string, any>, isEntry: boolean) => Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { status: "pending", initialExplanationHash: digest(isEntry ? explanation(value) : value) }]));
  save({ version: 1, startedAt: "2026-10-27", scope: "All existing content/public entries, including additional original languages and noEquivalent reasons.", works: current.works, entries: records(current.entries, true), noEquivalent: records(current.noEquivalent, false) } as Ledger);
  console.log(`Initialized ${Object.keys(current.entries).length} entries and ${Object.keys(current.noEquivalent).length} noEquivalent reasons.`);
} else {
  noSymlink(ROOT, ledgerPath);
  const ledger: Ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
  const errors: string[] = [];
  if (digest(current.works) !== digest(ledger.works)) errors.push("Protected content or work inventory changed. Inspect against the baseline; do not reset it.");
  for (const group of ["entries", "noEquivalent"] as const) {
    if (digest(Object.keys(current[group]).sort()) !== digest(Object.keys(ledger[group]).sort())) errors.push(`${group}: inventory changed`);
    for (const [key, record] of Object.entries(ledger[group])) {
      const value = current[group][key];
      if (!value) continue;
      if (record.status === "checked") {
        if (digest(group === "entries" ? explanation(value) : value) !== record.checkedExplanationHash) errors.push(`${key}: changed after editorial check`);
        if (group === "entries" && (value.vocabulary.length < 3 || value.grammar.length < 2 || value.notes.length < 1) && !record.exception?.trim()) errors.push(`${key}: below standard counts without an exception rationale`);
      }
      if (group === "entries" && record.status !== "pending") {
        const localized = [...value.vocabulary.map((v: any) => v.meaning), ...value.grammar.map((g: any) => g.explanation), ...value.notes, ...(value.pronunciation?.note ? [value.pronunciation.note] : [])];
        if (localized.some(v => !v || typeof v !== "object" || !v.ja?.trim() || !v.en?.trim())) errors.push(`${key}: missing Japanese or English explanation`);
      }
    }
  }
  if (command === "mark") {
    // Stale checked hashes may be renewed only by an explicit mark command after re-reading.
    const structuralErrors = errors.filter(e => !e.includes("changed after editorial check") && !e.includes("below standard counts"));
    if (structuralErrors.length) throw new Error(structuralErrors.join("\n"));
    const status = args[0];
    if (!["pending", "written", "checked"].includes(status)) throw new Error("Expected pending, written, or checked.");
    const reasonIndex = args.indexOf("--reason");
    const keys = args.slice(1, reasonIndex < 0 ? undefined : reasonIndex);
    if (!keys.length) throw new Error("Provide explicit work/unit/language keys.");
    const reason = reasonIndex < 0 ? undefined : args[reasonIndex + 1];
    for (const key of keys) {
      const group = key in ledger.entries ? "entries" : "noEquivalent";
      const record = ledger[group][key];
      const value = current[group][key];
      if (!record || !value) throw new Error(`Unknown key: ${key}`);
      if (reason) record.exception = reason;
      if (status === "checked" && group === "entries" && (value.vocabulary.length < 3 || value.grammar.length < 2 || value.notes.length < 1) && !record.exception) throw new Error(`${key}: supply --reason for reduced counts.`);
      record.status = status as RecordState["status"];
      if (status === "checked") record.checkedExplanationHash = digest(group === "entries" ? explanation(value) : value);
      else delete record.checkedExplanationHash;
    }
    save(ledger);
    console.log(`Marked ${keys.length} records ${status}.`);
  } else if (command === "status" || command === "verify") {
    for (const id of Object.keys(ledger.works)) {
      const records = Object.entries(ledger.entries).filter(([key]) => key.startsWith(id + "/")).map(([, record]) => record);
      const counts = Object.fromEntries(["pending", "written", "checked"].map(s => [s, records.filter(r => r.status === s).length]));
      console.log(`${id}: ${JSON.stringify(counts)}`);
    }
    for (const group of ["entries", "noEquivalent"] as const) {
      const records = Object.values(ledger[group]);
      console.log(`${group}: ${records.filter(r => r.status === "checked").length}/${records.length} checked`);
      if (args.includes("--complete") && records.some(r => r.status !== "checked")) errors.push(`${group}: incomplete`);
    }
    if (errors.length) {
      console.error(errors.join("\n"));
      process.exitCode = 1;
    } else console.log(`Integrity OK: ${Object.keys(current.works).length} works / ${current.units} units. Counts and hashes do not establish linguistic quality.`);
  } else throw new Error(`Unknown command: ${command}`);
}
