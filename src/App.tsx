import { useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import Home from "@/pages/Home";
import Gallery from "@/pages/Gallery";
import About from "@/pages/About";
import Contact from "@/pages/Contact";
import Testimonials from "@/pages/Testimonials";
import Book from "@/pages/Book";
import NotFound from "@/pages/NotFound";

/** Scroll to top on every route change. */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/gallery" element={<Gallery />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/testimonials" element={<Testimonials />} />
        <Route path="/book" element={<Book />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}
