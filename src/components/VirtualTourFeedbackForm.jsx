import { useState } from "react";

/**
 * VirtualTourFeedbackForm - reveals after 90% completion.
 *
 * Single optional textarea. Successful submit replaces the form with a
 * thank-you state. Submission failure is silent - we never error to the
 * visitor over a feedback save.
 */
export default function VirtualTourFeedbackForm({ prompt, onSubmit }) {
  const [value, setValue] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    const text = value.trim();
    if (!text) return;
    onSubmit(text);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="vt-feedback vt-feedback--done">
        <p>Thanks for letting us know.</p>
      </div>
    );
  }

  return (
    <form className="vt-feedback" onSubmit={handleSubmit}>
      <label className="vt-feedback-label" htmlFor="vt-feedback-text">
        {prompt}
      </label>
      <textarea
        id="vt-feedback-text"
        className="vt-feedback-textarea"
        rows={3}
        maxLength={2000}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Optional - a sentence or two is plenty."
      />
      <button type="submit" className="btn vt-feedback-submit" disabled={!value.trim()}>
        Send to Hugo
      </button>
    </form>
  );
}
