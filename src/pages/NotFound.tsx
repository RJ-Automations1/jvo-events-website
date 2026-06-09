import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function NotFound() {
  return (
    <div style={{ background: "#080808", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Navbar />
      <section className="flex-1 flex items-center justify-center px-6" style={{ paddingTop: "6rem" }}>
        <div className="text-center">
          <p
            className="text-white/40 text-xs tracking-[0.3em] uppercase mb-3"
            style={{ fontFamily: "'Lato', sans-serif" }}
          >
            Page Not Found
          </p>
          <h1
            className="text-white text-6xl font-bold mb-4"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            404
          </h1>
          <p
            className="text-white/50 text-base mb-8"
            style={{ fontFamily: "'Lato', sans-serif" }}
          >
            The page you're looking for doesn't exist.
          </p>
          <Link to="/" className="btn-white inline-block">
            Back Home
          </Link>
        </div>
      </section>
      <Footer />
    </div>
  );
}
