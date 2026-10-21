import { useState } from "react";
import { type Intake } from "../data/types";
import { type ChoiceQuestion, INTAKE_SECTIONS, type IntakeSection, OTHER_MAX, type YesNoQuestion } from "../lib/intake";

/**
 * The joining-form questions (fitness goals, health, workout preferences, feedback).
 * Public registration: `required`. Owner's member form: optional, so answers can be added later.
 */
export function IntakeFields({ value, onChange, required, idPrefix, sectionClass = "register-section" }: { value: Intake; onChange: (patch: Intake) => void; required: boolean; idPrefix: string; sectionClass?: string }) {
  return <>{INTAKE_SECTIONS.map((section) => <div className="intake-section" key={section.title}>
    <h2 className={sectionClass}>{section.title}</h2>
    <SectionQuestions section={section} value={value} onChange={onChange} required={required} idPrefix={idPrefix}/>
  </div>)}</>;
}

/** The questions of one section (one step of the public form). */
export function SectionQuestions({ section, value, onChange, required, idPrefix }: { section: IntakeSection; value: Intake; onChange: (patch: Intake) => void; required: boolean; idPrefix: string }) {
  return <>{section.questions.map((q) => q.kind === "choice"
    ? <ChoiceField key={q.key} q={q} value={value[q.key] ?? ""} onChange={(v) => onChange({ [q.key]: v })} required={required} name={`${idPrefix}-${q.key}`}/>
    : <YesNoField key={q.key} q={q} value={value[q.key]} onChange={(v) => onChange({ [q.key]: v })} required={required} name={`${idPrefix}-${q.key}`}/>)}</>;
}

const Legend = ({ label, required }: { label: string; required: boolean }) => <legend>{label}{required ? <> <i>*</i></> : <> <small>Optional</small></>}</legend>;

function ChoiceField({ q, value, onChange, required, name }: { q: ChoiceQuestion; value: string; onChange: (v: string) => void; required: boolean; name: string }) {
  // "Other" is on when the saved answer isn't one of the options, or after picking it (text still empty).
  const [otherPicked, setOtherPicked] = useState(false);
  const isOther = q.other && (otherPicked || (value !== "" && !q.options.includes(value)));
  return <fieldset className="choice-field">
    <Legend label={q.label} required={required}/>
    <div className="choice-list">
      {q.options.map((o) => <label key={o} className={!isOther && value === o ? "selected" : ""}><input type="radio" name={name} checked={!isOther && value === o} onChange={() => { setOtherPicked(false); onChange(o); }}/><span>{o}</span></label>)}
      {q.other && <label className={`choice-other ${isOther ? "selected" : ""}`}><input type="radio" name={name} checked={isOther} onChange={() => { setOtherPicked(true); onChange(""); }}/><span>Other:</span>
        <input type="text" aria-label={`${q.label} (other)`} maxLength={OTHER_MAX} value={isOther ? value : ""} onFocus={() => { if (!isOther) { setOtherPicked(true); onChange(""); } }} onChange={(e) => { setOtherPicked(true); onChange(e.target.value); }} placeholder="Type your answer"/></label>}
    </div>
  </fieldset>;
}

function YesNoField({ q, value, onChange, required, name }: { q: YesNoQuestion; value: boolean | undefined; onChange: (v: boolean) => void; required: boolean; name: string }) {
  return <fieldset className="choice-field">
    <Legend label={q.label} required={required}/>
    <div className="choice-list inline">
      {([[true, "Yes"], [false, "No"]] as const).map(([v, label]) => <label key={label} className={value === v ? "selected" : ""}><input type="radio" name={name} checked={value === v} onChange={() => onChange(v)}/><span>{label}</span></label>)}
    </div>
  </fieldset>;
}
