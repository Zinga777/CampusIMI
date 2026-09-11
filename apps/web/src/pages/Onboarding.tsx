import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api.js";
import { useConfig } from "../lib/config-context.js";
import { useAuth } from "../lib/auth-context.js";
import { fallbackAvatarDataUri } from "../lib/avatar.js";
import AiSuggestButton from "../components/AiSuggestButton.js";

export default function Onboarding() {
  const config = useConfig();
  const navigate = useNavigate();
  const { refresh } = useAuth();

  const [academicStatus, setAcademicStatus] = useState("");
  const [gender, setGender] = useState("");
  const [bio, setBio] = useState("");
  const [course, setCourse] = useState("");
  const [interestInput, setInterestInput] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [previewName] = useState(() => `Preview${Math.floor(Math.random() * 900 + 100)}`);

  function addInterest() {
    const value = interestInput.trim();
    if (value && interests.length < 10 && !interests.includes(value)) {
      setInterests([...interests, value]);
    }
    setInterestInput("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!academicStatus) {
      setError("Please select your academic status.");
      return;
    }
    if (!gender) {
      setError("Please select a gender option.");
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/profile", {
        academicStatus,
        gender,
        bio: bio.trim() || null,
        course: course.trim() || null,
        interests,
      });
      await refresh();
      navigate("/feed");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!config) return null;

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-8">
          <img
            src={fallbackAvatarDataUri(previewName)}
            alt=""
            className="mx-auto w-16 h-16 rounded-full mb-3"
          />
          <h1 className="text-2xl font-semibold text-campus-900">Set up your anonymous profile</h1>
          <p className="mt-2 text-campus-600">
            Your real name and email are never shown to other students. We'll assign you an
            anonymous display name automatically.
          </p>
        </div>

        <form onSubmit={onSubmit} className="rounded-xl2 bg-white border border-campus-100 p-8 space-y-6">
          <div>
            <label className="block text-sm font-medium text-campus-700 mb-2">
              Academic status <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-3">
              {config.academicStatusOptions.map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => setAcademicStatus(opt.value)}
                  className={`px-4 py-2 rounded-full border text-sm font-medium transition ${
                    academicStatus === opt.value
                      ? "bg-campus-700 text-white border-campus-700"
                      : "border-campus-200 text-campus-700 hover:bg-campus-100"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-campus-700 mb-2">
              Gender <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-3">
              {config.genderOptions.map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => setGender(opt.value)}
                  className={`px-4 py-2 rounded-full border text-sm font-medium transition ${
                    gender === opt.value
                      ? "bg-campus-700 text-white border-campus-700"
                      : "border-campus-200 text-campus-700 hover:bg-campus-100"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-campus-700 mb-1">Course (optional)</label>
            <input
              type="text"
              value={course}
              onChange={(e) => setCourse(e.target.value)}
              placeholder="e.g. Computer Science"
              className="w-full rounded-lg border border-campus-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-campus-400"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-campus-700">
                Bio (optional, up to {config.limits.maxBioLength} characters)
              </label>
              <AiSuggestButton
                label="Suggest a bio"
                endpoint="/ai/bio"
                body={{ interests, course: course || undefined }}
                onPick={setBio}
              />
            </div>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={config.limits.maxBioLength}
              rows={3}
              placeholder="Tell people a little about you — anonymously."
              className="w-full rounded-lg border border-campus-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-campus-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-campus-700 mb-1">Interests (optional)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={interestInput}
                onChange={(e) => setInterestInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addInterest();
                  }
                }}
                placeholder="Add a tag and press Enter"
                className="flex-1 rounded-lg border border-campus-200 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-campus-400"
              />
              <button
                type="button"
                onClick={addInterest}
                className="px-4 rounded-lg border border-campus-200 text-campus-700 hover:bg-campus-100"
              >
                Add
              </button>
            </div>
            {interests.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {interests.map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1 rounded-full bg-campus-100 text-campus-700 text-sm flex items-center gap-2"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => setInterests(interests.filter((t) => t !== tag))}
                      className="text-campus-500 hover:text-campus-800"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-campus-700 text-white font-medium py-2.5 hover:bg-campus-800 transition disabled:opacity-60"
          >
            {submitting ? "Setting up…" : "Enter CampusIMI"}
          </button>
        </form>
      </div>
    </div>
  );
}
