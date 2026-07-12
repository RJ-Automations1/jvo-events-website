import { Link } from "react-router-dom";
import PublicShell from "@/components/cbe/PublicShell";

/**
 * Public CBE landing — the front door. Vendors and students start their own
 * application here; staff head to the login. Everything they submit flows to
 * the staff master dashboard.
 */
export default function CbeLanding() {
  return (
    <PublicShell>
      <div className="cbe-hero">
        <img src="/cbe/cbe-mark.svg" alt="CBE" />
        <h1>Welcome to the CBE Portal</h1>
        <p>
          The Center for Black Entrepreneurship works with vendors and students across our
          programs. Choose how you'd like to get started below — your information goes straight
          to our team.
        </p>
      </div>

      <div className="cbe-choices">
        <Link to="/cbe/apply/vendor" className="cbe-choice vendor">
          <span className="ico" aria-hidden="true">🤝</span>
          <h2>I'm a Vendor</h2>
          <p>
            Provide services to CBE? Submit your vendor information, documents, and payment
            details to begin onboarding.
          </p>
          <span className="go">Start vendor application →</span>
        </Link>

        <Link to="/cbe/apply/student" className="cbe-choice student">
          <span className="ico" aria-hidden="true">🎓</span>
          <h2>I'm a Student</h2>
          <p>
            Participating in a CBE program? Submit your student information to get set up and
            tracked through the process.
          </p>
          <span className="go">Start student application →</span>
        </Link>

        <Link to="/cbe/login" className="cbe-choice staff">
          <span className="ico" aria-hidden="true">🔒</span>
          <h2>CBE Staff</h2>
          <p>
            Program managers and leadership — sign in to the admin dashboard to review and track
            every applicant.
          </p>
          <span className="go">Staff login →</span>
        </Link>
      </div>
    </PublicShell>
  );
}
